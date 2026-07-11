import { NextRequest, NextResponse } from "next/server";
import { getFreeTierUsage } from "@/lib/kv";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim();
  const platform = searchParams.get("platform");

  if (!username || (platform !== "lichess" && platform !== "chesscom")) {
    return NextResponse.json(
      { error: "username and platform (lichess|chesscom) are required" },
      { status: 400 }
    );
  }

  try {
    const status = await getFreeTierUsage(platform, username);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not check usage" },
      { status: 500 }
    );
  }
}
