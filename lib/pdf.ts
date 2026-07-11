import jsPDF from "jspdf";
import { Report } from "./types";

export interface FreeTierInsightsForPdf {
  patternExplanations: string[];
  verdicts: string[];
}

function formatDateRange(report: Report): string {
  const rawDates = report.games.map((g) => g.date).filter(Boolean) as string[];
  const parsed = rawDates
    .map((d) => new Date(d.replace(/\./g, "-")))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (parsed.length === 0) return "recent games";
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  return first.getTime() === last.getTime() ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

/**
 * Exact 1-page (usually) Free Tier PDF per Developer Spec 1.3: header with
 * username + date range, "Your Top 3 Patterns", "Game-by-Game Verdicts"
 * (ECO + opening prefix), a static footer advertising Premium, and a
 * translucent diagonal "FREE VERSION" watermark on every page.
 */
export function generateFreeReportPdf(report: Report, insights: FreeTierInsightsForPdf): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const drawWatermark = () => {
    doc.saveGraphicsState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(58);
    doc.setTextColor(150, 20, 20);
    doc.text("FREE VERSION", pageWidth / 2, pageHeight / 2, {
      angle: 35,
      align: "center",
    } as any);
    doc.restoreGraphicsState();
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin - 34) {
      doc.addPage();
      drawWatermark();
      y = margin;
    }
  };

  const line = (
    text: string,
    opts: { size?: number; bold?: boolean; gap?: number; color?: [number, number, number] } = {}
  ) => {
    const { size = 10.5, bold = false, gap = 14, color = [25, 25, 25] } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    wrapped.forEach((w: string) => {
      ensureSpace(gap);
      doc.text(w, margin, y);
      y += gap;
    });
  };

  drawWatermark();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text("AI Chess Report Card", margin, y);
  y += 24;
  line(
    `${report.username} (${report.platform === "lichess" ? "Lichess" : "Chess.com"}) — ${formatDateRange(report)}`,
    { size: 10.5, color: [80, 80, 80], gap: 16 }
  );
  line(
    `${report.gamesAnalyzed} games analyzed · record ${report.record.wins}W-${report.record.losses}L-${report.record.draws}D · avg. accuracy ${report.averageAccuracy}%`,
    { size: 10, color: [80, 80, 80], gap: 22 }
  );

  // Your Top 3 Patterns
  line("Your Top 3 Patterns", { size: 14, bold: true, gap: 18 });
  if (report.topPatterns.length === 0) {
    line("No recurring mistake patterns found in these games — nice and clean!", {
      size: 10,
      gap: 14,
    });
  } else {
    report.topPatterns.forEach((p, i) => {
      line(`${i + 1}. ${p.category} (${p.count}x)`, { bold: true, size: 10.5, gap: 13 });
      const explanation = insights.patternExplanations[i];
      if (explanation) line(explanation, { size: 9.5, gap: 13 });
    });
  }
  y += 8;

  // Game-by-Game Verdicts
  line("Game-by-Game Verdicts", { size: 14, bold: true, gap: 18 });
  report.games.forEach((g, i) => {
    const opponent = g.playerColor === "w" ? g.black : g.white;
    const prefix = g.eco ? `${g.eco} — ${g.opening}` : g.opening;
    line(`Game ${i + 1} vs ${opponent} — ${g.result.toUpperCase()} — ${prefix}`, {
      bold: true,
      size: 10,
      gap: 13,
    });
    const verdict = insights.verdicts[i];
    if (verdict) line(verdict, { size: 9.5, gap: 14 });
  });

  // Static footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Free tier report — limited to 3 free reports per username. Upgrade to Premium for a full 15-game, " +
        "human-reviewed report with opening repertoire and book recommendations.",
      margin,
      pageHeight - 24,
      { maxWidth: pageWidth - margin * 2 }
    );
  }

  doc.save(`chess-report-card-${report.username}.pdf`);
}
