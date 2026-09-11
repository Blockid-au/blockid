// Money Finder / Money Radar messaging pack (G11 plan §4i D-3, T0248).
//
// The ONE place the approved founder-facing money strings live. Every
// surface — the /funding hero + preview, the dashboard MoneyRadarTile, the
// in-app notification titles (`describeNotification`), the radar email
// subjects (T0246) and the pricing-matrix row — reads from here, so a copy
// change is a one-line edit and the i18n catalogues (`funding.copy.*` in
// messages/en.json + vi.json) can be checked for parity by `copy.test.ts`.
//
// Rules baked into the tests:
//   • every string ≤ 2 sentences (D-5 speakability — the hero sub-line is
//     split into `hero.sub` + `hero.subPrice` for that reason);
//   • no "PhD", no retired "A$5.50" / "A$99" (G11-9: Free / A$3 / A$29 only);
//   • `{tokens}` are filled with `fill()`; an unknown token stays visible as
//     `{token}` rather than vanishing, so a missing value is never a blank.
//
// No `server-only` import — shared by client components (intake, feed).

import {
  FOUNDER_RADAR_MONTHLY_AUD,
  FOUNDER_RADAR_TRIAL_DAYS,
  FUNDING_REPORT_AUD,
  RADAR_UPSELL_TAIL,
} from "./radar-upsell";

export type CopyTokens = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Replace `{token}` placeholders. Numbers are printed as-is; `null` /
 * `undefined` / a missing key leave the placeholder in place (visible, so a
 * test or a reviewer catches it — never silently blank).
 */
export function fill(template: string, tokens: CopyTokens = {}): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (whole, key: string) => {
    const v = tokens[key];
    if (v === null || v === undefined) return whole;
    return typeof v === "number" ? String(v) : v;
  });
}

/** Tokens a template mentions — `["n", "startup"]`. Used by the i18n parity test. */
export function tokensOf(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) out.add(m[1]);
  return [...out].sort();
}

const REPORT_PRICE = `A$${FUNDING_REPORT_AUD}`;
const RADAR_PRICE = `A$${FOUNDER_RADAR_MONTHLY_AUD}/mo`;

export const FUNDING_COPY = {
  /** Buttons + links. D-3 "Public CTA" + D-2 tile CTAs. */
  cta: {
    needMoney: "Do you need money?",
    altFindMoney: "Find money for my startup",
    altShowGrants: "Show me my grants",
    matchMe: "Match me",
    matchMeFree: "Match me — three questions, free",
    browseGrants: "Browse open grants — free",
    unlockReport: `Unlock full report ${REPORT_PRICE}`,
    startTrial: "Start Founder Radar trial",
    startTrial7: `Start ${FOUNDER_RADAR_TRIAL_DAYS}-day Radar trial`,
    openRadar: "Open Money Radar",
    draftApplication: "Draft application (credits)",
    addToCalendar: "Add to calendar",
    openReport: "Open my report",
  },

  /** /funding hero. `{sum}` is computed live from `au_grants` — never hard-coded. */
  hero: {
    eyebrow: "Do you need money?",
    h1: "There's {sum} in Australian grants and programs open right now. Find the ones you qualify for in 60 seconds.",
    h1Fallback: "Australian startup grants, programs and investors — in one place.",
    sub: "Government grants, accelerators, angels and tax offsets — matched to your idea, your state and your stage.",
    subPrice: `The list is free. The eligibility check, ranking and 12-month plan are ${REPORT_PRICE}.`,
    programsOpen: "{m} programs are taking applications today.",
    trust: "Every program links to its official page. Grant information is free from government — we sell the analysis, not the access.",
  },

  /** Free preview result (D-3) — `{city}` falls back to the state, `{sum}` to the top-5 A$ figure. */
  preview: {
    eyebrow: "Your free preview",
    result: "We found {n} grants worth up to {sum} and {m} programs in {city} for a {stage} {industry} startup. Top 3: {a}, {b}, {c}.",
    resultNoSum: "We found {n} grants and {m} programs in {city} for a {stage} {industry} startup. Top 3: {a}, {b}, {c}.",
    resultCounts: "We found {n} grants and {m} programs matching you.",
    nothing: "No exact matches yet — here is the nearest national money.",
  },

  /** Paywall card under the preview (D-3). */
  paywall: {
    eyebrow: "Unlock the full report",
    card: `Unlock the full ranked list, eligibility checklist, A$ estimate and 12-month timeline — ${REPORT_PRICE}, or free with Founder Radar (${FOUNDER_RADAR_TRIAL_DAYS}-day trial).`,
  },

  /** A$3 report → subscribe (T0247 owns the card; the tail is shared, not duplicated). */
  upsell: {
    snapshot: "This report is a snapshot. {next_program} closes in {d} days and {k} programs on your list open new rounds this quarter.",
    tail: RADAR_UPSELL_TAIL,
  },

  /** Dashboard MoneyRadarTile (D-2) — one line per state, plus the chips. */
  tile: {
    title: "Money Radar",
    noProfile: "We found {grants} grants and {programs} programs for {industry} startups in {state}. Answer 3 questions to see yours.",
    previewed: "Your top matches are in — amounts and deadlines unlock with the full report.",
    nextDeadline: "Next deadline in {d} days",
    nextDeadlineToday: "Next deadline is today",
    deadlinesMove: "Deadlines move — get alerts",
    newMatches: "{n} new matches this week",
    noNewMatches: "No new matches this week — your list is current.",
    nothingDue: "No deadlines in the next 30 days. Next up: {event} opens {date}.",
    nothingDueNoEvent: "No deadlines in the next 30 days. Your next re-match runs on Sunday.",
    countsLine: "{grants} grants · {programs} programs · {capital} capital sources",
    nextStep: "Next step: {action}",
    lockedAmount: "Amount in full report",
    lockedDeadline: "Deadline in full report",
  },

  /** In-app titles ≤ 60 chars (D-3). Keys = sweep `payload.event` values. */
  notification: {
    new_match: "{n} new grants match {startup} this week",
    new_match_mixed: "{n} new matches for {startup} this week",
    deadline_t30: "{program} closes in 30 days — start your application",
    deadline_t14: "14 days left: {program} ({max})",
    deadline_t14_noAmount: "14 days left: {program}",
    deadline_t3: "Last call: {program} closes {weekday}",
    status_changed: "{program} {status} — here are {k} alternatives",
    status_changed_noAlt: "{program} {status} — see your alternatives",
    new_round_opened: "{program} just opened a new round",
    event_match: "{event} ({city}, {date}) — founders at your stage go to this",
    event_match_noCity: "{event} ({date}) — founders at your stage go to this",
    analysis_refresh: "Your funding plan was refreshed — {n} changes",
    analysis_refresh_noCount: "Your funding plan was refreshed",
    weekly_next_step: "Your next money step this week",
  },

  /** Email subjects (radar drips / digest / re-engagement). T0246 reads these. */
  email: {
    t30: "30 days to {program}: your eligibility checklist",
    t14: "{program} closes in 2 weeks — draft ready?",
    t3: "Final 72 hours for {program}",
    digest: "Money this week: {n} new matches · next deadline {program} in {d} days · this week's step: {action}",
    reengagement: "Since your report: {k} programs changed. See what's new.",
  },

  /** Pricing matrix rows (Starter = "Founder Radar"; Growth adds). */
  pricing: {
    starter: "Money Radar — deadline alerts, monthly re-match, weekly next step, capital map, application drafts (credits)",
    growth: "Investor matching + unlimited drafts + quarterly expert update",
    reportPrice: `${REPORT_PRICE} · or 3 credits`,
    radarPrice: `${RADAR_PRICE} · Starter`,
  },

  /** Growth extras (T0251 §4h): investor reverse-match, unlimited drafts, quarterly expert update. Starter sees the locked lines. */
  growth: {
    investorsTitle: "Investors who match",
    investorsIntro: "Investors on BlockID who opted in and whose thesis fits your sector, stage, location and SVI. Nothing is sent to them until you ask.",
    investorsLocked: "Investor matching is a Growth feature. Upgrade to see the investors whose thesis fits your startup.",
    noInvestors: "No opted-in investors match yet. We add investors every week — your profile is already in the queue.",
    noInvestorsBrowse: "Meet investors at programs near you",
    requestIntro: "Request intro",
    introSubject: "Intro request: {startup} → {investor}",
    refreshTitle: "Quarterly expert update",
    refreshLocked: "The quarterly expert update is a Growth feature. Upgrade to get a \"what changed for your startup\" note every quarter.",
    noRefresh: "Your first quarterly update lands on the 1st of next quarter. It covers your SVI move, catalogue changes on your matches and new CFO / CLO research.",
    draftTitle: "Draft application: {grant}",
    draftCost: "Drafting this application costs {cost} credits. You confirm before we spend them.",
    draftIncluded: "Application drafts are unlimited on your plan.",
    draftLocked: "Application drafts are included from Starter (credits) and unlimited on Growth.",
    draftFailed: "The drafter could not reach the AI, so your questions are saved with empty answers. Retry in a minute.",
    draftGeneric: "This grant has no official question set yet, so these are the four questions every AU grant form asks.",
    /** S16-A program drafts — same rails, accelerator wording. */
    draftTitleProgram: "Application draft — {program}",
    draftGenericProgram: "This program has no published question set yet, so these are the six questions every accelerator form asks.",
  },

  /**
   * Visible FAQ at the foot of the free directories (S12-A) — the same
   * strings feed the `FAQPage` JSON-LD, so nothing in the schema is invisible.
   * Product facts only: free lists, the Sunday refresh + review queue, what
   * A$3 buys, no cut of grants, the capital → satellite grouping, per-program
   * equity terms. `{satellites}` is filled from `CAPITAL_SATELLITES`.
   */
  faq: {
    grantsFreeQ: "Is grant information free?",
    grantsFreeA: `Yes — the list and every official link are free. ${REPORT_PRICE} buys the eligibility analysis, ranking, A$ estimate and 12-month timeline.`,
    updatedQ: "How often is this list updated?",
    updatedA: "Every Sunday a refresh checks each official page and re-verifies status and dates. Anything it cannot confirm goes to a human review queue before it changes here.",
    reportQ: "What does the Money Finder report include?",
    reportA: `For ${REPORT_PRICE}: your ranked grants and programs, an eligibility checklist per match, an A$ estimate and a 12-month application timeline.`,
    cutQ: "Do you take a cut of grants?",
    cutA: "No. Grant money goes from the provider to you — we sell the analysis, not the access, and there is no success fee.",
    citiesQ: "Which cities are covered?",
    citiesA: "Programs are grouped under the eight capitals plus online, and nearby cities roll into their capital — {satellites}.",
    equityQ: "Do programs take equity?",
    equityA: "It varies: some take none, some take a small stake or a SAFE. The equity terms are shown on each program's row and detail page.",
  },

  /** Empty / locked states — never blank (auto-fill rule). */
  empty: {
    noGrants: "No grants match yet — the directory is still free to browse.",
    noPrograms: "No programs match yet — try a different stage or city.",
    locked: "Locked — unlock the full report to see it.",
    noEvents: "No public events listed for your capital yet. Browse all programs instead.",
  },
} as const;

export type FundingCopy = typeof FUNDING_COPY;
export type FundingCopyGroup = keyof FundingCopy;

/** i18n key prefix — `funding.copy.<group>.<key>` in messages/en.json + vi.json. */
export const FUNDING_COPY_I18N_PREFIX = "funding.copy.";

/** `{ "funding.copy.hero.h1": "There's {sum} …", … }` — every string, flat. */
export function flattenFundingCopy(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, entries] of Object.entries(FUNDING_COPY)) {
    for (const [key, value] of Object.entries(entries)) {
      out[`${FUNDING_COPY_I18N_PREFIX}${group}.${key}`] = value;
    }
  }
  return out;
}

/**
 * Look a string up by its i18n key in a message catalogue, falling back to
 * the English constant — the VI pages pass `getMessages("vi")`, everything
 * else can omit `messages`.
 */
export function fundingCopy(
  group: FundingCopyGroup,
  key: string,
  tokens: CopyTokens = {},
  messages?: Readonly<Record<string, string>> | null,
): string {
  const en = (FUNDING_COPY[group] as Readonly<Record<string, string>>)[key] ?? `{${group}.${key}}`;
  const localised = messages?.[`${FUNDING_COPY_I18N_PREFIX}${group}.${key}`];
  return fill(typeof localised === "string" && localised.trim() ? localised : en, tokens);
}

// ─── Small helpers the surfaces share ────────────────────────────────────────

/** "in 12 days" / "today" / "tomorrow" — for D-2 "Next deadline in **12 days**". */
export function nextDeadlineLine(days: number | null | undefined, messages?: Readonly<Record<string, string>> | null): string {
  if (days === null || days === undefined) return "";
  if (days <= 0) return fundingCopy("tile", "nextDeadlineToday", {}, messages);
  return fundingCopy("tile", "nextDeadline", { d: days }, messages);
}

/** Weekday for "Last call: {program} closes {weekday}" — "Friday" (UTC calendar day of the ISO date). */
export function weekdayOf(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "soon";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "soon";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
}
