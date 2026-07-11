import jsPDF from "jspdf";
import { Report } from "./types";

export function generateReportPdf(report: Report): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  const line = (text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) => {
    const { size = 11, bold = false, gap = 16 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    wrapped.forEach((w: string) => {
      if (y > 780) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += gap;
    });
  };

  line("AI Chess Report Card", { size: 20, bold: true, gap: 26 });
  line(`Player: ${report.username} (${report.platform === "lichess" ? "Lichess" : "Chess.com"})`, {
    size: 11,
  });
  line(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, { size: 9, gap: 20 });

  line("Summary", { size: 14, bold: true, gap: 18 });
  line(
    `Games analyzed: ${report.gamesAnalyzed} | Record: ${report.record.wins}W-${report.record.losses}L-${report.record.draws}D | Avg. accuracy: ${report.averageAccuracy}%`
  );
  line(
    `Blunders: ${report.totals.blunders} | Mistakes: ${report.totals.mistakes} | Inaccuracies: ${report.totals.inaccuracies}`,
    { gap: 22 }
  );

  line("Your 3-Point Practice Plan", { size: 14, bold: true, gap: 18 });
  report.practicePlan.forEach((p, i) => line(`${i + 1}. ${p}`, { gap: 16 }));
  y += 6;

  if (report.recurringOpenings.length) {
    line("Recurring Openings", { size: 14, bold: true, gap: 18 });
    report.recurringOpenings.slice(0, 5).forEach((o) => {
      line(
        `${o.opening} — played ${o.timesPlayed}x, ${o.losses} loss(es), ${o.blundersIn} blunder(s)`
      );
    });
    y += 6;
  }

  line("Game-by-Game Breakdown", { size: 14, bold: true, gap: 18 });
  report.games.forEach((g) => {
    const opponent = g.playerColor === "w" ? g.black : g.white;
    const colorLabel = g.playerColor === "w" ? "White" : "Black";
    line(
      `#${g.index + 1} vs ${opponent} (${colorLabel}) — ${g.result.toUpperCase()} — opening: ${g.opening} — accuracy ${g.accuracy}%`,
      { bold: true, gap: 15 }
    );
    line(
      `   Blunders ${g.blunders}, mistakes ${g.mistakes}, inaccuracies ${g.inaccuracies}.` +
        (g.worstMoment
          ? ` Game likely turned at move ${g.worstMoment.moveNumber} (${g.worstMoment.san}), a ${g.worstMoment.severity} in the ${g.worstMoment.phase}.`
          : ""),
      { size: 10, gap: 18 }
    );
  });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Free MVP demo — rule-based analysis from local Stockfish evaluation, not human-reviewed.",
    margin,
    820
  );

  doc.save(`chess-report-card-${report.username}.pdf`);
}
