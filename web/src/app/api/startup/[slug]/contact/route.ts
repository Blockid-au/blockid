// POST /api/startup/[slug]/contact — public contact-founder form for
// /startup/[slug] Package listings (subgoal 9).
//
// Anonymous: no getCurrentUser gate — this is the *public* CTA a visitor
// hits when the founder hasn't opted into a mailto link. Rate-limited via
// consumeRateLimit keyed on x-forwarded-for so a script can't hammer
// founders. Sends the message to the founder's email through the shared
// email sender; the founder receives a plain-text intro + reply address.
//
// Fields (all trimmed + length-capped):
//   from_name  string (1-120 chars)
//   from_email string (RFC-5321-ish, 3-254 chars, must contain "@")
//   message    string (10-2000 chars)
//
// Response envelope: { ok: boolean, reason?: string }.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ContactPayload {
  from_name: string;
  from_email: string;
  message: string;
}

function bad(reason: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

function normalise(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function parseBody(raw: unknown): ContactPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const from_name = normalise(src.from_name, 1, 120);
  const from_email = normalise(src.from_email, 3, 254);
  const message = normalise(src.message, 10, 2000);
  if (!from_name || !from_email || !message) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from_email)) return null;
  return { from_name, from_email, message };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!slug || !/^[a-z0-9-]{1,80}$/i.test(slug)) return bad("invalid_slug", 400);

  // Fail-open rate-limit anchor: prefer the x-forwarded-for, fall back to
  // the connection-info header set by Next.js (available in Node runtime).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  const rl = await consumeRateLimit({
    bucket: "startup_listing.contact",
    actorId: ip,
    limit: 3,
    windowSeconds: 300,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        retry_after_seconds: rl.retry_after_seconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  let payload: ContactPayload | null;
  try {
    payload = parseBody(await request.json());
  } catch {
    return bad("invalid_body", 400);
  }
  if (!payload) return bad("invalid_fields", 422);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("service_unavailable", 503);

  // Resolve founder email via project.slug → app_users.email.
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, name")
    .eq("slug", slug)
    .not("package_purchased_at", "is", null)
    .maybeSingle();
  if (!project) return bad("not_found", 404);

  const { data: founder } = await supabase
    .from("app_users")
    .select("email, display_name")
    .eq("id", (project as { user_id: string }).user_id)
    .maybeSingle();
  if (!founder || !(founder as { email?: string }).email) {
    return bad("founder_unreachable", 404);
  }

  const founderEmail = (founder as { email: string }).email;
  const projectName = (project as { name: string }).name;

  // Persist the message for the founder's console — best-effort, non-fatal.
  try {
    await supabase.from("startup_listing_messages").insert({
      project_slug: slug,
      project_id: (project as { id: string }).id,
      from_name: payload.from_name,
      from_email: payload.from_email,
      message: payload.message,
    });
  } catch {
    // Table may not exist yet (migration 0116 in a sibling cluster) — the
    // email delivery below is the ship-1 contract; the archive is nice to
    // have but must not block the founder ever getting the ping.
  }

  const subject = `[BlockID] New enquiry for ${projectName}`;
  const escaped = {
    name: escapeHtml(payload.from_name),
    email: escapeHtml(payload.from_email),
    message: escapeHtml(payload.message).replace(/\n/g, "<br/>"),
    slug: escapeHtml(slug),
    project: escapeHtml(projectName),
  };
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a">
    <p>Someone visited your public <a href="https://blockid.au/startup/${escaped.slug}">/startup/${escaped.slug}</a> listing for <strong>${escaped.project}</strong> and reached out.</p>
    <p><strong>From:</strong> ${escaped.name} &lt;<a href="mailto:${escaped.email}">${escaped.email}</a>&gt;</p>
    <p><strong>Message:</strong></p>
    <blockquote style="border-left:3px solid #22d3ee;padding-left:12px;color:#334155">${escaped.message}</blockquote>
    <p style="font-size:12px;color:#64748b">Reply directly — this email was sent on their behalf by BlockID.</p>
  </body></html>`;
  await sendEmail({
    to: founderEmail,
    subject,
    html,
  });

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
