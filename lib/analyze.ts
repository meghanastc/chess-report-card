import { Chess } from "chess.js";
import { ChessEngine, EvalResult } from "./engine";
import { lookupOpening, resolveOpeningName } from "./openings";
import {
  CategoryContext,
  classifyMistakeCategory,
  countMaterial,
  extractClockSeconds,
  parseStartClockSeconds,
  pieceValue,
} from "./mistakeCategories";
import {
  AnalysisProgress,
  FlaggedMove,
  GameSummary,
  PatternSummary,
  Phase,
  RawGame,
  Report,
  Severity,
} from "./types";

const MAX_PLIES_ANALYZED = 60; // ~30 full moves/game keeps runtime reasonable client-side
const ENGINE_DEPTH = 10;
const TOP_MISTAKES_PER_GAME = 3; // Developer Spec 1.2 step 3
const TOP_PATTERNS_COUNT = 3; // Developer Spec 1.2 step 4

// Standard win% conversion (the same logistic curve Lichess uses) so the
// "accuracy" number below means the same thing chess players already expect.
function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Chess.com's published accuracy formula: converts a win% drop on a single
// move into a 0-100 accuracy score for that move.
function moveAccuracy(winPercentLoss: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * Math.max(0, winPercentLoss)) - 3.1668;
  return Math.max(0, Math.min(100, acc));
}

function classifySeverity(winPercentLoss: number): Severity | null {
  if (winPercentLoss >= 20) return "blunder";
  if (winPercentLoss >= 10) return "mistake";
  if (winPercentLoss >= 5) return "inaccuracy";
  return null;
}

function phaseForPly(ply: number, totalPlies: number): Phase {
  if (ply <= 20) return "opening";
  if (ply >= totalPlies - 16) return "endgame";
  return "middlegame";
}

interface CandidateMove extends FlaggedMove {}

/**
 * Free Tier pipeline (Developer Spec 1.1-1.2): for each of the player's own
 * moves, tracks the engine eval and board FEN before/after so we can both
 * measure how bad a move was (severity, via win% swing) and classify what
 * *kind* of mistake it was (category, via lib/mistakeCategories.ts). Keeps
 * only the worst 3 flagged moves per game, then aggregates the categories
 * across all games into the top 3 recurring patterns.
 */
export async function analyzeGames(
  username: string,
  platform: "lichess" | "chesscom",
  rawGames: RawGame[],
  onProgress: (p: AnalysisProgress) => void
): Promise<Report> {
  const engine = new ChessEngine();
  onProgress({ stage: "analyzing", message: "Starting local chess engine…" });
  await engine.init();

  const gameSummaries: GameSummary[] = [];
  const allTopMistakes: CandidateMove[] = [];
  const phaseTotals: Record<Phase, number> = {
    opening: 0,
    middlegame: 0,
    endgame: 0,
  };

  for (let gi = 0; gi < rawGames.length; gi++) {
    const raw = rawGames[gi];
    const chess = new Chess();
    try {
      chess.loadPgn(raw.pgn);
    } catch {
      continue; // skip malformed PGN rather than fail the whole report
    }
    const headers = chess.getHeaders();
    const white = headers["White"] || "White";
    const black = headers["Black"] || "Black";
    const playerColor: "w" | "b" =
      white.toLowerCase() === username.toLowerCase() ? "w" : "b";

    const history = chess.history({ verbose: true });
    const totalPlies = Math.min(history.length, MAX_PLIES_ANALYZED);
    const sanMoves = history.map((h) => h.san);
    const { name: openingName, eco } = resolveOpeningName(headers, sanMoves);
    const openingMatch = lookupOpening(sanMoves);

    const clocks = extractClockSeconds(raw.pgn);
    const startClockSeconds = parseStartClockSeconds(headers["TimeControl"]);

    // Replay the game move by move, evaluating every position once and
    // recording both the eval and the resulting FEN (fenByPly[k] = position
    // after k plies played; fenByPly[0] = starting position).
    const replay = new Chess();
    const evalByPly: EvalResult[] = [{ cp: 0 }];
    const fenByPly: string[] = [replay.fen()];

    for (let ply = 0; ply < totalPlies; ply++) {
      const move = history[ply];
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const evalRes = await engine.evaluateFen(replay.fen(), ENGINE_DEPTH);
      evalByPly.push(evalRes);
      fenByPly.push(replay.fen());
      onProgress({
        stage: "analyzing",
        message: `Analyzing ${username}'s games…`,
        gameIndex: gi + 1,
        gameTotal: rawGames.length,
        plyIndex: ply + 1,
        plyTotal: totalPlies,
      });
    }

    let blunders = 0,
      mistakes = 0,
      inaccuracies = 0;
    const moveAccuracies: number[] = [];
    const candidates: CandidateMove[] = [];

    for (let ply = 0; ply < totalPlies; ply++) {
      const mover = ply % 2 === 0 ? "w" : "b";
      if (mover !== playerColor) continue;
      const sign = playerColor === "w" ? 1 : -1;

      const before = evalByPly[ply].cp * sign;
      const after = evalByPly[ply + 1].cp * sign;
      const wpLoss = Math.max(0, winPercent(before) - winPercent(after));
      moveAccuracies.push(moveAccuracy(wpLoss));

      const severity = classifySeverity(wpLoss);
      if (!severity) continue;

      const phase = phaseForPly(ply, totalPlies);
      phaseTotals[phase]++;
      if (severity === "blunder") blunders++;
      else if (severity === "mistake") mistakes++;
      else inaccuracies++;

      const evalBeforeSelf: EvalResult = {
        cp: before,
        mate: evalByPly[ply].mate !== undefined ? evalByPly[ply].mate! * sign : undefined,
      };
      const evalAfterSelf: EvalResult = {
        cp: after,
        mate:
          evalByPly[ply + 1].mate !== undefined ? evalByPly[ply + 1].mate! * sign : undefined,
      };
      const materialBeforeSelf = countMaterial(fenByPly[ply], playerColor);
      const materialTwoPlyLaterSelf = countMaterial(
        fenByPly[Math.min(ply + 2, fenByPly.length - 1)],
        playerColor
      );
      const ownMoveCaptureValue = pieceValue(history[ply].captured);

      const ctx: CategoryContext = {
        phase,
        evalBeforeSelf,
        evalAfterSelf,
        materialBeforeSelf,
        materialTwoPlyLaterSelf,
        ownMoveCaptureValue,
        clockSecondsRemaining: clocks[ply],
        startClockSeconds,
      };
      const category = classifyMistakeCategory(ctx);

      candidates.push({
        gameIndex: gi,
        ply,
        moveNumber: Math.floor(ply / 2) + 1,
        san: history[ply].san,
        severity,
        cpBefore: before,
        cpAfter: after,
        winPercentLoss: wpLoss,
        phase,
        category,
      });
    }

    const topMistakes = candidates
      .slice()
      .sort((a, b) => b.winPercentLoss - a.winPercentLoss)
      .slice(0, TOP_MISTAKES_PER_GAME);
    allTopMistakes.push(...topMistakes);

    const resultTag = headers["Result"];
    let result: "win" | "loss" | "draw" = "draw";
    if (resultTag === "1-0") result = playerColor === "w" ? "win" : "loss";
    else if (resultTag === "0-1") result = playerColor === "b" ? "win" : "loss";

    gameSummaries.push({
      index: gi,
      white,
      black,
      playerColor,
      result,
      opening: openingName,
      eco,
      openingMatchedPly: openingMatch?.matchedPly,
      date: headers["Date"] || headers["UTCDate"],
      timeControl: headers["TimeControl"],
      accuracy: moveAccuracies.length
        ? Math.round(
            (moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length) * 10
          ) / 10
        : 100,
      blunders,
      mistakes,
      inaccuracies,
      topMistakes,
      plyCount: totalPlies,
    });
  }

  engine.terminate();
  onProgress({ stage: "reporting", message: "Building your report…" });

  const wins = gameSummaries.filter((g) => g.result === "win").length;
  const losses = gameSummaries.filter((g) => g.result === "loss").length;
  const draws = gameSummaries.filter((g) => g.result === "draw").length;
  const totalBlunders = gameSummaries.reduce((a, g) => a + g.blunders, 0);
  const totalMistakes = gameSummaries.reduce((a, g) => a + g.mistakes, 0);
  const totalInaccuracies = gameSummaries.reduce((a, g) => a + g.inaccuracies, 0);
  const avgAccuracy =
    gameSummaries.length > 0
      ? Math.round(
          (gameSummaries.reduce((a, g) => a + g.accuracy, 0) / gameSummaries.length) * 10
        ) / 10
      : 0;

  const topPatterns = buildTopPatterns(allTopMistakes);

  return {
    username,
    platform,
    gamesAnalyzed: gameSummaries.length,
    record: { wins, losses, draws },
    averageAccuracy: avgAccuracy,
    totals: { blunders: totalBlunders, mistakes: totalMistakes, inaccuracies: totalInaccuracies },
    games: gameSummaries,
    topPatterns,
    phaseBreakdown: phaseTotals,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Aggregates the top flagged moves across every game (Developer Spec 1.2
 * step 4) by their rule-based category, and returns the 3 most frequent
 * ones with a couple of concrete examples each.
 */
function buildTopPatterns(allTopMistakes: CandidateMove[]): PatternSummary[] {
  const byCategory = new Map<string, CandidateMove[]>();
  for (const m of allTopMistakes) {
    const list = byCategory.get(m.category) || [];
    list.push(m);
    byCategory.set(m.category, list);
  }

  const summaries = Array.from(byCategory.entries())
    .map(([category, moves]) => ({
      category,
      count: moves.length,
      examples: moves.slice(0, 3).map((m) => `Game ${m.gameIndex + 1}, move ${m.moveNumber}: ${m.san}`),
    }))
    .sort((a, b) => b.count - a.count);

  return summaries.slice(0, TOP_PATTERNS_COUNT);
}
