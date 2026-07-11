import { NextRequest, NextResponse } from "next/server";
import { generateFreeTierInsights, FreeTierGameInput, FreeTierPatternInput } from "@/lib/groq";
import { getFreeTierUsage, incrementFreeTierUsage } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RequestBody {
  username: string;
  platform: "lichess" | "chesscom";
  patterns: FreeTierPatternInput[];
  games: FreeTierGameInput[];
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, platform, patterns, games } = body;
  if (
    !username?.trim() ||
    (platform !== "lichess" && platform !== "chesscom") ||
    !Array.isArray(patterns) ||
    !Array.isArray(games)
  ) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  try {
    // Re-check the cap right before spending an LLM call — the client is
    // expected to have already checked /api/free/usage before running the
    // (expensive, client-side) engine analysis, but we never trust the
    // client alone for the thing that actually costs us money.
    const before = await getFreeTierUsage(platform, username);
    if (before.blocked) {
      return NextResponse.json(
        { blocked: true, used: before.used, remaining: 0 },
        { status: 403 }
      );
    }

    const insights = await generateFreeTierInsights(username, patterns, games);
    const after = await incrementFreeTierUsage(platform, username);

    return NextResponse.json({
      blocked: false,
      patternExplanations: insights.patternExplanations,
      verdicts: insights.verdicts,
      used: after.used,
      remaining: after.remaining,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not generate insights" },
      { status: 500 }
    );
  }
}
