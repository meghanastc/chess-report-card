// Pricing lookup by rating band (Developer Spec 2.4). Payment collection
// itself is intentionally not wired up yet (checkout integration deferred),
// but the table is kept so the price can still be displayed/referenced.
export interface PriceRow {
  minRating: number;
  maxRating: number | null;
  label: string;
  priceInr: number | null; // null = "contact us", no online price
}

export const PRICING_TABLE: PriceRow[] = [
  { minRating: 0, maxRating: 999, label: "Under 1000", priceInr: 399 },
  { minRating: 1000, maxRating: 1200, label: "1000-1200", priceInr: 499 },
  { minRating: 1200, maxRating: 1400, label: "1200-1400", priceInr: 699 },
  { minRating: 1400, maxRating: 1600, label: "1400-1600", priceInr: 999 },
  { minRating: 1600, maxRating: 1800, label: "1600-1800", priceInr: 1499 },
  { minRating: 1800, maxRating: 2000, label: "1800-2000", priceInr: 1999 },
  { minRating: 2000, maxRating: 2300, label: "2000-2300", priceInr: 2999 },
  { minRating: 2300, maxRating: null, label: "2300+", priceInr: null },
];

export function lookupPrice(rating: number): PriceRow {
  const row = PRICING_TABLE.find(
    (r) => rating >= r.minRating && (r.maxRating === null || rating <= r.maxRating)
  );
  return row || PRICING_TABLE[PRICING_TABLE.length - 1];
}
