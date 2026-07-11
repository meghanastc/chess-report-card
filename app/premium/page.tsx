"use client";

import { useCallback, useState } from "react";
import { analyzePremiumGames } from "@/lib/premiumAnalyze";
import { AnalysisProgress, GamesResponse, AgeBracket, PremiumFormat } from "@/lib/types";

type Platform = "auto" | "lichess" | "chesscom";

export default function PremiumPage() {
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<Platform>("auto");
  const [rating, setRating] = useState("1200");
  const [format, setFormat] = useState<PremiumFormat>("rapid");
  const [ageBracket, setAgeBracket] = useState<AgeBracket>("adult");
  const [goal, setGoal] = useState("");
  const [openingsPlayed, setOpeningsPlayed] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const MAX_GAMES = 15; // Developer Spec 2.2, step 1

  const run = useCallback(async () => {
    if (!username.trim() || !goal.trim()) return;
    setBusy(true);
    setError(null);
    setSubmittedId(null);
    try {
      setProgress({ stage: "fetching", message: "Fetching your last 15 games…" });
      const res = await fetch(
        `/api/games?username=${encodeURIComponent(username.trim())}&platform=${platform}&max=${MAX_GAMES}`
      );
      const data = (await res.json()) as GamesResponse & { error?: string };
      if (!res.ok || (data as any).error) {
        throw new Error((data as any).error || "Could not fetch games");
      }

      const analysis = await analyzePremiumGames(
        data.username,
        data.platform,
        data.games,
        setProgress
      );

      setProgress({ stage: "reporting", message: "Generating your draft report…" });

      const submitRes = await fetch("/api/premium/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake: {
            username: data.username,
            platform: data.platform,
            rating: parseInt(rating, 10) || 1200,
            format,
            ageBracket,
            goal: goal.trim(),
            openingsPlayed: openingsPlayed.trim() || undefined,
          },
          analysis,
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error || "Could not submit report");

      setSubmittedId(submitData.reportId);
      setProgress({ stage: "done", message: "Submitted." });
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }, [username, platform, rating, format, ageBracket, goal, openingsPlayed]);

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
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">AI Chess Report Card — Premium</h1>
        <p className="text-neutral-400 mt-2">
          15 games, every move scored, opening repertoire &amp; book recommendations,
          and a human-reviewed report before you get it. Fill in the form below — no
          payment is collected yet, your report will be queued for review.
        </p>
      </header>

      {submittedId ? (
        <div className="bg-emerald-950/40 border border-emerald-900 rounded-xl p-6 text-sm">
          <p className="font-medium text-emerald-300 mb-1">Submitted!</p>
          <p className="text-emerald-200/80">
            Your games have been analyzed and a draft report has been generated. A human
            reviewer will check it before it's ready. Reference ID:{" "}
            <code className="text-emerald-100">{submittedId}</code>
          </p>
        </div>
      ) : (
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="text-neutral-400 block mb-1">Current rating</span>
              <input
                type="number"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-400 block mb-1">Format</span>
              <select
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
                value={format}
                onChange={(e) => setFormat(e.target.value as PremiumFormat)}
                disabled={busy}
              >
                <option value="rapid">Rapid</option>
                <option value="blitz">Blitz</option>
                <option value="classical">Classical</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-neutral-400 block mb-1">Age bracket</span>
              <select
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
                value={ageBracket}
                onChange={(e) => setAgeBracket(e.target.value as AgeBracket)}
                disabled={busy}
              >
                <option value="kid">Kid</option>
                <option value="teen">Teen</option>
                <option value="adult">Adult</option>
              </select>
            </label>
          </div>

          <label className="text-sm block">
            <span className="text-neutral-400 block mb-1">
              What do you want out of this report? (one sentence)
            </span>
            <input
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy}
              placeholder="e.g. I want to stop blundering pieces in the middlegame"
            />
          </label>

          <label className="text-sm block">
            <span className="text-neutral-400 block mb-1">
              Openings you usually play (optional)
            </span>
            <input
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
              value={openingsPlayed}
              onChange={(e) => setOpeningsPlayed(e.target.value)}
              disabled={busy}
              placeholder="e.g. Italian Game as White, Caro-Kann as Black"
            />
          </label>

          <button
            onClick={run}
            disabled={busy || !username.trim() || !goal.trim()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:cursor-not-allowed font-medium transition"
          >
            {busy ? "Analyzing…" : "Submit for Premium Report"}
          </button>

          {progress && (
            <div className="pt-2">
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-sm text-neutral-400 mt-2">{progress.message}</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
