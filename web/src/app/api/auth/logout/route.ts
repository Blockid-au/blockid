import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// POST /api/auth/logout — clears cookie + deletes session row, then redirect home.
export async function POST() {
  await destroySession();
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"),
  );
}

export const dynamic = "force-dynamic";
