// GET /api/admin/uptime-guardian
//
// Returns recent uptime-guardian.jsonl snapshots + current health signals.
// Admin-gated.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";

export const dynamic = "force-dynamic";

const HISTORY = join(
  "/home/dovanlong/blockid.au",
  "web",
  "content",
  "reports",
  "uptime-guardian.jsonl",
);

async function readTail(path: string, lines: number): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    const all = raw.split("\n").filter((l) => l.length > 0);
    return all.slice(-lines);
  } catch {
    return [];
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

  const tail = await readTail(HISTORY, 120); // last ~4 hours at 2 min/tick
  const rows = tail
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const latest = rows[rows.length - 1] ?? null;

  return NextResponse.json({
    ok: true,
    latest,
    history: rows,
    generated_at: new Date().toISOString(),
  });
}
