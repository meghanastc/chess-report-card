// Persistent, server-side usage counter for the Free Tier's "3 reports per
// username" cap (Developer Spec 1.4). Backed by Upstash Redis (connected to
// this Vercel project via the Storage tab, which auto-populates the
// KV_REST_API_URL / KV_REST_API_TOKEN env vars used below). This is
// deliberately NOT tied to a browser cookie, so it can't be reset by
// clearing cookies — the counter key is the chess username itself.
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

function getClient(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Redis is not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)"
    );
  }
  client = new Redis({ url, token });
  return client;
}

export const FREE_TIER_MAX_USES = 3;

function usageKey(platform: string, username: string): string {
  return `free_reports_used:${platform}:${username.trim().toLowerCase()}`;
}

export interface UsageStatus {
  used: number;
  remaining: number;
  blocked: boolean;
}

export async function getFreeTierUsage(
  platform: string,
  username: string
): Promise<UsageStatus> {
  const redis = getClient();
  const used = (await redis.get<number>(usageKey(platform, username))) ?? 0;
  return {
    used,
    remaining: Math.max(0, FREE_TIER_MAX_USES - used),
    blocked: used >= FREE_TIER_MAX_USES,
  };
}

/** Atomically increments the counter and returns the new usage status. */
export async function incrementFreeTierUsage(
  platform: string,
  username: string
): Promise<UsageStatus> {
  const redis = getClient();
  const used = await redis.incr(usageKey(platform, username));
  return {
    used,
    remaining: Math.max(0, FREE_TIER_MAX_USES - used),
    blocked: used >= FREE_TIER_MAX_USES,
  };
}

// ---------- Premium report queue (admin review dashboard) ----------
// Stored in the same Redis instance as the usage counter above. There's no
// separate database for this project — a small JSON blob per report plus a
// couple of ID-list keys is enough at this scale and costs nothing extra.
import { PremiumReportRecord } from "./types";

const PENDING_LIST_KEY = "premium_reports:pending";
const APPROVED_LIST_KEY = "premium_reports:approved";

function reportKey(id: string): string {
  return `premium_report:${id}`;
}

export async function savePendingReport(record: PremiumReportRecord): Promise<void> {
  const redis = getClient();
  await redis.set(reportKey(record.id), record);
  await redis.lpush(PENDING_LIST_KEY, record.id);
}

export async function getReport(id: string): Promise<PremiumReportRecord | null> {
  const redis = getClient();
  return (await redis.get<PremiumReportRecord>(reportKey(id))) || null;
}

export async function listPendingReportIds(): Promise<string[]> {
  const redis = getClient();
  return (await redis.lrange<string>(PENDING_LIST_KEY, 0, -1)) || [];
}

export async function listApprovedReportIds(): Promise<string[]> {
  const redis = getClient();
  return (await redis.lrange<string>(APPROVED_LIST_KEY, 0, -1)) || [];
}

export async function updateReportSections(
  id: string,
  sections: PremiumReportRecord["sections"]
): Promise<PremiumReportRecord | null> {
  const redis = getClient();
  const existing = await getReport(id);
  if (!existing) return null;
  const updated: PremiumReportRecord = { ...existing, sections };
  await redis.set(reportKey(id), updated);
  return updated;
}

export async function approveReport(id: string): Promise<PremiumReportRecord | null> {
  const redis = getClient();
  const existing = await getReport(id);
  if (!existing) return null;
  const updated: PremiumReportRecord = {
    ...existing,
    status: "approved",
    approvedAt: new Date().toISOString(),
  };
  await redis.set(reportKey(id), updated);
  await redis.lrem(PENDING_LIST_KEY, 0, id);
  await redis.lpush(APPROVED_LIST_KEY, id);
  return updated;
}
