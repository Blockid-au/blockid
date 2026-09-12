import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan } from "@/lib/plans";
import { sendEmail, sendPaymentLink } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { isFoundingPromoActive } from "@/lib/founding-promo";
import { apiRoute } from "@/lib/audit/api-route";

// QA-3 P1-9 (2026-09-12) — the contact form notified nobody and had no bot
// defence. Now: a hidden honeypot field (`company_website`) that humans never
// fill — a non-empty value is dropped silently with the same 200 a real lead
// gets, so the bot learns nothing; `?topic=` from the page is carried in the
// payload and drives the alert subject; and every source="contact" lead
// pages ops on Telegram and lands in the support inbox. The IP rate limit
// (10 / 10 min) lives in src/proxy.ts (bucket "lead").
export const HONEYPOT_FIELD = "company_website";
export const SUPPORT_INBOX = "support@blockid.au";
export const CONTACT_TOPICS = ["general", "demo", "sales", "support", "legal", "partnership", "press"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export function normaliseTopic(raw: unknown): ContactTopic {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (CONTACT_TOPICS as readonly string[]).includes(v) ? (v as ContactTopic) : "general";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clip(s: unknown, max: number): string {
  return typeof s === "string" ? s.slice(0, max) : "";
}

/** Page ops + the support inbox for a contact-form lead. Fire-and-forget. */
export function notifyContactLead(args: {
  email: string;
  topic: ContactTopic;
  name: string;
  message: string;
  ip: string | null;
}): void {
  const subject = `[Contact · ${args.topic}] ${args.name || args.email}`;
  const text = [
    `📨 *Contact form* — ${args.topic}`,
    `From: ${args.name ? `${args.name} <${args.email}>` : args.email}`,
    args.ip ? `IP: ${args.ip}` : null,
    "",
    args.message.slice(0, 1500),
    "",
    "Reply from support@blockid.au · /admin/leads",
  ]
    .filter((l) => l !== null)
    .join("\n");
  sendTelegram(text).catch((err) => console.error("[blockid:lead] telegram alert failed", err));
  sendEmail({
    to: SUPPORT_INBOX,
    subject,
    html: `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
  <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin:0 0 8px">Contact form · ${escapeHtml(args.topic)}</p>
  <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(args.name || args.email)}</h1>
  <p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${escapeHtml(args.email)}">${escapeHtml(args.email)}</a></p>
  ${args.ip ? `<p style="margin:0 0 12px;color:#64748b;font-size:12px">IP: ${escapeHtml(args.ip)}</p>` : ""}
  <pre style="white-space:pre-wrap;font:inherit;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">${escapeHtml(args.message)}</pre>
  <p style="font-size:12px;color:#64748b;margin-top:16px">Reply directly to the founder. The lead is also listed at /admin/leads. Internal notification — Auschain PTY LTD.</p>
</body></html>`,
  }).catch((err) => console.error("[blockid:lead] support email failed", err));
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

// Zod ceiling schema — CISO P1 (2026-08-23 audit). Runs AFTER the existing
// email/source validators so their tested error strings ("Valid email is
// required", "source is required") are preserved for backward-compat.
const LeadSchema = z
  .object({
    email: z.string().email().max(320),
    source: z.string().max(128),
    payload: z.unknown().optional(),
  })
  .strip();

// POST /api/lead
// Captures a lead from the marketing surfaces. Persists to Supabase if
// configured, otherwise logs to console. Always returns { ok: true } on a
// well-formed request — we never want to block the funnel on infra issues.
//
// When source === "founding50" and Stripe is configured, also creates a
// Checkout Session and emails the payment link to the user.
async function POST_handler(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { source, email, payload } =
    (body as {
      source?: string;
      email?: string;
      payload?: unknown;
    }) ?? {};

  // Honeypot — checked on the raw body AND inside payload (the form posts
  // it at top level; a scraper replaying the JSON shape may nest it).
  const rawPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const honey = (body as Record<string, unknown>)?.[HONEYPOT_FIELD] ?? rawPayload[HONEYPOT_FIELD];
  if (typeof honey === "string" && honey.trim() !== "") {
    console.warn("[blockid:lead] honeypot tripped — dropped", { source: typeof source === "string" ? source : null });
    return NextResponse.json({ ok: true });
  }

  // Sanitize email: reject HTML tags, scripts, and invalid formats
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || typeof email !== "string" || !emailRegex.test(email) || /<|>|script/i.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!source || typeof source !== "string") {
    return NextResponse.json(
      { ok: false, error: "source is required" },
      { status: 400 },
    );
  }

  // Strip HTML tags from all string values in payload to prevent stored XSS
  function stripHtml(val: unknown): unknown {
    if (typeof val === "string") return val.replace(/<[^>]*>/g, "");
    if (Array.isArray(val)) return val.map(stripHtml);
    if (val && typeof val === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[k] = stripHtml(v);
      }
      return out;
    }
    return val;
  }

  const safePayload =
    payload && typeof payload === "object" ? stripHtml(payload) : {};
  if (safePayload && typeof safePayload === "object") {
    delete (safePayload as Record<string, unknown>)[HONEYPOT_FIELD];
  }
  // `?topic=` from /contact (demo / legal / sales …) — normalised so the
  // alert subject and /admin/leads filter on a closed set.
  const topic = normaliseTopic((safePayload as Record<string, unknown>).topic);
  if (source === "contact") (safePayload as Record<string, unknown>).topic = topic;

  // Zod ceiling check — protects against oversized email/source strings that
  // slipped past the format regex. Runs post-normalisation so the tested
  // "Valid email is required" / "source is required" strings remain intact.
  const zparse = LeadSchema.safeParse({ email, source, payload: safePayload });
  if (!zparse.success) {
    console.warn("[blockid:lead] zod validation failed", {
      issues: zparse.error.issues.map((i) => ({ path: i.path, code: i.code })),
    });
    return NextResponse.json(
      { ok: false, error: "invalid_input", issues: zparse.error.issues },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("leads").insert({
      email,
      source,
      payload: safePayload,
    });
    if (error) {
      // Don't block the funnel — log and still return ok.
      console.error("[blockid:lead] Supabase insert failed", error);
    }
  } else {
    console.warn("[blockid:lead] Supabase not configured — logging only", {
      at: new Date().toISOString(),
      source,
      email,
      payload: safePayload,
    });
  }

  if (source === "contact") {
    const p = safePayload as Record<string, unknown>;
    notifyContactLead({
      email,
      topic,
      name: clip(p.name, 120).trim(),
      message: clip(p.message, 4000).trim(),
      ip: clientIp(request),
    });
  }

  // --- Founding 50: create Stripe Checkout Session + email payment link ------
  let checkoutUrl: string | undefined;

  // Post-cutover guard — refuse to mint Stripe checkout sessions for the
  // Founding 100 A$5 promo once the window has closed (2026-09-01 UTC).
  // Mirrors /api/stripe/checkout so a stale /founding-50 page or an old
  // email link cannot backdoor a new founding50 subscription after cutover.
  // Waitlist inserts (this route always writes to `leads`) still succeed —
  // only the Stripe side-effect is gated.
  if (source === "founding50" && !isFoundingPromoActive()) {
    return NextResponse.json(
      {
        ok: true,
        message:
          "The Founding 100 A$5 promo ended on 2026-08-31. See /pricing for the Growth plan.",
        promo_ended: true,
      },
    );
  }

  if (source === "founding50") {
    const priceId = STRIPE_PRICE_MAP.founding50;
    const stripe = isStripeConfigured() ? getStripe() : null;

    if (stripe && priceId) {
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"
      ).replace(/\/$/, "");

      try {
        const session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer_email: email,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${siteUrl}/checkout/success?plan=founding50`,
            // QA-3 P2: /founding-50 was deleted 2026-09-07 (404) — land on /pricing.
            cancel_url: `${siteUrl}/pricing`,
            metadata: {
              blockid_source: "founding50",
              blockid_email: email,
              // No blockid_user_id at lead stage — the user hasn't signed up yet.
              // The webhook handler will fall back to email-based lookup when
              // blockid_user_id is absent but blockid_plan + blockid_email are set.
              blockid_plan: "founding50",
            },
            allow_promotion_codes: true,
          },
          {
            idempotencyKey: sessionIdempotencyKey("founding50", [
              email.toLowerCase().trim(),
              priceId,
            ]),
          },
        );

        checkoutUrl = session.url ?? undefined;
      } catch (err) {
        // Don't block the funnel — log and fall through without a checkout URL.
        console.error(
          "[blockid:lead] Stripe checkout session creation failed",
          err,
        );
      }

      // Send the payment link email (fire-and-forget; don't block response).
      if (checkoutUrl) {
        const typedPayload = safePayload as Record<string, unknown>;
        const plan = getPlan("founding50");

        const finalPrice =
          typeof typedPayload.finalPrice === "number"
            ? typedPayload.finalPrice
            : 49;

        const name =
          typeof typedPayload.name === "string" && typedPayload.name
            ? typedPayload.name
            : email;

        sendPaymentLink({
          to: email,
          name,
          checkoutUrl,
          finalPrice,
          features: plan?.features ?? [],
        }).catch((err) => {
          console.error("[blockid:lead] Failed to send payment link email", err);
        });
      }
    } else {
      console.warn(
        "[blockid:lead] Stripe not configured or founding50 price ID missing — skipping checkout session",
      );
    }
  }

  return NextResponse.json({ ok: true, ...(checkoutUrl ? { checkoutUrl } : {}) });
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/lead/route.ts", method: "POST" }, POST_handler);
