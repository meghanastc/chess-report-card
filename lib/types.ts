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
  category: string; // rule-based mistake category, see lib/mistakeCategories.ts
}

export interface PatternSummary {
  category: string;
  count: number;
  examples: string[]; // short human-readable examples, e.g. "Game 3, move 14: Qxd5"
}

export interface GameSummary {
  index: number;
  white: string;
  black: string;
  playerColor: "w" | "b";
  result: "win" | "loss" | "draw";
  opening: string;
  eco?: string;
  openingMatchedPly?: number;
  date?: string;
  timeControl?: string;
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  topMistakes: FlaggedMove[]; // up to 3 worst flagged moves for this game
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
  topPatterns: PatternSummary[]; // top 3 recurring mistake categories across all games
  phaseBreakdown: Record<Phase, number>;
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

// ---------------------------------------------------------------------------
// Premium Tier (Developer Spec section 2) — a deeper, human-reviewed report.
// Payment collection is intentionally not wired up yet.
// ---------------------------------------------------------------------------

export type PremiumFormat = "rapid" | "blitz" | "classical";
export type AgeBracket = "kid" | "teen" | "adult";

export interface PremiumIntake {
  username: string;
  platform: Platform;
  rating: number;
  format: PremiumFormat;
  ageBracket: AgeBracket;
  goal: string;
  openingsPlayed?: string;
}

export interface PremiumGameDetail {
  index: number;
  white: string;
  black: string;
  playerColor: "w" | "b";
  result: "win" | "loss" | "draw";
  opening: string;
  eco?: string;
  divergence: {
    ply: number;
    moveNumber: number;
    bookMove: string;
    actualMove: string;
    wasFine: boolean;
    winPercentLoss: number;
  } | null;
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  lowTimeMistakes: number;
  flaggedMoves: FlaggedMoveLite[];
  plyCount: number;
}

export interface FlaggedMoveLite {
  ply: number;
  moveNumber: number;
  san: string;
  severity: Severity;
  winPercentLoss: number;
  phase: Phase;
}

export interface PremiumAnalysis {
  username: string;
  platform: Platform;
  gamesAnalyzed: number;
  record: { wins: number; losses: number; draws: number };
  overallAccuracy: number;
  games: PremiumGameDetail[];
  phaseBreakdown: Record<Phase, number>;
  generatedAt: string;
}

export interface PremiumReportSections {
  opening: string;
  middlegame: string;
  endgame: string;
  timeManagement: string;
  tacticalPatternAudit: string;
  threePointPlan: string[];
  repertoireWhyItFits: string;
}

export type PremiumReportStatus = "pending" | "approved";

export interface PremiumReportRecord {
  id: string;
  status: PremiumReportStatus;
  createdAt: string;
  approvedAt?: string;
  intake: PremiumIntake;
  analysis: PremiumAnalysis;
  sections: PremiumReportSections;
  repertoireLabel: string;
  repertoireForWhite: string | null;
  repertoireVsE4: string | null;
  repertoireVsD4: string | null;
  repertoireBespoke: boolean;
  books: string[];
  priceInr: number | null;
}
