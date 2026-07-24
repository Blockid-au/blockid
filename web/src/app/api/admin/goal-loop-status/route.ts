// GET /api/admin/goal-loop-status
//
// Read-only admin endpoint that merges the three autonomous goal-loop
// status files into a single response so the admin dashboards can render
// live state without shelling out to /tmp/. Sources:
//   - /tmp/blockid-reseller-loop.status
//   - /tmp/blockid-atlassian-loop.status
//   - /tmp/blockid-ux-ia-loop.status
//
// Each is written by scripts/cron/goal-loop.mjs on every tick (a
// JSON.stringify(..., null, 2) snapshot of the last logged row). Loops
// that have never fired return null. Admin-auth only.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";

export const dynamic = "force-dynamic";

const STATUS_FILES = [
  { key: "reseller", path: "/tmp/blockid-reseller-loop.status" },
  { key: "atlassian", path: "/tmp/blockid-atlassian-loop.status" },
  { key: "ux_ia", path: "/tmp/blockid-ux-ia-loop.status" },
] as const;

async function safeReadJson(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }

  const entries = await Promise.all(
    STATUS_FILES.map(async ({ key, path }) => [key, await safeReadJson(path)] as const),
  );

  return NextResponse.json({
    ok: true,
    loops: Object.fromEntries(entries),
    generated_at: new Date().toISOString(),
  });
}
