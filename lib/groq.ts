// Thin wrapper around Groq's OpenAI-compatible chat completions API. Groq is
// free (generous rate limits on their hosted Llama models) and is the LLM
// provider chosen for this build in place of a paid API. All calls happen
// server-side only — the API key never reaches the browser.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured on the server");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq API returned no content");
  return content;
}

function extractJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Could not parse JSON from Groq response");
  }
}

export interface FreeTierPatternInput {
  category: string;
  count: number;
  examples: string[]; // short human-readable examples, e.g. "Game 3, move 14: Qxd5"
}

export interface FreeTierGameInput {
  index: number; // 1-based, for display
  eco?: string;
  opening: string;
  result: "win" | "loss" | "draw";
  opponent: string;
  worstMoveDescription: string; // e.g. "move 14 (Qxd5), a blunder in the middlegame"
}

export interface FreeTierInsights {
  patternExplanations: string[]; // exactly 3, 2-3 sentences each
  verdicts: string[]; // one per game, same order as input games
}

/**
 * Fixed prompt template for the Free Tier (Developer Spec 1.2, step 6):
 * explain the top 3 mistake patterns in plain English, and write one short
 * verdict line per game.
 */
export async function generateFreeTierInsights(
  username: string,
  patterns: FreeTierPatternInput[],
  games: FreeTierGameInput[]
): Promise<FreeTierInsights> {
  const systemPrompt =
    "You are a friendly, encouraging chess coach writing a short automated report card for an amateur player. " +
    "You never invent facts that aren't given to you — you only explain and summarize the data you're given. " +
    "You always respond with strict JSON matching the requested schema, no markdown, no commentary outside the JSON.";

  const userPrompt = `
Player: ${username}

Here are the player's top 3 recurring mistake patterns across their last ${games.length} games, with how many times each occurred and a couple of concrete examples:

${patterns
  .map(
    (p, i) =>
      `${i + 1}. "${p.category}" — happened ${p.count} time(s). Examples: ${p.examples.join("; ") || "n/a"}`
  )
  .join("\n")}

Here is a one-line factual summary of each of the ${games.length} games (in order):

${games
  .map(
    (g) =>
      `Game ${g.index}: vs ${g.opponent}, result ${g.result}, opening ${g.opening}${
        g.eco ? ` (${g.eco})` : ""
      }, ${g.worstMoveDescription}`
  )
  .join("\n")}

Respond with JSON in exactly this shape:
{
  "patternExplanations": ["<2-3 plain-English sentences explaining pattern 1>", "<...pattern 2>", "<...pattern 3>"],
  "verdicts": ["<one short, specific, plain-English sentence for game 1>", "<game 2>", ... one entry per game, ${games.length} total in the same order]
}

Keep each verdict to a single short sentence (under ~20 words), specific to that game's own data (don't just repeat the pattern names). Keep each pattern explanation to 2-3 sentences, plain English, no jargon, encouraging but honest tone.`.trim();

  const raw = await callGroq(systemPrompt, userPrompt);
  const parsed = extractJson<FreeTierInsights>(raw);

  if (!Array.isArray(parsed.patternExplanations) || !Array.isArray(parsed.verdicts)) {
    throw new Error("Groq response did not match the expected schema");
  }
  return parsed;
}

export interface PremiumPromptInput {
  intake: {
    username: string;
    rating: number;
    format: string;
    ageBracket: string;
    goal: string;
    openingsPlayed?: string;
  };
  games: {
    index: number;
    opponent: string;
    result: string;
    opening: string;
    eco?: string;
    accuracy: number;
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    lowTimeMistakes: number;
    divergenceSummary: string; // e.g. "left main line on move 7 (played Bd3 instead of Nf3) — this was fine"
    worstMovesSummary: string; // short text listing a few of the game's flagged moves
  }[];
  phaseBreakdown: { opening: number; middlegame: number; endgame: number };
  repertoire: { forWhite: string; vsE4: string; vsD4: string; bespoke: boolean };
}

export interface PremiumSections {
  opening: string;
  middlegame: string;
  endgame: string;
  timeManagement: string;
  tacticalPatternAudit: string;
  threePointPlan: string[];
  repertoireWhyItFits: string;
}

/**
 * Longer, different prompt template for the Premium Tier's full structured
 * report (Developer Spec 2.2 step 5 / 2.3). The tone/wording should reflect
 * the player's age bracket, and the "why it fits" text must reference the
 * player's own results with the given repertoire's family of openings — it
 * must not invent new opening suggestions itself (those come from the fixed
 * lookup table).
 */
export async function generatePremiumSections(
  input: PremiumPromptInput
): Promise<PremiumSections> {
  const { intake, games, phaseBreakdown, repertoire } = input;

  const toneNote =
    intake.ageBracket === "kid"
      ? "Write in a simple, warm, encouraging tone suitable for a child."
      : intake.ageBracket === "teen"
      ? "Write in a friendly, motivating tone suitable for a teenager."
      : "Write in a clear, professional, respectful coaching tone suitable for an adult.";

  const systemPrompt =
    "You are an experienced chess coach writing a paid, in-depth report for a student. " +
    "You only use the factual data provided to you — never invent chess facts, opening names, or results. " +
    `${toneNote} ` +
    "Always respond with strict JSON matching the requested schema, no markdown, no commentary outside the JSON.";

  const userPrompt = `
Player: ${intake.username} (self-reported rating ${intake.rating}, plays ${intake.format})
What they want out of this report: "${intake.goal}"
${intake.openingsPlayed ? `Openings they usually play: "${intake.openingsPlayed}"` : ""}

Mistakes by phase across all games: opening ${phaseBreakdown.opening}, middlegame ${phaseBreakdown.middlegame}, endgame ${phaseBreakdown.endgame}.

Suggested repertoire for this rating band (from a fixed lookup table, not your invention):
- As White: ${repertoire.forWhite}
- vs 1.e4 as Black: ${repertoire.vsE4}
- vs 1.d4 as Black: ${repertoire.vsD4}
${repertoire.bespoke ? "(This player's band gets a bespoke, human-built repertoire instead of a fixed one — mention that a coach will follow up personally instead of describing specific openings.)" : ""}

Per-game data (${games.length} games):
${games
  .map(
    (g) =>
      `Game ${g.index} vs ${g.opponent}: ${g.result}, opening ${g.opening}${
        g.eco ? ` (${g.eco})` : ""
      }, accuracy ${g.accuracy}%, ${g.blunders} blunder(s)/${g.mistakes} mistake(s)/${g.inaccuracies} inaccuracy(ies), ${g.lowTimeMistakes} low-time mistake(s). ${g.divergenceSummary} Worst moments: ${g.worstMovesSummary}`
  )
  .join("\n")}

Write a full report as JSON in exactly this shape:
{
  "opening": "<general opening mistakes/patterns across these games' first ~10 moves, referencing the actual openings played and the main-line divergence data given above>",
  "middlegame": "<general middlegame mistakes/patterns, moves ~11-30>",
  "endgame": "<general endgame mistakes/patterns, moves ~31+>",
  "timeManagement": "<did they make bad moves while low on the clock — reference the low-time-mistake counts given>",
  "tacticalPatternAudit": "<identify and name 1-3 recurring specific tactical/positional mistake themes you notice in the worst-moments data above (invent short descriptive labels for these yourself, e.g. 'walking into pins' or 'overextending pawns before development is done')>",
  "threePointPlan": ["<action item 1 for this week>", "<action item 2>", "<action item 3>"],
  "repertoireWhyItFits": "<2-4 sentences explaining why the suggested repertoire above fits this player, referencing their actual results/openings from the data given — do not suggest different openings than the ones listed above>"
}

Each of opening/middlegame/endgame/timeManagement/tacticalPatternAudit should be 3-5 sentences. Be specific and reference the real data above rather than generic chess advice.`.trim();

  const raw = await callGroq(systemPrompt, userPrompt);
  const parsed = extractJson<PremiumSections>(raw);
  if (
    typeof parsed.opening !== "string" ||
    typeof parsed.middlegame !== "string" ||
    typeof parsed.endgame !== "string" ||
    typeof parsed.timeManagement !== "string" ||
    typeof parsed.tacticalPatternAudit !== "string" ||
    !Array.isArray(parsed.threePointPlan) ||
    typeof parsed.repertoireWhyItFits !== "string"
  ) {
    throw new Error("Groq premium response did not match the expected schema");
  }
  return parsed;
}
