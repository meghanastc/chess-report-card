// Opening repertoire lookup by rating band (Developer Spec 2.3a). Purely a
// static table — no AI involved in choosing these; the LLM's only job is to
// explain *why* the suggestion fits a given player, using this data as
// ground truth.
export interface OpeningRef {
  eco: string;
  name: string;
}

export interface RepertoireRow {
  minRating: number;
  maxRating: number | null; // null = no upper bound
  label: string; // for display, e.g. "1800-2000" or "2000+"
  forWhite: OpeningRef | null; // null = "no fixed table" band
  vsE4AsBlack: OpeningRef | null;
  vsD4AsBlack: OpeningRef | null;
  bespoke: boolean; // true for the 2000+ "no fixed table" band
}

export const REPERTOIRE_TABLE: RepertoireRow[] = [
  {
    minRating: 0,
    maxRating: 999,
    label: "Under 1000",
    forWhite: { eco: "C50", name: "Italian Game" },
    vsE4AsBlack: { eco: "B10", name: "Caro-Kann Defense" },
    vsD4AsBlack: { eco: "D30", name: "Queen's Gambit Declined" },
    bespoke: false,
  },
  {
    minRating: 1000,
    maxRating: 1200,
    label: "1000-1200",
    forWhite: { eco: "C44", name: "Scotch Game" },
    vsE4AsBlack: { eco: "B12", name: "Caro-Kann, Advance Variation" },
    vsD4AsBlack: { eco: "D10", name: "Slav Defense" },
    bespoke: false,
  },
  {
    minRating: 1200,
    maxRating: 1400,
    label: "1200-1400",
    forWhite: { eco: "C60", name: "Ruy Lopez" },
    vsE4AsBlack: { eco: "C00", name: "French Defense" },
    vsD4AsBlack: { eco: "D30", name: "Queen's Gambit Declined" },
    bespoke: false,
  },
  {
    minRating: 1400,
    maxRating: 1600,
    label: "1400-1600",
    forWhite: { eco: "C65", name: "Ruy Lopez, Berlin Defense" },
    vsE4AsBlack: { eco: "B40", name: "Sicilian, Taimanov Variation" },
    vsD4AsBlack: { eco: "E20", name: "Nimzo-Indian Defense" },
    bespoke: false,
  },
  {
    minRating: 1600,
    maxRating: 1800,
    label: "1600-1800",
    forWhite: { eco: "C84", name: "Ruy Lopez, Closed" },
    vsE4AsBlack: { eco: "B90", name: "Sicilian, Najdorf Variation" },
    vsD4AsBlack: { eco: "E60", name: "King's Indian Defense" },
    bespoke: false,
  },
  {
    minRating: 1800,
    maxRating: 2000,
    label: "1800-2000",
    forWhite: { eco: "D06", name: "Queen's Gambit / E00 Catalan" },
    vsE4AsBlack: { eco: "B90", name: "Sicilian, Najdorf (deeper lines)" },
    vsD4AsBlack: { eco: "D70", name: "Grünfeld Defense" },
    bespoke: false,
  },
  {
    minRating: 2000,
    maxRating: null,
    label: "2000+",
    forWhite: null,
    vsE4AsBlack: null,
    vsD4AsBlack: null,
    bespoke: true,
  },
];

export function lookupRepertoire(rating: number): RepertoireRow {
  const row = REPERTOIRE_TABLE.find(
    (r) => rating >= r.minRating && (r.maxRating === null || rating <= r.maxRating)
  );
  return row || REPERTOIRE_TABLE[REPERTOIRE_TABLE.length - 1];
}
