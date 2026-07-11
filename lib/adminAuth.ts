import { NextRequest } from "next/server";

/**
 * Minimal shared-secret gate for the internal admin review dashboard
 * (Developer Spec 2.2 step 6-7). This is a single-founder internal tool,
 * not a multi-user auth system — a shared secret set via the ADMIN_SECRET
 * env var is enough protection for this stage.
 */
export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // fail closed if not configured
  const provided = req.headers.get("x-admin-key");
  return provided === expected;
}
