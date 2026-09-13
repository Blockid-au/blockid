// Admin gate shared by /api/admin/sector-multiples/** (S27-C).
//
// Same helper every /api/admin/** route uses (lib/reseller/require-admin
// `requireAdmin` over `getCurrentUser()`), with the two failure modes kept
// distinct — 401 when there is no session, 403 when the session is not an
// admin — so the review UI can tell "log in" from "not allowed".
//
// Body shape (live QA lane 2 P3-a, 2026-09-13): the 401 carries the standard
// `{ ok: false, error: "unauthorized" }` every other route answers with, the
// 403 `{ ok: false, error: "not_admin" }`. `reason` mirrors `error` on both
// so the review client (which read `reason`) keeps working.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { AdminGateError, requireAdmin } from "@/lib/reseller/require-admin";

export async function sectorMultiplesAdminGate(): Promise<{ user: AppUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
    return { user };
  } catch (err) {
    if (err instanceof AdminGateError) {
      const status = err.code === "no_user" ? 401 : 403;
      const error = err.code === "no_user" ? "unauthorized" : "not_admin";
      return { response: NextResponse.json({ ok: false, error, reason: error }, { status }) };
    }
    throw err;
  }
}
