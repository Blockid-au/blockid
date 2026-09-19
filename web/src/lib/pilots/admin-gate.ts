// G16-C — the 401 / 403 ladder shared by the /api/admin/pilots routes.
// (A route file may only export Next's handler fields, so this lives here.)

import { NextResponse } from "next/server";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { AdminGateError, requireAdmin } from "@/lib/reseller/require-admin";

export type AdminGate = { user: AppUser; response: null } | { user: null; response: NextResponse };

/** 401 anon / 403 signed-in non-admin. */
export async function gateAdmin(): Promise<AdminGate> {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
    return { user, response: null };
  } catch (err) {
    if (err instanceof AdminGateError) {
      const status = err.code === "no_user" ? 401 : 403;
      return { user: null, response: NextResponse.json({ ok: false, error: err.code }, { status }) };
    }
    throw err;
  }
}
