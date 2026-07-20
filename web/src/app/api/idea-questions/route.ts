import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  generateInitialQuestions,
  synthesizeRecommendation,
} from "@/lib/first-principles-engine";

const MAX_IDEA_LEN = 4000;
const MAX_ANSWER_KEYS = 10;
const MAX_ANSWER_LEN = 1000;

function sanitizeAnswers(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, MAX_ANSWER_KEYS);
  const clean: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (typeof k !== "string" || k.length === 0 || k.length > 64) continue;
    if (typeof v !== "string") continue;
    clean[k] = v.slice(0, MAX_ANSWER_LEN);
  }
  return clean;
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { ideaText, answers } = (body as Record<string, unknown>) ?? {};
  if (typeof ideaText !== "string" || !ideaText.trim()) {
    return NextResponse.json(
      { ok: false, error: "ideaText required" },
      { status: 400 },
    );
  }

  const trimmedIdea = ideaText.slice(0, MAX_IDEA_LEN);

  // Step 1: no answers yet — return questions only.
  if (answers === undefined || answers === null) {
    const questions = generateInitialQuestions(trimmedIdea);
    return NextResponse.json({ ok: true, questions });
  }

  const cleanAnswers = sanitizeAnswers(answers);
  if (!cleanAnswers) {
    return NextResponse.json(
      { ok: false, error: "answers must be an object of string→string" },
      { status: 400 },
    );
  }

  const recommendation = synthesizeRecommendation(trimmedIdea, cleanAnswers);

  // Best-effort persistence — logged-in users get associated, guests still
  // land in the table via email if provided, otherwise anonymised.
  if (isSupabaseConfigured()) {
    try {
      const user = await getCurrentUser();
      const supabase = getSupabaseAdmin();
      if (supabase) {
        await supabase.from("first_principles_sessions").insert({
          user_id: user?.id ?? null,
          email: user?.email ?? null,
          idea_text: trimmedIdea,
          answers: cleanAnswers,
          recommendation,
        });
      }
    } catch (err) {
      console.error("[blockid:idea-questions] persist failed", err);
    }
  }

  return NextResponse.json({ ok: true, recommendation });
}

export const dynamic = "force-dynamic";
