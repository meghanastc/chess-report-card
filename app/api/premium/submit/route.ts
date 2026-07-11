import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { generatePremiumSections } from "@/lib/groq";
import { lookupRepertoire } from "@/lib/repertoire";
import { lookupBooks } from "@/lib/books";
import { lookupPrice } from "@/lib/pricing";
import { savePendingReport } from "@/lib/kv";
import { PremiumAnalysis, PremiumIntake, PremiumReportRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RequestBody {
  intake: PremiumIntake;
  analysis: PremiumAnalysis;
}

function ecoRefLabel(ref: { eco: string; name: string } | null): string {
  return ref ? `${ref.eco} — ${ref.name}` : "No fixed table for this rating band";
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { intake, analysis } = body;
  if (!intake?.username || !intake?.rating || !analysis?.games) {
    return NextResponse.json({ error: "Missing intake or analysis data" }, { status: 400 });
  }

  try {
    const repertoire = lookupRepertoire(intake.rating);
    const books = lookupBooks(intake.rating);
    const price = lookupPrice(intake.rating);

    const sections = await generatePremiumSections({
      intake: {
        username: intake.username,
        rating: intake.rating,
        format: intake.format,
        ageBracket: intake.ageBracket,
        goal: intake.goal,
        openingsPlayed: intake.openingsPlayed,
      },
      games: analysis.games.map((g) => ({
        index: g.index + 1,
        opponent: g.playerColor === "w" ? g.black : g.white,
        result: g.result,
        opening: g.opening,
        eco: g.eco,
        accuracy: g.accuracy,
        blunders: g.blunders,
        mistakes: g.mistakes,
        inaccuracies: g.inaccuracies,
        lowTimeMistakes: g.lowTimeMistakes,
        divergenceSummary: g.divergence
          ? `Left the main line on move ${g.divergence.moveNumber} (played ${g.divergence.actualMove} instead of ${g.divergence.bookMove}) — this was ${g.divergence.wasFine ? "a fine choice, engine still liked their position" : "a real mistake, the engine score dropped"}.`
          : "Stayed on well-known opening theory for the moves we could match.",
        worstMovesSummary: g.flaggedMoves
          .slice()
          .sort((a, b) => b.winPercentLoss - a.winPercentLoss)
          .slice(0, 3)
          .map((m) => `move ${m.moveNumber} (${m.san}, ${m.severity}, ${m.phase})`)
          .join("; ") || "no significant mistakes flagged",
      })),
      phaseBreakdown: analysis.phaseBreakdown,
      repertoire: {
        forWhite: ecoRefLabel(repertoire.forWhite),
        vsE4: ecoRefLabel(repertoire.vsE4AsBlack),
        vsD4: ecoRefLabel(repertoire.vsD4AsBlack),
        bespoke: repertoire.bespoke,
      },
    });

    const record: PremiumReportRecord = {
      id: randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      intake,
      analysis,
      sections,
      repertoireLabel: repertoire.label,
      repertoireForWhite: repertoire.forWhite ? ecoRefLabel(repertoire.forWhite) : null,
      repertoireVsE4: repertoire.vsE4AsBlack ? ecoRefLabel(repertoire.vsE4AsBlack) : null,
      repertoireVsD4: repertoire.vsD4AsBlack ? ecoRefLabel(repertoire.vsD4AsBlack) : null,
      repertoireBespoke: repertoire.bespoke,
      books: books.books,
      priceInr: price.priceInr,
    };

    await savePendingReport(record);

    return NextResponse.json({ reportId: record.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not submit Premium report" },
      { status: 500 }
    );
  }
}
