import { Chess } from "chess.js";
import { ChessEngine } from "./engine";
import { resolveOpeningName, findMainLineDivergence } from "./openings";
import { extractClockSeconds, parseStartClockSeconds } from "./mistakeCategories";
import {
  AnalysisProgress,
  FlaggedMoveLite,
  Phase,
  PremiumAnalysis,
  PremiumGameDetail,
  RawGame,
  Severity,
} from "./types";

const MAX_PLIES_ANALYZED = 80; // premium looks a bit deeper than free tier
const ENGINE_DEPTH = 10;

function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

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

/**
 * Premium Tier pipeline (Developer Spec 2.2): pulls every move's evaluation
 * (not just the worst 3 per game like the Free Tier), computes a real
 * accuracy percentage per game, and records exactly where each player left
 * the main line versus what the "book move" was.
 */
export async function analyzePremiumGames(
  username: string,
  platform: "lichess" | "chesscom",
  rawGames: RawGame[],
  onProgress: (p: AnalysisProgress) => void
): Promise<PremiumAnalysis> {
  const engine = new ChessEngine();
  onProgress({ stage: "analyzing", message: "Starting local chess engine…" });
  await engine.init();

  const games: PremiumGameDetail[] = [];
  const phaseTotals: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };

  for (let gi = 0; gi < rawGames.length; gi++) {
    const raw = rawGames[gi];
    const chess = new Chess();
    try {
      chess.loadPgn(raw.pgn);
    } catch {
      continue;
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
    const divergenceRaw = findMainLineDivergence(sanMoves);

    const clocks = extractClockSeconds(raw.pgn);
    const startClockSeconds = parseStartClockSeconds(headers["TimeControl"]);

    const replay = new Chess();
    const cpByPly: number[] = [0];

    for (let ply = 0; ply < totalPlies; ply++) {
      const move = history[ply];
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const evalRes = await engine.evaluateFen(replay.fen(), ENGINE_DEPTH);
      cpByPly.push(evalRes.cp);
      onProgress({
        stage: "analyzing",
        message: `Analyzing ${username}'s games (Premium)…`,
        gameIndex: gi + 1,
        gameTotal: rawGames.length,
        plyIndex: ply + 1,
        plyTotal: totalPlies,
      });
    }

    let blunders = 0,
      mistakes = 0,
      inaccuracies = 0,
      lowTimeMistakes = 0;
    const moveAccuracies: number[] = [];
    const flaggedMoves: FlaggedMoveLite[] = [];
    let divergenceWpLoss = 0;

    for (let ply = 0; ply < totalPlies; ply++) {
      const mover = ply % 2 === 0 ? "w" : "b";
      if (mover !== playerColor) continue;
      const sign = playerColor === "w" ? 1 : -1;
      const before = cpByPly[ply] * sign;
      const after = cpByPly[ply + 1] * sign;
      const wpLoss = Math.max(0, winPercent(before) - winPercent(after));
      moveAccuracies.push(moveAccuracy(wpLoss));

      if (divergenceRaw && ply === divergenceRaw.ply) {
        divergenceWpLoss = wpLoss;
      }

      const severity = classifySeverity(wpLoss);
      if (severity) {
        const phase = phaseForPly(ply, totalPlies);
        phaseTotals[phase]++;
        if (severity === "blunder") blunders++;
        else if (severity === "mistake") mistakes++;
        else inaccuracies++;

        const clockRemaining = clocks[ply];
        if (
          clockRemaining !== undefined &&
          startClockSeconds !== undefined &&
          startClockSeconds > 0 &&
          (clockRemaining <= 30 || clockRemaining <= startClockSeconds * 0.1)
        ) {
          lowTimeMistakes++;
        }

        flaggedMoves.push({
          ply,
          moveNumber: Math.floor(ply / 2) + 1,
          san: history[ply].san,
          severity,
          winPercentLoss: wpLoss,
          phase,
        });
      }
    }

    const resultTag = headers["Result"];
    let result: "win" | "loss" | "draw" = "draw";
    if (resultTag === "1-0") result = playerColor === "w" ? "win" : "loss";
    else if (resultTag === "0-1") result = playerColor === "b" ? "win" : "loss";

    games.push({
      index: gi,
      white,
      black,
      playerColor,
      result,
      opening: openingName,
      eco,
      divergence: divergenceRaw
        ? {
            ply: divergenceRaw.ply,
            moveNumber: Math.floor(divergenceRaw.ply / 2) + 1,
            bookMove: divergenceRaw.bookMove,
            actualMove: divergenceRaw.actualMove,
            wasFine: divergenceWpLoss < 5,
            winPercentLoss: divergenceWpLoss,
          }
        : null,
      accuracy: moveAccuracies.length
        ? Math.round(
            (moveAccuracies.reduce((a, b) => a + b, 0) / moveAccuracies.length) * 10
          ) / 10
        : 100,
      blunders,
      mistakes,
      inaccuracies,
      lowTimeMistakes,
      flaggedMoves,
      plyCount: totalPlies,
    });
  }

  engine.terminate();
  onProgress({ stage: "reporting", message: "Building your Premium report…" });

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws = games.filter((g) => g.result === "draw").length;
  const overallAccuracy = games.length
    ? Math.round((games.reduce((a, g) => a + g.accuracy, 0) / games.length) * 10) / 10
    : 0;

  return {
    username,
    platform,
    gamesAnalyzed: games.length,
    record: { wins, losses, draws },
    overallAccuracy,
    games,
    phaseBreakdown: phaseTotals,
    generatedAt: new Date().toISOString(),
  };
}
