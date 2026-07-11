// Real ECO/opening/variation lookup, backed by Lichess's open-source
// "chess-openings" dataset (data/openings.json — ~3790 named lines). Two
// things live here:
//
// 1. lookupOpening() / resolveOpeningName(): longest-matching-prefix lookup
//    so each game gets the deepest named variation its actual moves reach.
// 2. findMainLineDivergence(): a frequency-based "opening tree" built from
//    every row in the dataset (not just one terminal line), so we can tell
//    — at any prefix depth — what the single most common/well-established
//    next move is ("book move" per the Developer Spec's glossary), and flag
//    the first ply where the player's actual move wasn't that move.
import openingsData from "@/data/openings.json";

interface OpeningRow {
  eco: string;
  name: string;
  pgn: string;
}

interface ParsedRow {
  eco: string;
  name: string;
  moves: string[];
}

const ROWS = openingsData as OpeningRow[];

function parsePgnMoves(pgn: string): string[] {
  return pgn
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

let parsedRowsCache: ParsedRow[] | null = null;

function getParsedRows(): ParsedRow[] {
  if (parsedRowsCache) return parsedRowsCache;
  parsedRowsCache = ROWS.map((r) => ({
    eco: r.eco,
    name: r.name,
    moves: parsePgnMoves(r.pgn),
  }));
  return parsedRowsCache;
}

export function openingKeyFromSignature(sanMoves: string[]): string {
  const first = sanMoves.slice(0, 4).join(" ");
  return first || "Unknown opening";
}

export interface OpeningMatch {
  eco: string;
  name: string;
  matchedPly: number;
}

/**
 * Longest-matching-prefix lookup against the real openings dataset: returns
 * the deepest named row whose full move list is a prefix of the game's
 * actual moves.
 */
export function lookupOpening(sanMoves: string[]): OpeningMatch | null {
  let best: OpeningMatch | null = null;
  for (const row of getParsedRows()) {
    if (row.moves.length === 0 || row.moves.length > sanMoves.length) continue;
    if (best && row.moves.length <= best.matchedPly) continue;
    let matches = true;
    for (let i = 0; i < row.moves.length; i++) {
      if (row.moves[i] !== sanMoves[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      best = { eco: row.eco, name: row.name, matchedPly: row.moves.length };
    }
  }
  return best;
}

/**
 * Back-compat wrapper: prefers the real dataset match, falls back to PGN
 * header data (Opening/ECO), then to a first-moves signature so games can
 * still be grouped together even with no header data and no dataset match.
 */
export function resolveOpeningName(
  headers: Record<string, string>,
  sanMoves: string[]
): { name: string; eco?: string } {
  const match = lookupOpening(sanMoves);
  if (match) return { name: match.name, eco: match.eco };

  const name = headers["Opening"];
  const eco = headers["ECO"];
  if (name) return { name: eco ? `${name} (${eco})` : name, eco };
  if (eco) return { name: `ECO ${eco}`, eco };
  return { name: openingKeyFromSignature(sanMoves) };
}

// ---------- Frequency-based opening tree (main line / book move) ----------

type NextMoveCounts = Map<string, Map<string, number>>; // prefix key -> move -> count

let nextMoveCountsCache: NextMoveCounts | null = null;

function prefixKey(sanMoves: string[], upToPly: number): string {
  return sanMoves.slice(0, upToPly).join(" ");
}

function getNextMoveCounts(): NextMoveCounts {
  if (nextMoveCountsCache) return nextMoveCountsCache;
  const map: NextMoveCounts = new Map();
  for (const row of getParsedRows()) {
    let prefix = "";
    for (const move of row.moves) {
      let counts = map.get(prefix);
      if (!counts) {
        counts = new Map();
        map.set(prefix, counts);
      }
      counts.set(move, (counts.get(move) || 0) + 1);
      prefix = prefix ? `${prefix} ${move}` : move;
    }
  }
  nextMoveCountsCache = map;
  return map;
}

export function bestNextMove(prefix: string): string | null {
  const counts = getNextMoveCounts().get(prefix);
  if (!counts || counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [move, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = move;
    }
  }
  return best;
}

export interface MainLineDivergence {
  ply: number;
  bookMove: string;
  actualMove: string;
}

/**
 * Walks the player's actual moves ply by ply against the frequency tree.
 * Returns the first ply where the actual move wasn't the single most
 * common/well-established next move recorded in the dataset for that
 * prefix — or null if the player either matched the main line the whole
 * way, or moved past the point where the dataset has any recorded theory
 * at all (nothing left to compare against, so no divergence to report).
 */
export function findMainLineDivergence(sanMoves: string[]): MainLineDivergence | null {
  const tree = getNextMoveCounts();
  for (let ply = 0; ply < sanMoves.length; ply++) {
    const prefix = prefixKey(sanMoves, ply);
    const counts = tree.get(prefix);
    if (!counts || counts.size === 0) return null;

    const actualMove = sanMoves[ply];
    const best = bestNextMove(prefix);
    if (best && best !== actualMove) {
      return { ply, bookMove: best, actualMove };
    }
  }
  return null;
}
