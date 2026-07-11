"use client";

import { useCallback, useEffect, useState } from "react";
import { generatePremiumReportPdf } from "@/lib/premiumPdf";
import { PremiumReportRecord } from "@/lib/types";

interface ReportSummary {
  id: string;
  status: string;
  createdAt: string;
  username: string;
  platform: string;
  rating: number;
  gamesAnalyzed: number;
}

interface EditableSections {
  opening: string;
  middlegame: string;
  endgame: string;
  timeManagement: string;
  tacticalPatternAudit: string;
  repertoireWhyItFits: string;
  threePointPlan: string;
}

function toEditable(report: PremiumReportRecord): EditableSections {
  return {
    opening: report.sections.opening,
    middlegame: report.sections.middlegame,
    endgame: report.sections.endgame,
    timeManagement: report.sections.timeManagement,
    tacticalPatternAudit: report.sections.tacticalPatternAudit,
    repertoireWhyItFits: report.sections.repertoireWhyItFits,
    threePointPlan: report.sections.threePointPlan.join("\n"),
  };
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PremiumReportRecord | null>(null);
  const [edit, setEdit] = useState<EditableSections | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("admin_key") : null;
    if (stored) {
      setAdminKey(stored);
      setUnlocked(true);
    }
  }, []);

  const loadList = useCallback(async (key: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reports");
      setReports(data.reports || []);
    } catch (err: any) {
      setListError(err?.message || "Failed to load reports");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && adminKey) loadList(adminKey);
  }, [unlocked, adminKey, loadList]);

  const unlock = () => {
    if (!keyInput.trim()) return;
    localStorage.setItem("admin_key", keyInput.trim());
    setAdminKey(keyInput.trim());
    setUnlocked(true);
  };

  const openReport = useCallback(
    async (id: string) => {
      setLoadingReport(true);
      setSaveMsg(null);
      setSelected(null);
      setEdit(null);
      try {
        const res = await fetch(`/api/admin/reports/${id}`, {
          headers: { "x-admin-key": adminKey },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load report");
        setSelected(data.report);
        setEdit(toEditable(data.report));
      } catch (err: any) {
        setListError(err?.message || "Failed to load report");
      } finally {
        setLoadingReport(false);
      }
    },
    [adminKey]
  );

  const saveDraft = useCallback(
    async (approve: boolean) => {
      if (!selected || !edit) return;
      setSaving(true);
      setSaveMsg(null);
      try {
        const sections = {
          ...selected.sections,
          opening: edit.opening,
          middlegame: edit.middlegame,
          endgame: edit.endgame,
          timeManagement: edit.timeManagement,
          tacticalPatternAudit: edit.tacticalPatternAudit,
          repertoireWhyItFits: edit.repertoireWhyItFits,
          threePointPlan: edit.threePointPlan
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        };
        const res = await fetch(`/api/admin/reports/${selected.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ sections, approve }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save");
        setSelected(data.report);
        setEdit(toEditable(data.report));
        setSaveMsg(approve ? "Approved!" : "Draft saved.");
        loadList(adminKey);
      } catch (err: any) {
        setSaveMsg(err?.message || "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [selected, edit, adminKey, loadList]
  );

  const downloadPdf = () => {
    if (!selected || selected.status !== "approved") return;
    generatePremiumReportPdf(selected);
  };

  if (!unlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-sm w-full space-y-4">
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <input
            type="password"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2"
            placeholder="Admin secret"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
          />
          <button
            onClick={unlock}
            className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium"
          >
            Unlock
          </button>
        </div>
      </main>
    );
  }

  const pending = reports.filter((r) => r.status === "pending");
  const approved = reports.filter((r) => r.status === "approved");

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
      <aside className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Premium Reports</h1>
          <button
            onClick={() => loadList(adminKey)}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Refresh
          </button>
        </div>
        {listError && <p className="text-sm text-red-400">{listError}</p>}
        {loadingList && <p className="text-sm text-neutral-500">Loading…</p>}

        <div>
          <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Pending ({pending.length})
          </h2>
          <ul className="space-y-1">
            {pending.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openReport(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                    selected?.id === r.id
                      ? "border-emerald-600 bg-emerald-950/30"
                      : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="font-medium">{r.username}</div>
                  <div className="text-neutral-500 text-xs">
                    {r.platform} · {r.rating} · {r.gamesAnalyzed} games
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Approved ({approved.length})
          </h2>
          <ul className="space-y-1">
            {approved.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openReport(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                    selected?.id === r.id
                      ? "border-emerald-600 bg-emerald-950/30"
                      : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="font-medium">{r.username}</div>
                  <div className="text-neutral-500 text-xs">
                    {r.platform} · {r.rating} · {r.gamesAnalyzed} games
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section>
        {loadingReport && <p className="text-sm text-neutral-500">Loading report…</p>}
        {!selected && !loadingReport && (
          <p className="text-sm text-neutral-500">Select a report from the list.</p>
        )}
        {selected && edit && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {selected.intake.username}{" "}
                  <span className="text-neutral-500 text-sm font-normal">
                    ({selected.status})
                  </span>
                </h2>
                <p className="text-sm text-neutral-500">
                  {selected.intake.platform} · rating {selected.intake.rating} ·{" "}
                  {selected.intake.format} · goal: {selected.intake.goal}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveDraft(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => saveDraft(true)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={selected.status !== "approved"}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Download PDF
                </button>
              </div>
            </div>

            {saveMsg && <p className="text-sm text-emerald-400">{saveMsg}</p>}

            {(
              [
                ["opening", "Opening"],
                ["middlegame", "Middlegame"],
                ["endgame", "Endgame"],
                ["timeManagement", "Time Management"],
                ["tacticalPatternAudit", "Tactical Pattern Audit"],
                ["repertoireWhyItFits", "Why This Repertoire Fits"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-neutral-300 block mb-1">{label}</span>
                <textarea
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm min-h-[100px]"
                  value={edit[key]}
                  onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                />
              </label>
            ))}

            <label className="block">
              <span className="text-sm font-medium text-neutral-300 block mb-1">
                This Week's 3-Point Plan (one per line)
              </span>
              <textarea
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm min-h-[100px]"
                value={edit.threePointPlan}
                onChange={(e) => setEdit({ ...edit, threePointPlan: e.target.value })}
              />
            </label>

            <div className="text-xs text-neutral-500 border-t border-neutral-800 pt-4">
              Repertoire: {selected.repertoireLabel} · Books: {selected.books.join(", ") || "none"}
              {selected.priceInr != null && <> · Price: ₹{selected.priceInr}</>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
