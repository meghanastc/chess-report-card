import { Platform, RawGame } from "./types";

const UA = "chess-report-card-mvp (contact: meghanavishaal@gmail.com)";

function splitPgnBlob(blob: string): string[] {
  const trimmed = blob.trim();
  if (!trimmed) return [];
  // Games are separated by a blank line between the end of one movetext
  // and the "[Event" tag of the next.
  const parts = trimmed.split(/\n\n(?=\[Event )/g);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export async function lichessUserExists(username: string): Promise<boolean> {
  const res = await fetch(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`,
    { headers: { "User-Agent": UA }, cache: "no-store" }
  );
  return res.ok;
}

export async function chesscomUserExists(username: string): Promise<boolean> {
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(
      username.toLowerCase()
    )}`,
    { headers: { "User-Agent": UA }, cache: "no-store" }
  );
  return res.ok;
}

export async function fetchLichessGames(
  username: string,
  max: number
): Promise<RawGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(
    username
  )}?max=${max}&clocks=true&opening=true&evals=false&pgnInJson=false`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/x-chess-pgn",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Lichess API error (${res.status})`);
  }
  const blob = await res.text();
  return splitPgnBlob(blob).map((pgn) => ({ pgn, source: "lichess" as Platform }));
}

export async function fetchChesscomGames(
  username: string,
  max: number
): Promise<RawGame[]> {
  const uname = username.toLowerCase();
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(
      uname
    )}/games/archives`,
    { headers: { "User-Agent": UA }, cache: "no-store" }
  );
  if (!archivesRes.ok) {
    throw new Error(`Chess.com API error (${archivesRes.status})`);
  }
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  if (!archives?.length) return [];

  const collected: RawGame[] = [];
  // Walk archives from most recent backwards until we have enough games.
  for (let i = archives.length - 1; i >= 0 && collected.length < max; i--) {
    const monthRes = await fetch(archives[i], {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!monthRes.ok) continue;
    const data = (await monthRes.json()) as { games: { pgn?: string; url?: string }[] };
    const monthGames = (data.games || [])
      .filter((g) => g.pgn)
      .map((g) => ({ pgn: g.pgn as string, source: "chesscom" as Platform, url: g.url }));
    // Most recent games are at the end of each month's array.
    collected.unshift(...monthGames);
  }
  return collected.slice(-max).reverse(); // newest first
}
