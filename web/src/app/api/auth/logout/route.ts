import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// POST /api/auth/logout — clears cookie + deletes session row.
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
