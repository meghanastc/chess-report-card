import { NextRequest, NextResponse } from "next/server";
import {
  chesscomUserExists,
  fetchChesscomGames,
  fetchLichessGames,
  lichessUserExists,
} from "@/lib/fetchers";
import { GamesResponse, Platform } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim();
  const platformParam = (searchParams.get("platform") || "auto") as
    | Platform
    | "auto";
  const max = Math.min(
    Math.max(parseInt(searchParams.get("max") || "10", 10) || 10, 5),
    15
  );

  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  try {
    let platform: Platform;

    if (platformParam === "lichess" || platformParam === "chesscom") {
      platform = platformParam;
    } else {
      const [onLichess, onChesscom] = await Promise.all([
        lichessUserExists(username),
        chesscomUserExists(username),
      ]);
      if (onLichess) platform = "lichess";
      else if (onChesscom) platform = "chesscom";
      else
        return NextResponse.json(
          { error: `No player named "${username}" found on Lichess or Chess.com` },
          { status: 404 }
        );
    }

    const games =
      platform === "lichess"
        ? await fetchLichessGames(username, max)
        : await fetchChesscomGames(username, max);

    if (!games.length) {
      return NextResponse.json(
        { error: `No recent games found for "${username}" on ${platform}` },
        { status: 404 }
      );
    }

    const payload: GamesResponse = { username, platform, games };
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error fetching games" },
      { status: 500 }
    );
  }
}
