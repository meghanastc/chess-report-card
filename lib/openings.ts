// Small deterministic opening-name resolver. Prefers PGN header data (ECO/Opening)
// supplied by Lichess/Chess.com; falls back to a first-moves signature so games
// can still be grouped together even when headers are missing.
export function openingKeyFromSignature(sanMoves: string[]): string {
  const first = sanMoves.slice(0, 4).join(" ");
  return first || "Unknown opening";
}

export function resolveOpeningName(
  headers: Record<string, string>,
  sanMoves: string[]
): { name: string; eco?: string } {
  const name = headers["Opening"];
  const eco = headers["ECO"];
  if (name) return { name: eco ? `${name} (${eco})` : name, eco };
  if (eco) return { name: `ECO ${eco}`, eco };
  return { name: openingKeyFromSignature(sanMoves) };
}
