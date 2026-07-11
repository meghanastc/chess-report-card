import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/adminAuth";
import { approveReport, getReport, updateReportSections } from "@/lib/kv";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: { sections?: any; approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.sections) {
      const updated = await updateReportSections(id, body.sections);
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (body.approve) {
        const approved = await approveReport(id);
        return NextResponse.json({ report: approved });
      }
      return NextResponse.json({ report: updated });
    }
    if (body.approve) {
      const approved = await approveReport(id);
      if (!approved) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ report: approved });
    }
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not update report" },
      { status: 500 }
    );
  }
}
