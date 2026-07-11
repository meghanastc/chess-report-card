import { Chess } from "chess.js";
import { ChessEngine } from "./engine";
import { resolveOpeningName } from "./openings";
import {
  AnalysisProgress,
  FlaggedMove,
  GameSummary,
  Phase,
  RawGame,
  Report,
  Severity,
} from "./types";

const MAX_PLIES_ANALYZED = 60; // ~30 full moves/game keeps runtime reasonable client-side
const ENGINE_DEPTH = 10;

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
  const allFlags: FlaggedMove[] = [];
  const openingStats = new Map<
    string,
    { timesPlayed: number; losses: number; blundersIn: number }
  >();
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
    const { name: openingName, eco } = resolveOpeningName(
      headers,
      history.map((h) => h.san)
    );

    // Replay the game move by move, evaluating every position once.
    const replay = new Chess();
    const cpByPly: number[] = [];
    cpByPly.push(0); // starting position, roughly balanced

    for (let ply = 0; ply < totalPlies; ply++) {
      const move = history[ply];
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const evalRes = await engine.evaluateFen(replay.fen(), ENGINE_DEPTH);
      cpByPly.push(evalRes.cp);
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
    let worstMoment: FlaggedMove | undefined;
    let worstLoss = -Infinity;

    for (let ply = 0; ply < totalPlies; ply++) {
      const mover = ply % 2 === 0 ? "w" : "b";
      if (mover !== playerColor) continue;
      const sign = playerColor === "w" ? 1 : -1;
      // Normalize both evals to the player's own perspective before diffing.
      const before = cpByPly[ply] * sign;
      const after = cpByPly[ply + 1] * sign;
      const wpBeforePlayer = winPercent(before);
      const wpAfterPlayer = winPercent(after);
      const wpLoss = Math.max(0, wpBeforePlayer - wpAfterPlayer);
      const acc = moveAccuracy(wpLoss);
      moveAccuracies.push(acc);

      const severity = classifySeverity(wpLoss);
      if (severity) {
        const phase = phaseForPly(ply, totalPlies);
        phaseTotals[phase]++;
        const flag: FlaggedMove = {
          gameIndex: gi,
          ply,
          moveNumber: Math.floor(ply / 2) + 1,
          san: history[ply].san,
          severity,
          cpBefore: before,
          cpAfter: after,
          winPercentLoss: wpLoss,
          phase,
        };
        allFlags.push(flag);
        if (severity === "blunder") blunders++;
        else if (severity === "mistake") mistakes++;
        else inaccuracies++;
        if (wpLoss > worstLoss) {
          worstLoss = wpLoss;
          worstMoment = flag;
        }
      }
    }

    const resultTag = headers["Result"];
    let result: "win" | "loss" | "draw" = "draw";
    if (resultTag === "1-0") result = playerColor === "w" ? "win" : "loss";
    else if (resultTag === "0-1") result = playerColor === "b" ? "win" : "loss";

    const key = openingName;
    const stat = openingStats.get(key) || {
      timesPlayed: 0,
      losses: 0,
      blundersIn: 0,
    };
    stat.timesPlayed++;
    if (result === "loss") stat.losses++;
    stat.blundersIn += blunders;
    openingStats.set(key, stat);

    gameSummaries.push({
      index: gi,
      white,
      black,
      playerColor,
      result,
      opening: openingName,
      eco,
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
      worstMoment,
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

  const recurringOpenings = Array.from(openingStats.entries())
    .map(([opening, s]) => ({ opening, ...s }))
    .filter((o) => o.timesPlayed >= 2)
    .sort((a, b) => b.blundersIn - a.blundersIn || b.losses - a.losses);

  const practicePlan = buildPracticePlan({
    recurringOpenings,
    phaseTotals,
    totalBlunders,
    totalMistakes,
    gameSummaries,
  });

  return {
    username,
    platform,
    gamesAnalyzed: gameSummaries.length,
    record: { wins, losses, draws },
    averageAccuracy: avgAccuracy,
    totals: { blunders: totalBlunders, mistakes: totalMistakes, inaccuracies: totalInaccuracies },
    games: gameSummaries,
    recurringOpenings,
    phaseBreakdown: phaseTotals,
    practicePlan,
    generatedAt: new Date().toISOString(),
  };
}

function buildPracticePlan(ctx: {
  recurringOpenings: { opening: string; timesPlayed: number; losses: number; blundersIn: number }[];
  phaseTotals: Record<Phase, number>;
  totalBlunders: number;
  totalMistakes: number;
  gameSummaries: GameSummary[];
}): string[] {
  const plan: string[] = [];

  const worstOpening = ctx.recurringOpenings[0];
  if (worstOpening && (worstOpening.blundersIn > 0 || worstOpening.losses > 0)) {
    plan.push(
      `Review "${worstOpening.opening}" — you've played it ${worstOpening.timesPlayed} times with ${worstOpening.losses} loss(es) and ${worstOpening.blundersIn} blunder(s). Study the main line to move 10-12 before your next game.`
    );
  }

  const phaseEntries = Object.entries(ctx.phaseTotals) as [Phase, number][];
  const worstPhase = phaseEntries.sort((a, b) => b[1] - a[1])[0];
  if (worstPhase && worstPhase[1] > 0) {
    const tips: Record<Phase, string> = {
      opening:
        "Most mistakes happen in the opening — slow down in the first 10 moves and stick to lines you've actually studied rather than improvising.",
      middlegame:
        "Most mistakes happen in the middlegame — add 10-15 minutes/day of tactics puzzles (forks, pins, discovered attacks) to sharpen pattern recognition.",
      endgame:
        "Most mistakes happen in the endgame — review basic theoretical endgames (king+pawn, rook endings) since these are where converted advantages are lost.",
    };
    plan.push(`${tips[worstPhase[0]]} (${worstPhase[1]} flagged moves in this phase.)`);
  }

  if (ctx.totalBlunders > 0) {
    plan.push(
      `You had ${ctx.totalBlunders} outright blunder(s) across these games — before moving, ask "what does this move allow?" for your opponent's best reply, especially in sharp or unfamiliar positions.`
    );
  } else if (ctx.totalMistakes > 0) {
    plan.push(
      `No outright blunders, but ${ctx.totalMistakes} mistake(s) crept in — double-check candidate moves against forcing replies (checks, captures, threats) before playing.`
    );
  } else {
    plan.push(
      "Very clean games in this sample — keep reinforcing strengths and consider studying slightly sharper openings to create more winning chances."
    );
  }

  return plan.slice(0, 3);
}
