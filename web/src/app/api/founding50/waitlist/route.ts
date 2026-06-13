// POST /api/founding50/waitlist — capture email when Founding 50 spots are full
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const { email, name } = parsed.data;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, message: "Waitlisted" });
  }

  const supabase = getSupabaseAdmin()!;

  const { error } = await supabase.from("founding50_waitlist").upsert(
    { email: email.toLowerCase().trim(), name: name ?? null, joined_at: new Date().toISOString() },
    { onConflict: "email", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[blockid:founding50:waitlist]", error.message);
    return NextResponse.json({ ok: false, error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "You're on the waitlist!" });
}
