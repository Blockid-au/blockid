// R&D Tax Incentive registration calendar.
//
// AusIndustry / ATO rule (retrieved 2026):
//   https://business.gov.au/grants-and-programs/research-and-development-tax-incentive
//   https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/incentives-and-concessions/research-and-development-tax-incentive
//
// Registration must occur within **10 months** after the end of the
// company's income year in which the R&D activities were conducted.
// Standard Australian FY runs 1 July - 30 June, so activities in
// FY2024-25 (year ended 30 June 2025) must be registered by
// 30 April 2026. Missing the deadline forfeits the refundable / non-
// refundable tax offset for that year (potentially A$100k+ for a
// pre-revenue startup).
//
// Deferred (logged as follow-up):
//   - Substituted Accounting Period (SAP) support — we assume the
//     standard 1 July - 30 June FY. Companies with an ATO-approved SAP
//     need bespoke boundaries.
//   - Advance / overseas finding pathway — we track registration only,
//     not advance findings under s 28C IR&D Act 1986.
//   - Self-assessment vs advance finding lifecycle — modelled as a
//     single deadline; the advance-finding process has its own timeline.

export const RD_DISCLAIMER =
  "Not tax advice — R&D Tax Incentive eligibility, aggregated turnover thresholds, and the notional deductions calculation must be confirmed with a registered tax agent or R&D consultant before lodgement.";

const AU_FY_START_MONTH = 7; // July
const AU_FY_START_DAY = 1;
const AU_FY_END_MONTH = 6; // June
const AU_FY_END_DAY = 30;
const REGISTRATION_MONTHS = 10;

export type RDStatus =
  | "future"
  | "open"
  | "closing_soon"
  | "last_call"
  | "overdue";

export interface RDCalendarEntry {
  fy_label: string; // e.g. "FY 2024-25"
  activity_start: string; // ISO date
  activity_end: string; // ISO date
  registration_deadline: string; // ISO date
  days_until_deadline: number; // negative when overdue
  status: RDStatus;
  registration_status?: "not_registered" | "registered" | "not_applicable";
  registration_date?: string | null;
  note: string;
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const shifted = new Date(Date.UTC(y, m + months, day));
  return shifted.toISOString().slice(0, 10);
}

function daysBetweenUtc(fromIso: string, to: Date): number {
  const from = new Date(fromIso + "T00:00:00Z");
  const toUtc = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  return Math.round(
    (from.getTime() - toUtc.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/** Compute FY label for a given start year (e.g. 2024 → "FY 2024-25"). */
function fyLabel(startYear: number): string {
  const endYy = String((startYear + 1) % 100).padStart(2, "0");
  return `FY ${startYear}-${endYy}`;
}

/** Return the calendar year in which the current AU FY started. */
function currentFyStartYear(now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= AU_FY_START_MONTH ? y : y - 1;
}

function classifyStatus(
  daysUntilDeadline: number,
  activityEndIso: string,
  now: Date,
  registrationStatus: RDCalendarEntry["registration_status"],
): { status: RDStatus; note: string } {
  const activityEndInFuture =
    daysBetweenUtc(activityEndIso, now) > 0; // activityEnd > today

  if (registrationStatus === "registered") {
    return {
      status: "open",
      note: "Registered with AusIndustry — file R&D schedule with the company tax return.",
    };
  }
  if (activityEndInFuture) {
    return {
      status: "future",
      note: "R&D year has not yet ended — capture contemporaneous documentation now to make lodgement easier.",
    };
  }
  if (daysUntilDeadline < 0) {
    return {
      status: "overdue",
      note: `Registration window CLOSED ${Math.abs(daysUntilDeadline)} days ago — the R&D offset for this FY is forfeited unless AusIndustry grants an extension of time (s 27J IR&D Act).`,
    };
  }
  if (daysUntilDeadline <= 30) {
    return {
      status: "last_call",
      note: `Only ${daysUntilDeadline} day(s) left to register with AusIndustry. Prepare Form ATO47 R&D schedule and lodge NOW.`,
    };
  }
  if (daysUntilDeadline <= 60) {
    return {
      status: "closing_soon",
      note: `${daysUntilDeadline} days to the 10-month AusIndustry registration deadline — book time with your R&D advisor.`,
    };
  }
  return {
    status: "open",
    note: `${daysUntilDeadline} days to the AusIndustry registration deadline — plenty of runway to prepare.`,
  };
}

export interface BuildRDCalendarOptions {
  now?: Date;
  /** Existing per-FY registration state from `compliance_rd_registrations`. */
  registrations?: Array<{
    fy_label: string;
    registration_status?: RDCalendarEntry["registration_status"];
    registration_date?: string | null;
  }>;
  /** How many prior FYs to include. Default 3 (current + last 3 = 4 rows). */
  priorFyCount?: number;
}

export function buildRDCalendar(
  opts: BuildRDCalendarOptions = {},
): RDCalendarEntry[] {
  const now = opts.now ?? new Date();
  const priorCount = opts.priorFyCount ?? 3;

  const currentStart = currentFyStartYear(now);
  const startYears: number[] = [];
  for (let i = 0; i <= priorCount; i += 1) {
    startYears.push(currentStart - i);
  }

  const regByLabel = new Map<
    string,
    { status?: RDCalendarEntry["registration_status"]; date?: string | null }
  >();
  for (const r of opts.registrations ?? []) {
    regByLabel.set(r.fy_label, {
      status: r.registration_status,
      date: r.registration_date ?? null,
    });
  }

  return startYears.map((startYear) => {
    const label = fyLabel(startYear);
    const activityStart = `${startYear}-${String(AU_FY_START_MONTH).padStart(2, "0")}-${String(AU_FY_START_DAY).padStart(2, "0")}`;
    const activityEnd = `${startYear + 1}-${String(AU_FY_END_MONTH).padStart(2, "0")}-${String(AU_FY_END_DAY).padStart(2, "0")}`;
    const registrationDeadline = addMonthsIso(activityEnd, REGISTRATION_MONTHS);
    const daysUntilDeadline = daysBetweenUtc(registrationDeadline, now);

    const reg = regByLabel.get(label) ?? {};
    const { status, note } = classifyStatus(
      daysUntilDeadline,
      activityEnd,
      now,
      reg.status,
    );

    return {
      fy_label: label,
      activity_start: activityStart,
      activity_end: activityEnd,
      registration_deadline: registrationDeadline,
      days_until_deadline: daysUntilDeadline,
      status,
      registration_status: reg.status ?? "not_registered",
      registration_date: reg.date ?? null,
      note,
    };
  });
}
