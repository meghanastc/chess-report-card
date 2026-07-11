"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { analyzeGames } from "@/lib/analyze";
import { generateFreeReportPdf, FreeTierInsightsForPdf } from "@/lib/pdf";
import { AnalysisProgress, GamesResponse, Report } from "@/lib/types";

type Platform = "auto" | "lichess" | "chesscom";

const MAX_GAMES = 10; // Developer Spec 1.1

export default function Home() {
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<Platform>("auto");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [insights, setInsights] = useState<FreeTierInsightsForPdf | null>(null);
  const [usage, setUsage] = useState<{ used: number; remaining: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setReport(null);
    setInsights(null);
    setBlocked(false);
    try {
      setProgress({ stage: "fetching", message: "Fetching recent games…" });
      const res = await fetch(
        `/api/games?username=${encodeURIComponent(username.trim())}&platform=${platform}&max=${MAX_GAMES}`
      );
      const data = (await res.json()) as GamesResponse & { error?: string };
      if (!res.ok || (data as any).error) {
        throw new Error((data as any).error || "Could not fetch games");
      }

      // Pre-check the free-tier usage cap before running the (expensive,
      // client-side) engine analysis — no point analyzing 10 games just to
      // find out afterwards that this username is already blocked.
      const usageRes = await fetch(
        `/api/free/usage?username=${encodeURIComponent(data.username)}&platform=${data.platform}`
      );
      const usageData = await usageRes.json();
      if (!usageRes.ok) throw new Error(usageData.error || "Could not check usage");
      if (usageData.blocked) {
        setBlocked(true);
        setUsage({ used: usageData.used, remaining: usageData.remaining });
        setProgress(null);
        return;
      }

      const result = await analyzeGames(data.username, data.platform, data.games, setProgress);

      setProgress({ stage: "reporting", message: "Generating plain-English insights…" });
      const insightsRes = await fetch("/api/free/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: result.username,
          platform: result.platform,
          patterns: result.topPatterns,
          games: result.games.map((g, i) => ({
            index: i + 1,
            eco: g.eco,
            opening: g.opening,
            result: g.result,
            opponent: g.playerColor === "w" ? g.black : g.white,
            worstMoveDescription: g.topMistakes[0]
              ? `move ${g.topMistakes[0].moveNumber} (${g.topMistakes[0].san}), a ${g.topMistakes[0].severity} in the ${g.topMistakes[0].phase} (${g.topMistakes[0].category.toLowerCase()})`
              : "no significant mistakes flagged",
          })),
        }),
      });
      const insightsData = await insightsRes.json();
      if (!insightsRes.ok || insightsData.blocked) {
        if (insightsData.blocked) {
          setBlocked(true);
          setUsage({ used: insightsData.used, remaining: insightsData.remaining });
          setReport(result);
          setProgress(null);
          return;
        }
        throw new Error(insightsData.error || "Could not generate insights");
      }

      setReport(result);
      setInsights({
        patternExplanations: insightsData.patternExplanations,
        verdicts: insightsData.verdicts,
      });
      setUsage({ used: insightsData.used, remaining: insightsData.remaining });
      setProgress({ stage: "done", message: "Done." });
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }, [username, platform]);

  const pct =
    progress?.stage === "analyzing" && progress.gameTotal
      ? Math.round(
          (((progress.gameIndex! - 1) + (progress.plyIndex || 0) / (progress.plyTotal || 1)) /
            progress.gameTotal) *
            100
        )
      : progress?.stage === "fetching"
      ? 5
      : progress?.stage === "reporting"
      ? 95
      : progress?.stage === "done"
      ? 100
      : 0;

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Chess Report Card</h1>
          <p className="text-neutral-400 mt-2">
            Free tier — paste a Lichess or Chess.com username, we pull your last {MAX_GAMES}{" "}
            games, run them through a local Stockfish engine right in your browser, and use AI
            to explain your top 3 recurring mistake patterns in plain English. 3 free reports
            per username.
          </p>
        </div>
        <Link
          href="/premium"
          className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-400 hover:bg-emerald-950/40 whitespace-nowrap"
        >
          Go Premium →
        </Link>
      </header>

      <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-neutral-500"
            placeholder="Chess.com or Lichess username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
          />
          <select
            className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            disabled={busy}
          >
            <option value="auto">Auto-detect</option>
            <option value="lichess">Lichess</option>
            <option value="chesscom">Chess.com</option>
          </select>
        </div>
        <button
          onClick={run}
          disabled={busy || !username.trim()}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:cursor-not-allowed font-medium transition"
        >
          {busy ? "Analyzing…" : "Generate Report"}
        </button>

        {progress && (
          <div className="pt-2">
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-neutral-400 mt-2">
              {progress.message}
              {progress.gameTotal
                ? ` (game ${progress.gameIndex}/${progress.gameTotal}${
                    progress.plyTotal
                      ? `, move ${Math.ceil((progress.plyIndex || 0) / 2)}/${Math.ceil(
                          progress.plyTotal / 2
                        )}`
                      : ""
                  })`
                : ""}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {blocked && (
          <div className="text-sm bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-3 space-y-2">
            <p className="text-amber-300 font-medium">
              You've used all {usage ? usage.used : 3} of your 3 free reports for this username.
            </p>
            <Link
              href="/premium"
              className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
              Upgrade to Premium →
            </Link>
          </div>
        )}
      </section>

      {report && insights && (
        <section className="mt-10 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Report for {report.username}{" "}
              <span className="text-neutral-500 font-normal text-base">
                ({report.platform === "lichess" ? "Lichess" : "Chess.com"})
              </span>
            </h2>
            <button
              onClick={() => generateFreeReportPdf(report, insights)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium"
            >
              Download PDF (Free Version)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Games analyzed" value={`${report.gamesAnalyzed}`} />
            <Stat
              label="Record"
              value={`${report.record.wins}W ${report.record.losses}L ${report.record.draws}D`}
            />
            <Stat label="Avg. accuracy" value={`${report.averageAccuracy}%`} />
            <Stat
              label="Blunders / Mistakes / Inacc."
              value={`${report.totals.blunders} / ${report.totals.mistakes} / ${report.totals.inaccuracies}`}
            />
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-semibold mb-3">Your Top 3 Patterns</h3>
            {report.topPatterns.length === 0 ? (
              <p className="text-sm text-neutral-400">
                No recurring mistake patterns found in these games — nice and clean!
              </p>
            ) : (
              <ol className="space-y-3 text-sm">
                {report.topPatterns.map((p, i) => (
                  <li key={p.category}>
                    <div className="font-medium text-neutral-200">
                      {i + 1}. {p.category}{" "}
                      <span className="text-neutral-500 font-normal">({p.count}x)</span>
                    </div>
                    {insights.patternExplanations[i] && (
                      <p className="text-neutral-400 mt-1">{insights.patternExplanations[i]}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-semibold mb-4">Game-by-Game Verdicts</h3>
            <div className="space-y-4">
              {report.games.map((g, i) => {
                const opponent = g.playerColor === "w" ? g.black : g.white;
                const resultColor =
                  g.result === "win"
                    ? "text-emerald-400"
                    : g.result === "loss"
                    ? "text-red-400"
                    : "text-neutral-400";
                const prefix = g.eco ? `${g.eco} — ${g.opening}` : g.opening;
                return (
                  <div
                    key={g.index}
                    className="border-b border-neutral-800 last:border-0 pb-4 last:pb-0 text-sm"
                  >
                    <div className="flex justify-between">
                      <span>
                        vs <span className="font-medium">{opponent}</span>{" "}
                        <span className="text-neutral-500">
                          ({g.playerColor === "w" ? "White" : "Black"})
                        </span>
                      </span>
                      <span className={`font-medium ${resultColor}`}>{g.result.toUpperCase()}</span>
                    </div>
                    <div className="text-neutral-400 mt-1">{prefix}</div>
                    {insights.verdicts[i] && (
                      <div className="text-neutral-500 mt-1">{insights.verdicts[i]}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-16 text-xs text-neutral-600">
        Free tier — 3 reports per username. Engine analysis runs locally in your browser
        (Stockfish 17.1, depth 10); pattern explanations are AI-generated from that data. Not
        affiliated with Lichess or Chess.com.
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="text-neutral-500 text-xs">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
