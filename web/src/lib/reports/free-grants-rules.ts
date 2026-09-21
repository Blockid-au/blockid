// The free allowance — the rules (G25-C, 2026-09-21).
//
// Founder decision 2026-09-21 (verbatim, Vietnamese): "cho phép phân tích 2
// lần đầu miễn phí, nhưng cần ghi nhận email để gởi report về và ghi nhận
// vào hệ thống số lượng người submit và nhận report biz" — the FIRST TWO
// business reports per e-mail address are free, the address is REQUIRED so
// the report can be e-mailed, and the system records how many people
// submitted and how many received the report.
//
// THIS MODULE IS PURE. No database, no cookies, no Next.js, no
// `server-only` — the client copy reads the constants, the route feeds the
// decision function counts, and every branch replays in a unit test in
// microseconds. The I/O (and the sha256 of the address) lives in
// ./free-grants.ts — no `node:crypto` here, so client copy can import the
// constants.
//
// IDENTITY
//   The allowance is counted on the NORMALISED address: lower-cased,
//   trimmed, the `+tag` dropped on every domain, and the dots dropped on the
//   gmail-style domains that ignore them — otherwise `a.b+1@gmail.com`,
//   `ab+2@gmail.com` and `a.b@googlemail.com` would be three free people.
//
// ABUSE GUARD (in this order, cheapest first)
//   1. honeypot field filled → refused as invalid (a bot filled a hidden box);
//   2. disposable-domain list → refused with a specific message;
//   3. ≤ FREE_REPORTS_PER_IP_PER_DAY free reports per IP hash per UTC day
//      (lib/iphash.ts rotates the salt daily — the hash IS the day key);
//   4. the per-address allowance (FREE_REPORTS_PER_EMAIL);
//   5. the platform cap (FREE_REPORTS_DAILY_CAP) — over it the submission
//      is still ACCEPTED and recorded, the report is queued for the cron,
//      and the visitor is told so politely. Never a 500, never a refusal.

/** How many full business reports each address gets for free. */
export const FREE_REPORTS_PER_EMAIL = 2;

/** Free reports one IP hash may start per UTC day. */
export const FREE_REPORTS_PER_IP_PER_DAY = 3;

/** env NAME of the platform-wide daily cap; the default applies when unset / invalid. */
export const FREE_REPORTS_DAILY_CAP_ENV = "FREE_REPORTS_DAILY_CAP";
export const FREE_REPORTS_DAILY_CAP_DEFAULT = 50;

/** Hidden form field a human never fills. Same convention as lib/pilots/applications.ts. */
export const FREE_REPORT_HONEYPOT_FIELD = "company_website";

export type FreeReportSource = "guest" | "account";
export type FreeReportDeliveryStatus = "queued" | "sent" | "failed";

/**
 * Domains whose local part ignores dots. Plus-tags are stripped on EVERY
 * domain — a `+tag` is never a different person.
 */
export const DOT_INSENSITIVE_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
]);

/**
 * Disposable-inbox domains. The same list `api/funding/checkout` and
 * `api/guest-analysis/create-order` carry inline; lifted here so the free
 * path refuses the same addresses.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "spam4.me",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mailnesia.com",
  "mintemail.com",
  "emailondeck.com",
  "mohmal.com",
  "tempr.email",
  "discard.email",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** The address as the ledger's `email` column stores it: trimmed + lower-cased, or null when malformed. */
export function cleanReportEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 254) return null;
  if (!EMAIL_RE.test(value)) return null;
  return value;
}

/**
 * The identity the allowance is counted on. `null` for a malformed address.
 *
 *   "  A.B+news@Gmail.com " → "ab@gmail.com"
 *   "a.b+news@example.com"  → "a.b@example.com"   (dots kept — not gmail-style)
 *   "ab@googlemail.com"     → "ab@googlemail.com" (gmail-style, no alias folding)
 */
export function normaliseReportEmail(raw: unknown): string | null {
  const clean = cleanReportEmail(raw);
  if (!clean) return null;
  const at = clean.lastIndexOf("@");
  let local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, "");
  if (local.length === 0) return null;
  return `${local}@${domain}`;
}

export function isDisposableReportEmail(cleanOrNormalised: string): boolean {
  const at = cleanOrNormalised.lastIndexOf("@");
  if (at < 0) return false;
  return DISPOSABLE_DOMAINS.has(cleanOrNormalised.slice(at + 1));
}

/** The platform cap from the environment; invalid / missing → the default. `0` disables free reports for the day. */
export function freeReportsDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[FREE_REPORTS_DAILY_CAP_ENV];
  if (raw === undefined || raw === null || raw.trim() === "") return FREE_REPORTS_DAILY_CAP_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return FREE_REPORTS_DAILY_CAP_DEFAULT;
  return n;
}

/** Start of the current UTC day, ISO — the window the per-day counts filter on. */
export function utcDayStart(now: number = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** `YYYY-MM-DD` (UTC) — the sparkline's day key. */
export function utcDayKey(iso: string | number | Date): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Machine-readable discriminators the intake route answers with. */
export const FREE_REPORT_EMAIL_REQUIRED = "email_required";
export const FREE_REPORT_EMAIL_INVALID = "email_invalid";
export const FREE_REPORT_EMAIL_DISPOSABLE = "email_disposable";
export const FREE_REPORT_ALLOWANCE_USED = "free_allowance_used";
export const FREE_REPORT_IP_LIMIT = "free_ip_limit";

export interface FreeReportGateInput {
  /** Free reports already granted to this normalised address. */
  used: number;
  /** Free reports this IP hash started today. Null = unknown / no IP (skip the guard). */
  ipToday: number | null;
  /** Free reports submitted platform-wide today (before this one). */
  submittedToday: number;
  /** The platform cap (freeReportsDailyCap()). */
  cap: number;
  /** A paid report entitlement (report.basic / report.premium) bypasses the allowance entirely. */
  paidEntitlement?: boolean;
}

export type FreeReportGateDecision =
  | {
      allow: true;
      reason: "paid_entitlement";
      sequenceNo: null;
      /** The report runs now. */
      queued: false;
    }
  | {
      allow: true;
      reason: "free_allowance";
      /** 1 | 2 — which free report this will be. */
      sequenceNo: 1 | 2;
      /**
       * True when the platform cap is reached: the submission is accepted
       * and recorded, the report is queued for the cron and e-mailed when
       * ready; the page says so instead of streaming.
       */
      queued: boolean;
    }
  | {
      allow: false;
      reason: typeof FREE_REPORT_ALLOWANCE_USED;
      used: number;
      /** The A$3 quote-then-pay path takes over. */
      next: "pay";
    }
  | {
      allow: false;
      reason: typeof FREE_REPORT_IP_LIMIT;
      /** Free reports this IP may start per day. */
      limit: number;
    };

/**
 * Decide whether a submission gets a free report.
 *
 * Order: a paid entitlement is never counted; the IP guard fires before the
 * allowance so an address farm behind one IP stops at three a day; the
 * allowance decides free vs pay; the platform cap only ever changes "now"
 * into "queued" — it never refuses.
 */
export function decideFreeReportGate(input: FreeReportGateInput): FreeReportGateDecision {
  if (input.paidEntitlement) return { allow: true, reason: "paid_entitlement", sequenceNo: null, queued: false };
  const ipToday = input.ipToday === null ? 0 : Math.max(0, Math.floor(input.ipToday));
  if (input.ipToday !== null && ipToday >= FREE_REPORTS_PER_IP_PER_DAY) {
    return { allow: false, reason: FREE_REPORT_IP_LIMIT, limit: FREE_REPORTS_PER_IP_PER_DAY };
  }
  const used = Number.isFinite(input.used) ? Math.max(0, Math.floor(input.used)) : 0;
  if (used >= FREE_REPORTS_PER_EMAIL) {
    return { allow: false, reason: FREE_REPORT_ALLOWANCE_USED, used, next: "pay" };
  }
  const sequenceNo = (used + 1) as 1 | 2;
  const cap = Number.isFinite(input.cap) ? Math.max(0, input.cap) : FREE_REPORTS_DAILY_CAP_DEFAULT;
  const queued = input.submittedToday >= cap;
  return { allow: true, reason: "free_allowance", sequenceNo, queued };
}

/** How many free reports an address has left, from the count used. Never negative. */
export function remainingFrom(used: number): number {
  return Math.max(0, FREE_REPORTS_PER_EMAIL - Math.max(0, Math.floor(used)));
}

/** A ledger row as the metrics reader sees it (the columns it needs). */
export interface FreeReportGrantLite {
  email_hash: string;
  submitted_at: string;
  delivered_at: string | null;
  delivery_status: FreeReportDeliveryStatus;
}

export interface FreeReportDayPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  submitted: number;
  delivered: number;
}

export interface FreeReportMetrics {
  submitted: number;
  delivered: number;
  unique_emails: number;
  /** Submitted today (UTC). */
  today: number;
  cap: number;
  /** Distinct addresses that later paid for a report (guest A$3 order or a member Trusted Business Report order). */
  converted_to_paid: number;
  /** The last 7 UTC days, oldest first, every day present. */
  last_7_days: FreeReportDayPoint[];
}

/** Fold rows into the metrics block. Pure — the reader fetches, this counts. */
export function foldFreeReportMetrics(
  rows: readonly FreeReportGrantLite[],
  opts: { now?: number; cap: number; convertedToPaid?: number },
): FreeReportMetrics {
  const now = opts.now ?? Date.now();
  const todayKey = utcDayKey(now);
  const days: string[] = [];
  for (let i = 6; i >= 0; i -= 1) days.push(utcDayKey(now - i * 24 * 60 * 60 * 1000));
  const byDay = new Map<string, FreeReportDayPoint>(days.map((day) => [day, { day, submitted: 0, delivered: 0 }]));
  const emails = new Set<string>();
  let delivered = 0;
  let today = 0;
  for (const r of rows) {
    emails.add(r.email_hash);
    if (r.delivery_status === "sent") delivered += 1;
    const sKey = utcDayKey(r.submitted_at);
    if (sKey === todayKey) today += 1;
    const s = byDay.get(sKey);
    if (s) s.submitted += 1;
    if (r.delivered_at) {
      const d = byDay.get(utcDayKey(r.delivered_at));
      if (d) d.delivered += 1;
    }
  }
  return {
    submitted: rows.length,
    delivered,
    unique_emails: emails.size,
    today,
    cap: opts.cap,
    converted_to_paid: opts.convertedToPaid ?? 0,
    last_7_days: days.map((day) => byDay.get(day)!),
  };
}

export function emptyFreeReportMetrics(cap: number = FREE_REPORTS_DAILY_CAP_DEFAULT, now: number = Date.now()): FreeReportMetrics {
  return foldFreeReportMetrics([], { now, cap });
}
