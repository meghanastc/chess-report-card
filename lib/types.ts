export type Platform = "lichess" | "chesscom";

export interface RawGame {
  pgn: string;
  source: Platform;
  url?: string;
}

export interface GamesResponse {
  username: string;
  platform: Platform;
  games: RawGame[];
}

export type Phase = "opening" | "middlegame" | "endgame";
export type Severity = "blunder" | "mistake" | "inaccuracy";

export interface FlaggedMove {
  gameIndex: number;
  ply: number;
  moveNumber: number;
  san: string;
  severity: Severity;
  cpBefore: number;
  cpAfter: number;
  winPercentLoss: number;
  phase: Phase;
}

export interface GameSummary {
  index: number;
  white: string;
  black: string;
  playerColor: "w" | "b";
  result: "win" | "loss" | "draw";
  opening: string;
  eco?: string;
  date?: string;
  timeControl?: string;
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  worstMoment?: FlaggedMove;
  plyCount: number;
}

export interface Report {
  username: string;
  platform: Platform;
  gamesAnalyzed: number;
  record: { wins: number; losses: number; draws: number };
  averageAccuracy: number;
  totals: { blunders: number; mistakes: number; inaccuracies: number };
  games: GameSummary[];
  recurringOpenings: {
    opening: string;
    timesPlayed: number;
    losses: number;
    blundersIn: number;
  }[];
  phaseBreakdown: Record<Phase, number>;
  practicePlan: string[];
  generatedAt: string;
}

export interface AnalysisProgress {
  stage: "fetching" | "analyzing" | "reporting" | "done" | "error";
  message: string;
  gameIndex?: number;
  gameTotal?: number;
  plyIndex?: number;
  plyTotal?: number;
}
