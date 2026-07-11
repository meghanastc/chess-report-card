import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/adminAuth";
import { getReport, listApprovedReportIds, listPendingReportIds } from "@/lib/kv";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [pendingIds, approvedIds] = await Promise.all([
      listPendingReportIds(),
      listApprovedReportIds(),
    ]);
    const ids = [...pendingIds, ...approvedIds];
    const records = await Promise.all(ids.map((id) => getReport(id)));
    const summaries = records
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        username: r.intake.username,
        platform: r.intake.platform,
        rating: r.intake.rating,
        gamesAnalyzed: r.analysis.gamesAnalyzed,
      }));
    return NextResponse.json({ reports: summaries });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not list reports" },
      { status: 500 }
    );
  }
}
