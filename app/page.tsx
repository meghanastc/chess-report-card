"use client";

import { useCallback, useState } from "react";
import { analyzeGames } from "@/lib/analyze";
import { generateReportPdf } from "@/lib/pdf";
import { AnalysisProgress, GamesResponse, Report } from "@/lib/types";

type Platform = "auto" | "lichess" | "chesscom";

export default function Home() {
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<Platform>("auto");
  const [maxGames, setMaxGames] = useState(10);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setProgress({ stage: "fetching", message: "Fetching recent games…" });
      const res = await fetch(
        `/api/games?username=${encodeURIComponent(username.trim())}&platform=${platform}&max=${maxGames}`
      );
      const data = (await res.json()) as GamesResponse & { error?: string };
      if (!res.ok || (data as any).error) {
        throw new Error((data as any).error || "Could not fetch games");
      }
      const result = await analyzeGames(
        data.username,
        data.platform,
        data.games,
        setProgress
      );
      setReport(result);
      setProgress({ stage: "done", message: "Done." });
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }, [username, platform, maxGames]);

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
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">AI Chess Report Card</h1>
        <p className="text-neutral-400 mt-2">
          MVP 1 — free demo. Paste a Lichess or Chess.com username, we pull your last
          games, run them through a local Stockfish engine right in your browser, and
          turn the evaluations into a plain-language report. No server cost, no AI/LLM
          fee — fully rule-based.
        </p>
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
          <select
            className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
            value={maxGames}
            onChange={(e) => setMaxGames(parseInt(e.target.value, 10))}
            disabled={busy}
          >
            {[5, 8, 10, 12, 15].map((n) => (
              <option key={n} value={n}>
                {n} games
              </option>
            ))}
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
              {progress.gameTotal ? ` (game ${progress.gameIndex}/${progress.gameTotal}${
                progress.plyTotal ? `, move ${Math.ceil((progress.plyIndex || 0) / 2)}/${Math.ceil(progress.plyTotal / 2)}` : ""
              })` : ""}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {report && (
        <section className="mt-10 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Report for {report.username}{" "}
              <span className="text-neutral-500 font-normal text-base">
                ({report.platform === "lichess" ? "Lichess" : "Chess.com"})
              </span>
            </h2>
            <button
              onClick={() => generateReportPdf(report)}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium"
            >
              Download PDF
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
            <h3 className="font-semibold mb-3">Your 3-Point Practice Plan</h3>
            <ol className="list-decimal list-inside space-y-2 text-neutral-300 text-sm">
              {report.practicePlan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>

          {report.recurringOpenings.length > 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Recurring Openings</h3>
              <div className="space-y-2 text-sm">
                {report.recurringOpenings.slice(0, 5).map((o) => (
                  <div key={o.opening} className="flex justify-between text-neutral-300">
                    <span>{o.opening}</span>
                    <span className="text-neutral-500">
                      {o.timesPlayed}x played · {o.losses} loss(es) · {o.blundersIn} blunder(s)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-semibold mb-3">Where mistakes happen</h3>
            <div className="space-y-2">
              {(["opening", "middlegame", "endgame"] as const).map((phase) => {
                const max = Math.max(1, ...Object.values(report.phaseBreakdown));
                const val = report.phaseBreakdown[phase];
                return (
                  <div key={phase} className="flex items-center gap-3 text-sm">
                    <span className="w-24 capitalize text-neutral-400">{phase}</span>
                    <div className="flex-1 h-3 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${(val / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-neutral-400">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="font-semibold mb-4">Game-by-Game Breakdown</h3>
            <div className="space-y-4">
              {report.games.map((g) => {
                const opponent = g.playerColor === "w" ? g.black : g.white;
                const resultColor =
                  g.result === "win"
                    ? "text-emerald-400"
                    : g.result === "loss"
                    ? "text-red-400"
                    : "text-neutral-400";
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
                      <span className={`font-medium ${resultColor}`}>
                        {g.result.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-neutral-400 mt-1">
                      Opening: {g.opening} · Accuracy {g.accuracy}% · {g.blunders} blunder(s),{" "}
                      {g.mistakes} mistake(s), {g.inaccuracies} inaccuracy(ies)
                    </div>
                    {g.worstMoment && (
                      <div className="text-neutral-500 mt-1">
                        Likely turning point: move {g.worstMoment.moveNumber} (
                        {g.worstMoment.san}) — a {g.worstMoment.severity} in the{" "}
                        {g.worstMoment.phase}.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-16 text-xs text-neutral-600">
        Free MVP demo. Engine analysis runs locally in your browser (Stockfish 17.1,
        depth 10). Report text is rule-based, not human-reviewed or LLM-generated —
        no per-report cost. Not affiliated with Lichess or Chess.com.
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
