// POST /api/pilot/apply — the /pilot page's application form (G16-C).
//
// Anonymous (no account needed). In order:
//   1. honeypot (`company_website`) filled → 204, nothing stored, nothing
//      sent (the bot learns nothing);
//   2. per-IP rate limit (5 / 10 min, lib/rate-limit `enforceRateLimit`)
//      → 429 + Retry-After;
//   3. zod (`PilotApplySchema`) → 400 { error: "invalid_input", issues };
//   4. append to content/reports/pilot-applications.jsonl (gitignored, live
//      checkout), ops alert (Telegram → e-mail fallback), auto-reply to the
//      applicant — alert + auto-reply are best-effort;
//   5. 200 { ok: true, id }.
//
// Audited by apiRoute (anonymous actor; no PII in the audit row).

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";
import { APPLY_RATE_LIMIT, HONEYPOT_FIELD, PilotApplySchema, appendApplication, applicationAlertText, applicationAutoReply, newApplication } from "@/lib/pilots/applications";
import { resolvePilotsRoot } from "@/lib/pilots/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request): string | null {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const hops = (request.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? request.headers.get("x-real-ip") ?? null;
}

async function POST_handler(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_input", message: "JSON body required" }, { status: 400 });

  const honey = body[HONEYPOT_FIELD];
  if (typeof honey === "string" && honey.trim() !== "") {
    console.warn("[blockid:pilot-apply] honeypot tripped — dropped");
    return new NextResponse(null, { status: 204 });
  }

  const limited = enforceRateLimit("pilot-apply", null, request, APPLY_RATE_LIMIT.max, APPLY_RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = PilotApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 400 });
  }

  const row = newApplication(parsed.data, clientIp(request));
  try {
    await appendApplication(await resolvePilotsRoot(), row);
  } catch (err) {
    console.error("[blockid:pilot-apply] store failed", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "store_failed", message: "Could not save the application — e-mail support@blockid.au" }, { status: 500 });
  }

  sendTelegram(applicationAlertText(row)).catch((err) => console.error("[blockid:pilot-apply] alert failed", err));
  const reply = applicationAutoReply(row);
  sendEmail({ to: row.email, subject: reply.subject, html: reply.html, text: reply.text }).catch((err) => console.error("[blockid:pilot-apply] auto-reply failed", err));

  return NextResponse.json({ ok: true, id: row.id });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/pilot/apply/route.ts", method: "POST" }, POST_handler);
