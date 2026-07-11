import jsPDF from "jspdf";
import { PremiumReportRecord } from "./types";

/**
 * Full, branded, multi-page Premium PDF (Developer Spec 2.3): always these
 * 7 sections, in this exact order, no watermark.
 */
export function generatePremiumReportPdf(report: PremiumReportRecord): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const line = (
    text: string,
    opts: { size?: number; bold?: boolean; italic?: boolean; gap?: number; color?: [number, number, number] } = {}
  ) => {
    const { size = 10.5, bold = false, italic = false, gap = 14, color = [25, 25, 25] } = opts;
    doc.setFont("helvetica", italic ? "italic" : bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    wrapped.forEach((w: string) => {
      ensureSpace(gap);
      doc.text(w, margin, y);
      y += gap;
    });
  };

  const sectionHeading = (n: number, title: string) => {
    ensureSpace(30);
    y += 6;
    doc.setDrawColor(16, 120, 90);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
    line(`${n}. ${title}`, { size: 14, bold: true, gap: 18, color: [16, 90, 70] });
  };

  // Header / branding
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(16, 90, 70);
  doc.text("AI Chess Report Card — Premium", margin, y);
  y += 26;
  line(
    `${report.intake.username} (${report.intake.platform === "lichess" ? "Lichess" : "Chess.com"}) — rating ${report.intake.rating}, ${report.intake.format}`,
    { size: 11, color: [80, 80, 80], gap: 16 }
  );
  line(
    `${report.analysis.gamesAnalyzed} games analyzed · overall accuracy ${report.analysis.overallAccuracy}% · record ${report.analysis.record.wins}W-${report.analysis.record.losses}L-${report.analysis.record.draws}D`,
    { size: 10, color: [80, 80, 80], gap: 20 }
  );

  // 1. Opening
  sectionHeading(1, "Opening");
  report.analysis.games.forEach((g) => {
    const prefix = g.eco ? `${g.eco} — ${g.opening}` : g.opening;
    line(`Game ${g.index + 1}: ${prefix}`, { bold: true, size: 10, gap: 13 });
    if (g.divergence) {
      line(
        `  Left the main line on move ${g.divergence.moveNumber}: book move was ${g.divergence.bookMove}, played ${g.divergence.actualMove} instead — ${g.divergence.wasFine ? "engine still rated this fine" : "this was a real mistake (engine score dropped)"}.`,
        { size: 9.5, gap: 12 }
      );
    } else {
      line("  Stayed on well-known opening theory for the moves we could match.", {
        size: 9.5,
        gap: 12,
      });
    }
  });
  y += 4;
  line(report.sections.opening, { size: 10, gap: 13 });

  // 2. Middlegame
  sectionHeading(2, "Middlegame");
  line(report.sections.middlegame, { size: 10, gap: 13 });

  // 3. Endgame
  sectionHeading(3, "Endgame");
  line(report.sections.endgame, { size: 10, gap: 13 });

  // 4. Time management
  sectionHeading(4, "Time Management");
  const totalLowTime = report.analysis.games.reduce((a, g) => a + g.lowTimeMistakes, 0);
  line(`Low-on-clock mistakes across all games: ${totalLowTime}.`, {
    size: 9.5,
    italic: true,
    gap: 13,
  });
  line(report.sections.timeManagement, { size: 10, gap: 13 });

  // 5. Tactical pattern audit
  sectionHeading(5, "Tactical Pattern Audit");
  line(report.sections.tacticalPatternAudit, { size: 10, gap: 13 });

  // 6. This week's 3-point plan
  sectionHeading(6, "This Week's 3-Point Plan");
  report.sections.threePointPlan.forEach((p, i) => line(`${i + 1}. ${p}`, { size: 10, gap: 14 }));

  // 7. Recommended resources
  sectionHeading(7, "Recommended Resources");
  line(`Suggested repertoire (${report.repertoireLabel}):`, { bold: true, size: 10, gap: 13 });
  if (report.repertoireBespoke) {
    line("  This rating band gets a bespoke, human-built repertoire rather than a fixed table.", {
      size: 9.5,
      gap: 12,
    });
  } else {
    if (report.repertoireForWhite) line(`  As White: ${report.repertoireForWhite}`, { size: 9.5, gap: 12 });
    if (report.repertoireVsE4) line(`  vs 1.e4 as Black: ${report.repertoireVsE4}`, { size: 9.5, gap: 12 });
    if (report.repertoireVsD4) line(`  vs 1.d4 as Black: ${report.repertoireVsD4}`, { size: 9.5, gap: 12 });
  }
  y += 4;
  line(report.sections.repertoireWhyItFits, { size: 10, gap: 13 });
  y += 6;
  line("Recommended books:", { bold: true, size: 10, gap: 13 });
  if (report.books.length === 0) {
    line("  No fixed book list for this rating band.", { size: 9.5, gap: 12 });
  } else {
    report.books.forEach((b) => line(`  • ${b}`, { size: 9.5, gap: 12 }));
  }

  doc.save(`chess-report-card-premium-${report.intake.username}.pdf`);
}
