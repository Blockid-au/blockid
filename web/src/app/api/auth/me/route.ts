import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// GET /api/auth/me
// Returns the current authenticated user (id, email, plan, role) or
// { ok: false } when not logged in.  Used by client components that need
// to adapt UI based on auth / plan status without a full page reload.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, user: null });
  }
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      plan: user.plan,
      role: user.role,
      displayName: user.displayName,
    },
  });
}

export const dynamic = "force-dynamic";
