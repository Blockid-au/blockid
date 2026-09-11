// AU compliance calendar (.ics) generator.
//
// Emits an RFC 5545 VCALENDAR for a founder's rolling compliance
// obligations so it can be subscribed to from Google Calendar, iCal,
// Outlook, etc. Chapter 11 of the guide (startup-journey.ts:870) already
// promises this file — this module ships the actual generator.
//
// Scope (P1k in docs/plans/atlassian-standard-mapping-goal.md):
//   1. BAS lodgment — quarterly, self-lodging small business, standard
//      1-Jul to 30-Jun FY. Due 28 Oct / 28 Feb / 28 Apr / 28 Jul.
//      https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas
//   2. ASIC annual company review — due each year on the anniversary of
//      the ACN registration date; payment window is 2 months but the
//      calendar surfaces the anniversary itself so founders see the
//      trigger, not the deadline. (s 345A Corporations Act 2001 (Cth).)
//      https://asic.gov.au/for-business/running-a-company/annual-review-and-lodgement
//   3. AusIndustry R&D Tax Incentive registration deadline — 10 months
//      after the FY end (30 April for standard-FY companies). Consumes
//      the existing compliance_rd_registrations state so registered FYs
//      are skipped. IR&D Act 1986 s 27A.
//
// P1n-calendar-events (2026-07-24) folds in WGEA + Modern Slavery events:
//   4. WGEA public report — WGE Act 2012 (Cth) s3 relevant employer,
//      annual public report due 31 May after the reporting period ends.
//      Emitted when the WGEA detector reports is_relevant_employer.
//   5. Modern Slavery statement — MSA 2018 (Cth) s5 reporting entity,
//      statement due within 6 months of the FY end. Emitted when the
//      MSA detector reports is_reporting_entity.
//
// Deferred (follow-ups):
//   - Fair Work anniversary (award-classification review) — not date-
//     driven, employer-triggered.
//   - Substituted Accounting Period BAS quarters — depends on
//     substituted-FY support in the R&D calendar too.
//
// The generator is pure: no I/O. The route handler
// (`web/src/app/api/compliance/calendar/route.ts`) reads the DB tables
// and hands the assembled options in.

import type { RDCalendarEntry } from "@/lib/compliance/rd-calendar";
import type { WGEAResult } from "@/lib/compliance/wgea-threshold";
import type { ModernSlaveryResult } from "@/lib/compliance/modern-slavery-threshold";

export const CALENDAR_DISCLAIMER =
  "Not tax or legal advice — BAS due dates assume standard 1-July-to-30-June FY and self-lodgment. Companies with an ATO-approved Substituted Accounting Period, or lodging via a registered tax agent, may have different dates. Confirm with the ATO and your registered agent before relying on this calendar.";

export const CALENDAR_PRODID = "-//BlockID.au//AU Compliance Calendar//EN";
export const CALENDAR_NAME = "BlockID.au — AU Compliance Calendar";

// 14 days upstream of every event, per Chapter 11 copy
// ("compliance-calendar.ics ... 14-day lead reminders enabled",
// web/src/lib/guide/startup-journey.ts:870).
const REMINDER_LEAD_DAYS = 14 as const;

export type ComplianceEventKind =
  | "bas_quarter"
  | "asic_annual_review"
  | "rd_registration"
  | "wgea_report"
  | "modern_slavery_statement";

export interface ComplianceEvent {
  uid: string;
  kind: ComplianceEventKind;
  summary: string;
  description: string;
  /** All-day event start date (YYYY-MM-DD, inclusive). */
  date_start: string;
  /**
   * All-day event end date (YYYY-MM-DD, exclusive per RFC 5545 DTEND
   * semantics for VALUE=DATE). We always emit `date_start + 1 day`.
   */
  date_end: string;
  reminder_lead_days: number;
  source_url: string;
}

/**
 * Generic all-day event accepted by `renderIcs()` alongside `ComplianceEvent`
 * (T0245 — the Money Radar feed at /api/funding/calendar.ics renders grant
 * closes / program intakes / event dates through the same renderer).
 * `reminder_lead_days` may list several lead times → one VALARM each
 * (Money Radar uses 30 / 14 / 3 to mirror the in-app tiers).
 */
export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  /** All-day start (YYYY-MM-DD, inclusive). */
  date_start: string;
  /** All-day end (YYYY-MM-DD, exclusive). Defaults to `date_start + 1 day`. */
  date_end?: string;
  reminder_lead_days: number | readonly number[];
  url: string;
  /** Free-form tag surfaced as CATEGORIES (e.g. "funding_deadline"). */
  category?: string;
}

export type IcsInput = ComplianceEvent | IcsEvent;

function isComplianceEvent(ev: IcsInput): ev is ComplianceEvent {
  return "source_url" in ev && "kind" in ev;
}

export interface BuildComplianceCalendarOptions {
  /** Anchor "now" — controls the 12-month emission window. */
  now?: Date;
  /**
   * How many months forward to emit. Default 12. Kept small so the
   * `.ics` fits well inside a single HTTP response and refreshes as the
   * founder resubscribes.
   */
  horizonMonths?: number;
  /**
   * Whether the founder is registered for GST. When false we skip BAS
   * events but keep everything else so a pre-GST founder still gets a
   * useful calendar (ASIC + R&D). Callers should feed this from
   * `compliance_gst_status.registered_for_gst`.
   */
  gstRegistered?: boolean;
  /**
   * ACN registration date (YYYY-MM-DD). Optional — when absent we skip
   * ASIC annual review events (we can't infer the anniversary without
   * it). Callers should feed this from svi_accounts / projects when the
   * founder has entered their ACN.
   */
  acnRegistrationDate?: string;
  /**
   * R&D calendar rows already computed by `buildRDCalendar()`. Passed
   * through so we only need one source of truth for FY math + status
   * classification. Registered / not-applicable rows are skipped.
   */
  rdCalendar?: readonly RDCalendarEntry[];
  /**
   * Latest `assessWGEA()` snapshot for the founder. When
   * `is_relevant_employer` and `next_report_due_iso` are present, we
   * emit a `wgea_report` all-day event for the 31-May-following public-
   * report deadline. Null / undefined skips the WGEA branch entirely.
   */
  wgea?: WGEAResult | null;
  /**
   * Latest `assessModernSlavery()` snapshot for the founder. When
   * `is_reporting_entity` and `statement_due_iso` are present, we emit
   * a `modern_slavery_statement` all-day event for the FY-end + 6-month
   * lodgement deadline. Null / undefined skips the MSA branch entirely.
   */
  modernSlavery?: ModernSlaveryResult | null;
}

const BAS_QUARTERS: ReadonlyArray<{
  code: "Q1" | "Q2" | "Q3" | "Q4";
  covers: string;
  dueMonthMm: string; // "MM"
  dueDay: number;
  /** True when the due date rolls into the NEXT calendar year. */
  dueInNextYear: boolean;
  fyOffsetForLabel: number; // 0 = same FY start year as the coverage start; used when composing FY label
}> = [
  // BAS Q1 covers Jul-Sep of FY-start year; due 28 Oct of FY-start year.
  { code: "Q1", covers: "Jul-Sep", dueMonthMm: "10", dueDay: 28, dueInNextYear: false, fyOffsetForLabel: 0 },
  // BAS Q2 covers Oct-Dec of FY-start year; due 28 Feb of NEXT calendar year.
  { code: "Q2", covers: "Oct-Dec", dueMonthMm: "02", dueDay: 28, dueInNextYear: true, fyOffsetForLabel: 0 },
  // BAS Q3 covers Jan-Mar of FY-end year; due 28 Apr of FY-end year.
  { code: "Q3", covers: "Jan-Mar", dueMonthMm: "04", dueDay: 28, dueInNextYear: true, fyOffsetForLabel: 0 },
  // BAS Q4 covers Apr-Jun of FY-end year; due 28 Jul of FY-end year.
  { code: "Q4", covers: "Apr-Jun", dueMonthMm: "07", dueDay: 28, dueInNextYear: true, fyOffsetForLabel: 0 },
];

const ATO_BAS_URL =
  "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/due-dates-for-lodging-and-paying-your-bas";
const ASIC_ANNUAL_REVIEW_URL =
  "https://asic.gov.au/for-business/running-a-company/annual-review-and-lodgement";
const AUSINDUSTRY_RD_URL =
  "https://business.gov.au/grants-and-programs/research-and-development-tax-incentive";
const WGEA_REPORTING_URL =
  "https://www.wgea.gov.au/what-we-do/reporting";
const MODERN_SLAVERY_URL =
  "https://modernslaveryregister.gov.au/";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, mZeroIndexed: number, day: number): string {
  const d = new Date(Date.UTC(y, mZeroIndexed, day));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const shifted = new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function withinHorizon(
  iso: string,
  now: Date,
  horizonMonths: number,
): boolean {
  const d = new Date(iso + "T00:00:00Z");
  const nowUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const horizonEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + horizonMonths,
      now.getUTCDate(),
    ),
  );
  // Inclusive of today, exclusive of horizonEnd.
  return d.getTime() >= nowUtc.getTime() && d.getTime() < horizonEnd.getTime();
}

/** Return the calendar year in which the current AU FY started. */
function currentFyStartYear(now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 7 ? y : y - 1;
}

function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function buildBasEvents(
  fyStartYear: number,
  now: Date,
  horizonMonths: number,
): ComplianceEvent[] {
  const events: ComplianceEvent[] = [];
  for (const q of BAS_QUARTERS) {
    const dueYear = q.dueInNextYear ? fyStartYear + 1 : fyStartYear;
    const dateStart = isoDate(dueYear, Number(q.dueMonthMm) - 1, q.dueDay);
    if (!withinHorizon(dateStart, now, horizonMonths)) continue;
    const label = fyLabel(fyStartYear + q.fyOffsetForLabel);
    events.push({
      uid: `bas-${label.replace(/\s+/g, "").toLowerCase()}-${q.code.toLowerCase()}@blockid.au`,
      kind: "bas_quarter",
      summary: `BAS ${q.code} ${label} — lodge & pay`,
      description: `Business Activity Statement covering ${q.covers} (${label}). Self-lodger due date; tax-agent lodgers usually get a concessional extension. ATO reference: ${ATO_BAS_URL}. Add GST, PAYG withholding, PAYG instalments as applicable.`,
      date_start: dateStart,
      date_end: addDaysIso(dateStart, 1),
      reminder_lead_days: REMINDER_LEAD_DAYS,
      source_url: ATO_BAS_URL,
    });
  }
  return events;
}

function buildAsicEvents(
  acnRegistrationDate: string,
  now: Date,
  horizonMonths: number,
): ComplianceEvent[] {
  const events: ComplianceEvent[] = [];
  const reg = new Date(acnRegistrationDate + "T00:00:00Z");
  if (Number.isNaN(reg.getTime())) return events;
  const startYear = now.getUTCFullYear();
  // Emit anniversaries for this year + next year — the horizon filter
  // trims anything outside the window.
  for (const yr of [startYear, startYear + 1, startYear + 2]) {
    const anniversary = isoDate(yr, reg.getUTCMonth(), reg.getUTCDate());
    if (!withinHorizon(anniversary, now, horizonMonths)) continue;
    events.push({
      uid: `asic-annual-review-${yr}@blockid.au`,
      kind: "asic_annual_review",
      summary: `ASIC annual company review — ${yr}`,
      description: `Annual review date under s 345A Corporations Act 2001 (Cth). ASIC issues the annual statement + fee within a week of this date; you have 2 months to pay + confirm details and pass a solvency resolution. ASIC reference: ${ASIC_ANNUAL_REVIEW_URL}.`,
      date_start: anniversary,
      date_end: addDaysIso(anniversary, 1),
      reminder_lead_days: REMINDER_LEAD_DAYS,
      source_url: ASIC_ANNUAL_REVIEW_URL,
    });
  }
  return events;
}

function buildRdEvents(
  rdCalendar: readonly RDCalendarEntry[],
  now: Date,
  horizonMonths: number,
): ComplianceEvent[] {
  const events: ComplianceEvent[] = [];
  for (const entry of rdCalendar) {
    // Skip closed FYs where registration is already done or opted out.
    if (
      entry.registration_status === "registered" ||
      entry.registration_status === "not_applicable"
    ) {
      continue;
    }
    // Skip overdue: an .ics reminder for a passed date is noise. The
    // rd-calendar UI already surfaces overdue rows with a red band.
    if (entry.days_until_deadline < 0) continue;
    if (!withinHorizon(entry.registration_deadline, now, horizonMonths)) continue;
    const label = entry.fy_label;
    events.push({
      uid: `rd-registration-${label.replace(/\s+/g, "").toLowerCase()}@blockid.au`,
      kind: "rd_registration",
      summary: `AusIndustry R&D Tax Incentive registration — ${label} deadline`,
      description: `Register your ${label} R&D activities with AusIndustry (10-month post-FY window under IR&D Act 1986 s 27A). Missing the deadline forfeits the offset for the year unless AusIndustry grants an extension of time under s 27J. Reference: ${AUSINDUSTRY_RD_URL}.`,
      date_start: entry.registration_deadline,
      date_end: addDaysIso(entry.registration_deadline, 1),
      reminder_lead_days: REMINDER_LEAD_DAYS,
      source_url: AUSINDUSTRY_RD_URL,
    });
  }
  return events;
}

function buildWgeaEvents(
  wgea: WGEAResult,
  now: Date,
  horizonMonths: number,
): ComplianceEvent[] {
  const events: ComplianceEvent[] = [];
  if (!wgea.is_relevant_employer) return events;
  const deadlineIso = wgea.next_report_due_iso;
  if (!deadlineIso) return events;
  if (!withinHorizon(deadlineIso, now, horizonMonths)) return events;
  const year = new Date(deadlineIso + "T00:00:00Z").getUTCFullYear();
  events.push({
    uid: `wgea-report-${year}@blockid.au`,
    kind: "wgea_report",
    summary: `WGEA public report ${year} — lodge with agency`,
    description: `Workplace Gender Equality Act 2012 (Cth) s3 relevant-employer public report. Reporting period 1 April → 31 March; statement due to the Workplace Gender Equality Agency by ${deadlineIso}. Six gender-equality-indicator dataset required. WGEA reference: ${WGEA_REPORTING_URL}.`,
    date_start: deadlineIso,
    date_end: addDaysIso(deadlineIso, 1),
    reminder_lead_days: REMINDER_LEAD_DAYS,
    source_url: WGEA_REPORTING_URL,
  });
  return events;
}

function buildModernSlaveryEvents(
  ms: ModernSlaveryResult,
  now: Date,
  horizonMonths: number,
): ComplianceEvent[] {
  const events: ComplianceEvent[] = [];
  if (!ms.is_reporting_entity) return events;
  const deadlineIso = ms.statement_due_iso;
  if (!deadlineIso) return events;
  if (!withinHorizon(deadlineIso, now, horizonMonths)) return events;
  const year = new Date(deadlineIso + "T00:00:00Z").getUTCFullYear();
  events.push({
    uid: `modern-slavery-statement-${year}@blockid.au`,
    kind: "modern_slavery_statement",
    summary: `Modern Slavery statement ${year} — lodge with register`,
    description: `Modern Slavery Act 2018 (Cth) s5 reporting-entity statement. Consolidated revenue at or above A$100M — statement due within 6 months of FY end (${deadlineIso}). Requires principal-governing-body approval + responsible-member signature under s13(2); seven mandatory reporting criteria under s16. Attorney-General's register: ${MODERN_SLAVERY_URL}.`,
    date_start: deadlineIso,
    date_end: addDaysIso(deadlineIso, 1),
    reminder_lead_days: REMINDER_LEAD_DAYS,
    source_url: MODERN_SLAVERY_URL,
  });
  return events;
}

export function buildComplianceCalendar(
  opts: BuildComplianceCalendarOptions = {},
): ComplianceEvent[] {
  const now = opts.now ?? new Date();
  const horizonMonths = opts.horizonMonths ?? 12;
  const events: ComplianceEvent[] = [];

  if (opts.gstRegistered) {
    const fyStart = currentFyStartYear(now);
    // Include current + next FY quarters so a founder subscribing in
    // June still sees Q4 (due 28 Jul, i.e. current FY's coverage) and
    // Q1 of the new FY at the same time.
    events.push(...buildBasEvents(fyStart, now, horizonMonths));
    events.push(...buildBasEvents(fyStart + 1, now, horizonMonths));
  }

  if (opts.acnRegistrationDate) {
    events.push(
      ...buildAsicEvents(opts.acnRegistrationDate, now, horizonMonths),
    );
  }

  if (opts.rdCalendar && opts.rdCalendar.length > 0) {
    events.push(...buildRdEvents(opts.rdCalendar, now, horizonMonths));
  }

  if (opts.wgea) {
    events.push(...buildWgeaEvents(opts.wgea, now, horizonMonths));
  }

  if (opts.modernSlavery) {
    events.push(
      ...buildModernSlaveryEvents(opts.modernSlavery, now, horizonMonths),
    );
  }

  events.sort((a, b) => a.date_start.localeCompare(b.date_start));
  return events;
}

// --- ICS serialisation ---

/**
 * Fold a single logical line to <= 75 octets per RFC 5545 §3.1. Counts UTF-8
 * octets (not characters) and never splits inside a multi-byte character —
 * T0245 widened this from the ASCII-only original because Money Radar
 * summaries carry em dashes and grant names with non-ASCII letters. ASCII
 * input folds exactly as before.
 */
function foldLine(line: string): string {
  const MAX = 75;
  if (Buffer.byteLength(line, "utf8") <= MAX) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = MAX; // continuation lines start with 1 space → 74 payload octets
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (currentBytes + b > limit) {
      parts.push(parts.length === 0 ? current : ` ${current}`);
      current = "";
      currentBytes = 0;
      limit = MAX - 1;
    }
    current += ch;
    currentBytes += b;
  }
  if (current) parts.push(parts.length === 0 ? current : ` ${current}`);
  return parts.join("\r\n");
}

/**
 * RFC 5545 §3.3.11 TEXT escaping. A bare CR (or CRLF) inside a value would
 * otherwise terminate the content line and let user-supplied text (grant
 * names, program descriptions) inject arbitrary iCalendar properties —
 * review 2026-09-10 #19. CRLF / CR are folded into the escaped `\n`.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * URI-typed property values (URL:) are not TEXT-escaped by RFC 5545, so
 * `escapeIcsText` would corrupt them — but a CR/LF (or any control char)
 * inside one still terminates the content line and injects properties
 * (S8-C review 2026-09-11). Keep only http(s) URLs with every control
 * character stripped; anything else is dropped (the description already
 * carries the official page as text).
 */
export function safeIcsUri(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!/^https?:\/\//i.test(cleaned)) return null;
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

/** UID: is TEXT-like but must be a single token — strip anything that could break the line. */
function safeIcsUid(raw: string): string {
  return String(raw ?? "").replace(/[\u0000-\u001f\u007f;,]/g, "").slice(0, 255) || "event";
}

function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function toDtStamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  );
}

export interface RenderIcsOptions {
  now?: Date;
  calendarName?: string;
  /** X-WR-CALDESC; defaults to the compliance disclaimer. */
  calendarDescription?: string;
  /** PRODID; defaults to the compliance one. */
  prodId?: string;
}

export function renderIcs(
  events: readonly IcsInput[],
  opts: RenderIcsOptions = {},
): string {
  const now = opts.now ?? new Date();
  const calName = opts.calendarName ?? CALENDAR_NAME;
  const calDesc = opts.calendarDescription ?? CALENDAR_DISCLAIMER;
  const dtstamp = toDtStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${opts.prodId ?? CALENDAR_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    `X-WR-CALDESC:${escapeIcsText(calDesc)}`,
  ];

  for (const ev of events) {
    const compliance = isComplianceEvent(ev);
    const url = safeIcsUri(compliance ? ev.source_url : ev.url);
    const dateEnd = compliance ? ev.date_end : (ev.date_end ?? addDaysIso(ev.date_start, 1));
    const leads = (Array.isArray(ev.reminder_lead_days) ? ev.reminder_lead_days : [ev.reminder_lead_days as number])
      .filter((d) => Number.isInteger(d) && d >= 0)
      .sort((a, b) => b - a);
    // Compliance output is unchanged (no CATEGORIES) so existing subscribers see no diff.
    const category = compliance ? undefined : ev.category;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${safeIcsUid(ev.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(ev.date_start)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(dateEnd)}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (url) lines.push(`URL:${url}`);
    if (category) lines.push(`CATEGORIES:${escapeIcsText(category)}`);
    for (const lead of leads) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`TRIGGER:-P${lead}D`);
      lines.push(`DESCRIPTION:${escapeIcsText(ev.summary)} in ${lead} days`);
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
