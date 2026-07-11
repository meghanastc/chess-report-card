// Book recommendation lookup by rating band (Developer Spec 2.3b). Purely a
// static table, no AI.
export interface BookRow {
  minRating: number;
  maxRating: number | null;
  label: string;
  books: string[]; // empty = "no fixed book list"
}

export const BOOK_TABLE: BookRow[] = [
  {
    minRating: 0,
    maxRating: 999,
    label: "Under 1000",
    books: ["Bobby Fischer Teaches Chess", "Logical Chess: Move by Move"],
  },
  {
    minRating: 1000,
    maxRating: 1200,
    label: "1000-1200",
    books: ["Chess Tactics for Champions", "Winning Chess Strategies"],
  },
  {
    minRating: 1200,
    maxRating: 1400,
    label: "1200-1400",
    books: ["My System (intro)", "Silman's Complete Endgame Course"],
  },
  {
    minRating: 1400,
    maxRating: 1600,
    label: "1400-1600",
    books: ["Reassess Your Chess", "Dvoretsky's Endgame Manual (early chapters)"],
  },
  {
    minRating: 1600,
    maxRating: 1800,
    label: "1600-1800",
    books: ["Dvoretsky's Endgame Manual (full)", "GM Preparation: Calculation"],
  },
  {
    minRating: 1800,
    maxRating: 2000,
    label: "1800-2000",
    books: ["GM Preparation series", "Excelling at Calculation"],
  },
  {
    minRating: 2000,
    maxRating: null,
    label: "2000+",
    books: [],
  },
];

export function lookupBooks(rating: number): BookRow {
  const row = BOOK_TABLE.find(
    (r) => rating >= r.minRating && (r.maxRating === null || rating <= r.maxRating)
  );
  return row || BOOK_TABLE[BOOK_TABLE.length - 1];
}
