// Rule-based mistake CATEGORY classifier (distinct from severity — see
// classifySeverity() in analyze.ts, which only measures *how bad* a move
// was via eval swing). This module labels *what kind* of mistake it was,
// per the Developer Spec section 1.2 step 3. Starts with the three example
// categories from the spec plus a couple of sensible fallbacks; designed to
// grow as real data reveals more patterns ("add more categories as you see
// real data").
import { EvalResult } from "./engine";
import { Phase } from "./types";

export type MistakeCategory =
  | "Lost a piece for nothing"
  | "Missed a checkmate or big tactic"
  | "Made bad moves while low on time"
  | "Weak opening moves"
  | "Endgame technique slip"
  | "Positional mistake";

export interface CategoryContext {
  phase: Phase;
  evalBeforeSelf: EvalResult; // from the MOVER's perspective (mate > 0 = mover has forced mate)
  evalAfterSelf: EvalResult; // same perspective, right after the mover's move
  materialBeforeSelf: number; // sum of piece values still on board for the mover, before their move
  materialTwoPlyLaterSelf: number; // same count, two plies later (after opponent's actual reply)
  ownMoveCaptureValue: number; // value of whatever the mover's own move captured, 0 if none
  clockSecondsRemaining?: number; // mover's clock right after this move, if known
  startClockSeconds?: number; // base time control in seconds, if known
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function countMaterial(fen: string, color: "w" | "b"): number {
  const boardPart = fen.split(" ")[0];
  let total = 0;
  for (const ch of boardPart) {
    if (ch === "/" || /\d/.test(ch)) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((isWhite ? "w" : "b") !== color) continue;
    total += PIECE_VALUES[ch.toLowerCase()] ?? 0;
  }
  return total;
}

export function parseClockSeconds(clkStr: string): number {
  const m = clkStr.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const [, h, mnt, s] = m;
  return parseInt(h, 10) * 3600 + parseInt(mnt, 10) * 60 + parseFloat(s);
}

/**
 * Extracts remaining clock time (in seconds) from Lichess/Chess.com-style
 * `{[%clk H:MM:SS]}` PGN move comments, in ply order (one entry per ply that
 * has a clock comment; games without clock data return an empty array).
 */
export function extractClockSeconds(pgn: string): number[] {
  const regex = /\{\[%clk\s*([\d:.]+)\]\}/g;
  const clocks: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(pgn))) {
    clocks.push(parseClockSeconds(m[1]));
  }
  return clocks;
}

export function parseStartClockSeconds(timeControl?: string): number | undefined {
  if (!timeControl) return undefined;
  const m = timeControl.match(/^(\d+)/);
  if (!m) return undefined;
  return parseInt(m[1], 10);
}

export function pieceValue(letter?: string): number {
  if (!letter) return 0;
  return PIECE_VALUES[letter.toLowerCase()] ?? 0;
}

export function classifyMistakeCategory(ctx: CategoryContext): MistakeCategory {
  // 1. Had forced mate on the board and let it slip (or missed a similarly
  //    game-swinging tactic) with this move.
  const hadMateBefore =
    ctx.evalBeforeSelf.mate !== undefined && ctx.evalBeforeSelf.mate > 0;
  const stillHasMateAfter =
    ctx.evalAfterSelf.mate !== undefined && ctx.evalAfterSelf.mate > 0;
  if (hadMateBefore && !stillHasMateAfter) {
    return "Missed a checkmate or big tactic";
  }

  // 2. Material simply disappeared within a couple of plies, and the
  //    mover's own move wasn't a roughly-equal trade that would explain it.
  const materialDrop = ctx.materialBeforeSelf - ctx.materialTwoPlyLaterSelf;
  if (materialDrop >= 3 && ctx.ownMoveCaptureValue < materialDrop - 1) {
    return "Lost a piece for nothing";
  }

  // 3. Running low on the clock when the mistake happened.
  if (
    ctx.clockSecondsRemaining !== undefined &&
    ctx.startClockSeconds !== undefined &&
    ctx.startClockSeconds > 0
  ) {
    const lowAbsolute = ctx.clockSecondsRemaining <= 30;
    const lowRelative = ctx.clockSecondsRemaining <= ctx.startClockSeconds * 0.1;
    if (lowAbsolute || lowRelative) return "Made bad moves while low on time";
  }

  // 4. Fall back to a phase-based label so every flagged move still gets a
  //    sensible category.
  if (ctx.phase === "opening") return "Weak opening moves";
  if (ctx.phase === "endgame") return "Endgame technique slip";
  return "Positional mistake";
}
