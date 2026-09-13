// Listing readiness checker (S29-A) — ASX admission conditions and Nasdaq
// Capital Market initial listing standards, each row computed from stored
// data (cap table × latest share price, bank-line profit, the grant
// profile) or from the founder-ticked `listing_profiles.facts`, never
// invented. Same fact → met | not_met | not_confirmed pattern as the S27-A
// ESS annex (`buildEssChecklist`), plus a fourth status,
// `confirm_current_rule`, for a threshold this module does not assert.
//
// Every row carries the rule it encodes (`sourceRef`) and the date the
// rule text was checked (`asAt`). The rows are READINESS INDICATORS, not
// legal advice — the exchange, its guidance notes and the company's
// advisers decide admission (see `LISTING_READINESS_NOTE`).
//
// Pure — no I/O — so the route, page, PDF and the colocated suite share one
// implementation.

import type { ListingProfileFacts } from "./profile";

export type Exchange = "asx" | "nasdaq";
export type ReadinessStatus = "met" | "not_met" | "not_confirmed" | "confirm_current_rule";

export interface ReadinessRow {
  id: string;
  exchange: Exchange;
  /** Rule identifier as printed: "ASX LR 1.1 condition 8". */
  rule: string;
  /** Short label for the row. */
  label: string;
  status: ReadinessStatus;
  /** What the status was computed from (numbers, dates, "not recorded"). */
  basis: string;
  /** The published source the rule was taken from. */
  sourceRef: string;
  /** The date the rule text was last checked (YYYY-MM-DD). */
  asAt: string;
  /** Practical next step when the row is not met / not confirmed; null when met. */
  nextStep: string | null;
}

export interface ReadinessScore {
  met: number;
  notMet: number;
  notConfirmed: number;
  confirmCurrentRule: number;
  total: number;
  /** met ÷ (met + not_met), 0–100; null when nothing is decided yet. */
  pct: number | null;
}

/** One cap-table row as the checker sees it. */
export interface CapTableHolder {
  id: string | null;
  name: string;
  role: string;
  sharesHeld: number;
}

/** Everything the builders need — assembled by `lib/listing/server.ts`. */
export interface ListingFacts {
  holders: CapTableHolder[];
  /** Latest S26-B share price (mid), A$; null when there is no usable valuation. */
  sharePriceAud: number | null;
  /** Profit (revenue − expenses) over the last 12 months from categorised bank lines; null when coverage < 12 months. */
  profitLast12mAud: number | null;
  /** Months of bank-line coverage behind `profitLast12mAud`. */
  profitCoverageMonths: number;
  /** Grant profile facts (G11) — incorporation, listed flag. */
  incorporatedAt: string | null;
  listed: boolean | null;
  profile: ListingProfileFacts;
  /**
   * The date the checklist is computed for (YYYY-MM-DD) — company age and
   * operating history are measured to this day, never to the rules' as-at
   * constant. Absent → today (UTC).
   */
  asOf?: string;
}

/* ── Rule constants (as at the date below) ──────────────────────────── */

/** Date the encoded rule text was last checked against the published rules. */
export const ASX_RULES_AS_AT = "2026-09-13";
export const NASDAQ_RULES_AS_AT = "2026-09-13";

export const ASX_SOURCE = "ASX Listing Rules, Chapter 1 (Admission) and Chapter 19 (Definitions)";
export const NASDAQ_SOURCE = "Nasdaq Listing Rules, Rule 5505 (Capital Market initial listing) and the Rule 5600 series (Corporate governance)";

export const ASX_MIN_SPREAD_HOLDERS = 300;
export const ASX_MIN_PARCEL_AUD = 2_000;
export const ASX_MIN_FREE_FLOAT_PCT = 20;
export const ASX_PROFIT_3Y_AUD = 1_000_000;
export const ASX_PROFIT_12M_AUD = 500_000;
export const ASX_NTA_AUD = 4_000_000;
export const ASX_MARKET_CAP_AUD = 15_000_000;
export const ASX_WORKING_CAPITAL_AUD = 1_500_000;
export const ASX_MIN_ISSUE_PRICE_AUD = 0.2;
export const ASX_PROFIT_TEST_AUDITED_FYS = 3;
export const ASX_ASSETS_TEST_AUDITED_FYS = 2;

export const NASDAQ_MIN_UNRESTRICTED_PUBLIC_SHARES = 1_000_000;
export const NASDAQ_MIN_ROUND_LOT_HOLDERS = 300;
export const NASDAQ_ROUND_LOT_SHARES = 100;
export const NASDAQ_ROUND_LOT_MIN_VALUE_USD = 2_500;
export const NASDAQ_ROUND_LOT_MIN_VALUE_SHARE = 0.5;
export const NASDAQ_MIN_MARKET_MAKERS = 3;
export const NASDAQ_BID_PRICE_USD = 4;
export const NASDAQ_BID_PRICE_ALT_EQUITY_USD = 3;
export const NASDAQ_BID_PRICE_ALT_MVLS_USD = 2;
export const NASDAQ_EQUITY_STANDARD = { equityUsd: 5_000_000, mvuphsUsd: 15_000_000, operatingHistoryYears: 2 } as const;
export const NASDAQ_MVLS_STANDARD = { equityUsd: 4_000_000, mvuphsUsd: 15_000_000, mvlsUsd: 50_000_000 } as const;
export const NASDAQ_NET_INCOME_STANDARD = { equityUsd: 4_000_000, mvuphsUsd: 5_000_000, netIncomeUsd: 750_000 } as const;
export const NASDAQ_AUDIT_COMMITTEE_MIN_INDEPENDENT = 3;
/** Officers, directors and holders of MORE THAN 10 % are excluded from "publicly held" (Rule 5005(a)(35)); a holder at exactly 10 % is public. */
export const NASDAQ_INSIDER_HOLDING_PCT = 10;

/** Cap-table roles treated as affiliated / restricted for spread and free-float purposes. */
export const AFFILIATED_ROLES: readonly string[] = ["founder", "co-founder", "cofounder", "director", "executive", "officer", "esop"];

export const LISTING_READINESS_NOTE =
  "These rows are readiness indicators computed from the records on file, not legal advice and not an opinion on admission. " +
  "The exchange applies its rules and guidance notes at the application date and may impose additional conditions; the thresholds shown were checked on the date stated and can change. " +
  "Confirm every row with the company's lawyers, auditors and a licensed adviser before relying on it.";

export const NOT_RECORDED = "not recorded";

/* ── Money / number formatting ────────────────────────────────────────── */

export function formatAud(v: number): string {
  if (!Number.isFinite(v)) return "A$0";
  const abs = Math.abs(v);
  const s = abs >= 100 ? Math.round(abs).toLocaleString("en-AU") : abs.toFixed(2);
  return `${v < 0 ? "−" : ""}A$${s}`;
}

export function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return "US$0";
  const abs = Math.abs(v);
  const s = abs >= 100 ? Math.round(abs).toLocaleString("en-US") : abs.toFixed(2);
  return `${v < 0 ? "−" : ""}US$${s}`;
}

export function formatPct(v: number): string {
  return `${(Math.round(v * 10) / 10).toLocaleString("en-AU")} %`;
}

function count(n: number): string {
  return n.toLocaleString("en-AU");
}

/* ── Cap-table maths ──────────────────────────────────────────────────── */

export function isAffiliated(holder: CapTableHolder, restrictedIds: readonly string[] = []): boolean {
  const role = (holder.role ?? "").trim().toLowerCase();
  if (AFFILIATED_ROLES.includes(role)) return true;
  return holder.id !== null && restrictedIds.includes(holder.id);
}

export interface SpreadResult {
  /** Holders on the register with shares > 0. */
  holders: number;
  /** Non-affiliated holders with shares > 0. */
  nonAffiliated: number;
  /** Non-affiliated holders whose parcel (shares × price) is ≥ the minimum. */
  qualifying: number;
  /** Non-affiliated holders below the parcel minimum. */
  belowParcel: number;
  priceAud: number | null;
}

/** ASX spread: non-affiliated holders each holding a parcel worth ≥ A$2,000 at `priceAud` (inclusive boundary). */
export function computeSpread(holders: CapTableHolder[], priceAud: number | null, restrictedIds: readonly string[] = [], minParcelAud = ASX_MIN_PARCEL_AUD): SpreadResult {
  const withShares = holders.filter((h) => h.sharesHeld > 0);
  const nonAff = withShares.filter((h) => !isAffiliated(h, restrictedIds));
  if (priceAud === null || !(priceAud > 0)) return { holders: withShares.length, nonAffiliated: nonAff.length, qualifying: 0, belowParcel: nonAff.length, priceAud: null };
  // Round to the cent before comparing so 1,000 shares × A$2.00 is exactly A$2,000, not 1999.9999.
  const qualifying = nonAff.filter((h) => Math.round(h.sharesHeld * priceAud * 100) / 100 >= minParcelAud).length;
  return { holders: withShares.length, nonAffiliated: nonAff.length, qualifying, belowParcel: nonAff.length - qualifying, priceAud };
}

export interface FreeFloatResult {
  issuedShares: number;
  freeFloatShares: number;
  /** 0–100; null when nothing is issued. */
  pct: number | null;
}

/** Free float = shares held by non-affiliated holders ÷ shares on issue (ESOP pool excluded — it is not issued). */
export function computeFreeFloat(holders: CapTableHolder[], restrictedIds: readonly string[] = []): FreeFloatResult {
  let issued = 0;
  let free = 0;
  for (const h of holders) {
    if (!(h.sharesHeld > 0)) continue;
    issued += h.sharesHeld;
    if (!isAffiliated(h, restrictedIds)) free += h.sharesHeld;
  }
  return { issuedShares: issued, freeFloatShares: free, pct: issued > 0 ? (free / issued) * 100 : null };
}

export interface NasdaqPublicResult {
  /** Shares held by non-affiliated holders each at or below the 10 % insider line (Rule 5005(a)(35) excludes "more than 10 %"). */
  unrestrictedPublicShares: number;
  /** Non-affiliated holders with ≥ 100 shares. */
  roundLotHolders: number;
  /** Of those, holders whose parcel is worth ≥ US$2,500 (null price → 0). */
  roundLotHoldersAboveMinValue: number;
  priceUsd: number | null;
}

/** Nasdaq public-holding maths: officers / directors / more-than-10 % holders excluded; round lot = 100 shares. */
export function computeNasdaqPublic(holders: CapTableHolder[], priceUsd: number | null, restrictedIds: readonly string[] = []): NasdaqPublicResult {
  const issued = holders.reduce((s, h) => s + (h.sharesHeld > 0 ? h.sharesHeld : 0), 0);
  let publicShares = 0;
  let roundLot = 0;
  let aboveMin = 0;
  for (const h of holders) {
    if (!(h.sharesHeld > 0) || isAffiliated(h, restrictedIds)) continue;
    const pct = issued > 0 ? (h.sharesHeld / issued) * 100 : 0;
    // Rule 5005(a)(35): "more than 10 %" is excluded — exactly 10 % stays public.
    if (pct > NASDAQ_INSIDER_HOLDING_PCT) continue;
    publicShares += h.sharesHeld;
    if (h.sharesHeld >= NASDAQ_ROUND_LOT_SHARES) {
      roundLot++;
      if (priceUsd !== null && priceUsd > 0 && Math.round(h.sharesHeld * priceUsd * 100) / 100 >= NASDAQ_ROUND_LOT_MIN_VALUE_USD) aboveMin++;
    }
  }
  return { unrestrictedPublicShares: publicShares, roundLotHolders: roundLot, roundLotHoldersAboveMinValue: aboveMin, priceUsd };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** The day the checklist is computed for — `facts.asOf` or today (UTC). Company age never freezes at the rules' as-at constant. */
function asOfDate(f: ListingFacts): string {
  return f.asOf ?? new Date().toISOString().slice(0, 10);
}

function yearsBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return (to - from) / (365.25 * 24 * 3600 * 1000);
}

function marketCapAud(f: ListingFacts): { value: number | null; basis: string } {
  if (typeof f.profile.expected_market_cap_aud === "number") return { value: f.profile.expected_market_cap_aud, basis: `expected market capitalisation ${formatAud(f.profile.expected_market_cap_aud)} (entered)` };
  const issued = f.holders.reduce((s, h) => s + (h.sharesHeld > 0 ? h.sharesHeld : 0), 0);
  const price = f.profile.proposed_issue_price_aud ?? f.sharePriceAud;
  if (price === null || price === undefined || !(price > 0) || issued <= 0) return { value: null, basis: "market capitalisation not computable — no share price or no shares on issue" };
  const v = issued * price;
  return { value: v, basis: `${count(issued)} shares × ${formatAud(price)} = ${formatAud(v)} (indicative, ${f.profile.proposed_issue_price_aud ? "proposed issue price" : "current share price mid"})` };
}

function row(exchange: Exchange, partial: Omit<ReadinessRow, "exchange" | "asAt" | "sourceRef"> & { sourceRef?: string; asAt?: string }): ReadinessRow {
  return {
    exchange,
    sourceRef: partial.sourceRef ?? (exchange === "asx" ? ASX_SOURCE : NASDAQ_SOURCE),
    asAt: partial.asAt ?? (exchange === "asx" ? ASX_RULES_AS_AT : NASDAQ_RULES_AS_AT),
    ...partial,
  };
}

/* ── ASX ──────────────────────────────────────────────────────────────── */

export function buildAsxChecklist(f: ListingFacts): ReadinessRow[] {
  const p = f.profile;
  const restricted = p.restricted_holder_ids ?? [];
  const price = p.proposed_issue_price_aud ?? f.sharePriceAud;
  const priceLabel = p.proposed_issue_price_aud ? "proposed issue price" : "current share price (mid)";
  const rows: ReadinessRow[] = [];

  // Condition 8 — spread.
  const spread = computeSpread(f.holders, price ?? null, restricted);
  rows.push(
    row("asx", {
      id: "asx.spread",
      rule: "ASX LR 1.1 condition 8",
      label: `Minimum spread — at least ${ASX_MIN_SPREAD_HOLDERS} non-affiliated holders, each with a parcel worth at least ${formatAud(ASX_MIN_PARCEL_AUD)}`,
      status: spread.priceAud === null ? (spread.nonAffiliated >= ASX_MIN_SPREAD_HOLDERS ? "not_confirmed" : "not_met") : spread.qualifying >= ASX_MIN_SPREAD_HOLDERS ? "met" : "not_met",
      basis:
        spread.priceAud === null
          ? `${count(spread.nonAffiliated)} non-affiliated holder${spread.nonAffiliated === 1 ? "" : "s"} on the cap table (${count(spread.holders)} in total); parcel value cannot be tested — no share price on file`
          : `${count(spread.qualifying)} of ${count(spread.nonAffiliated)} non-affiliated holders hold a parcel worth ≥ ${formatAud(ASX_MIN_PARCEL_AUD)} at ${formatAud(spread.priceAud)} per share (${priceLabel}); ${count(spread.belowParcel)} below the parcel minimum. Founders, directors, executives, ESOP rows and any holder you marked as restricted are excluded; restricted securities are excluded by the rule`,
      nextStep:
        spread.qualifying >= ASX_MIN_SPREAD_HOLDERS && spread.priceAud !== null
          ? null
          : `Plan a pre-IPO placement or the IPO offer itself to reach ${ASX_MIN_SPREAD_HOLDERS} qualifying holders (you have ${count(spread.priceAud === null ? spread.nonAffiliated : spread.qualifying)}); confirm the parcel test at the offer price with the lead manager`,
    }),
  );

  // Condition 7 — free float.
  const ff = computeFreeFloat(f.holders, restricted);
  rows.push(
    row("asx", {
      id: "asx.free-float",
      rule: "ASX LR 1.1 condition 7 (free float defined in LR 19.12)",
      label: `Free float of at least ${ASX_MIN_FREE_FLOAT_PCT} % at admission`,
      status: ff.pct === null ? "not_confirmed" : ff.pct >= ASX_MIN_FREE_FLOAT_PCT ? "met" : "not_met",
      basis:
        ff.pct === null
          ? "No shares on issue in the cap table"
          : `${count(ff.freeFloatShares)} of ${count(ff.issuedShares)} issued shares (${formatPct(ff.pct)}) are held by non-affiliated holders; securities under escrow at admission also come out of the free float — mark escrowed holders as restricted`,
      nextStep: ff.pct !== null && ff.pct >= ASX_MIN_FREE_FLOAT_PCT ? null : "Size the IPO offer (new shares to the public) so that non-affiliated, non-escrowed holders own at least 20 % on admission",
    }),
  );

  // Profit test (LR 1.2) — 3 full FYs aggregated ≥ A$1m AND last 12 months ≥ A$500k.
  const byFy = (p.profit_by_fy ?? []).slice().sort((a, b) => b.fy.localeCompare(a.fy));
  const last3 = byFy.slice(0, 3);
  const agg3 = last3.length === 3 ? last3.reduce((s, r) => s + r.profit_aud, 0) : null;
  const last12 = f.profitLast12mAud ?? (byFy[0]?.profit_aud ?? null);
  const last12Source = f.profitLast12mAud !== null ? `categorised bank lines (${f.profitCoverageMonths} months of coverage)` : byFy[0] ? `${byFy[0].fy} profit as entered` : null;
  let profitStatus: ReadinessStatus;
  if (agg3 === null || last12 === null) profitStatus = (agg3 !== null && agg3 < ASX_PROFIT_3Y_AUD) || (last12 !== null && last12 < ASX_PROFIT_12M_AUD) ? "not_met" : "not_confirmed";
  else profitStatus = agg3 >= ASX_PROFIT_3Y_AUD && last12 >= ASX_PROFIT_12M_AUD ? "met" : "not_met";
  rows.push(
    row("asx", {
      id: "asx.profit-test",
      rule: "ASX LR 1.2 (profit test): LR 1.2.4 and LR 1.2.5",
      label: `Profit test — aggregated profit from continuing operations ≥ ${formatAud(ASX_PROFIT_3Y_AUD)} over the last 3 full financial years and ≥ ${formatAud(ASX_PROFIT_12M_AUD)} over the last 12 months`,
      status: profitStatus,
      basis: [
        agg3 === null ? `3-year aggregate ${NOT_RECORDED} — ${last3.length} of 3 financial years entered` : `3-year aggregate ${formatAud(agg3)} (${last3.map((r) => `${r.fy} ${formatAud(r.profit_aud)}`).join(", ")})`,
        last12 === null ? `last-12-month profit ${NOT_RECORDED}` : `last 12 months ${formatAud(last12)} from ${last12Source}`,
        "the profit test also needs a going concern, the same main business activity for 3 full financial years and audited accounts for those years (LR 1.2.1–1.2.3)",
      ].join("; "),
      nextStep: profitStatus === "met" ? null : "Most tech companies list under the assets test instead — if you cannot show three profitable audited years, treat the assets-test rows as the path and enter each financial year's profit from continuing operations only when the audited figures exist",
    }),
  );

  // Assets test (LR 1.3) — NTA ≥ A$4m after raise costs OR market cap ≥ A$15m; working capital ≥ A$1.5m.
  const mc = marketCapAud(f);
  const nta = p.nta_after_raise_aud ?? null;
  const wc = p.working_capital_aud ?? null;
  const sizeMet = (nta !== null && nta >= ASX_NTA_AUD) || (mc.value !== null && mc.value >= ASX_MARKET_CAP_AUD);
  const sizeDecidable = nta !== null && mc.value !== null;
  let assetsStatus: ReadinessStatus;
  if (sizeMet && wc !== null && wc >= ASX_WORKING_CAPITAL_AUD) assetsStatus = "met";
  else if ((sizeDecidable && !sizeMet) || (wc !== null && wc < ASX_WORKING_CAPITAL_AUD)) assetsStatus = "not_met";
  else assetsStatus = "not_confirmed";
  rows.push(
    row("asx", {
      id: "asx.assets-test",
      rule: "ASX LR 1.3 (assets test): LR 1.3.1 and LR 1.3.3(a)",
      label: `Assets test — net tangible assets ≥ ${formatAud(ASX_NTA_AUD)} after raising costs OR market capitalisation ≥ ${formatAud(ASX_MARKET_CAP_AUD)}, plus working capital ≥ ${formatAud(ASX_WORKING_CAPITAL_AUD)}`,
      status: assetsStatus,
      basis: [
        nta === null ? `NTA after raising costs ${NOT_RECORDED}` : `NTA after raising costs ${formatAud(nta)} (entered${p.balance_sheet_confirmed_at ? `, confirmed ${p.balance_sheet_confirmed_at}` : ""})`,
        mc.basis,
        wc === null ? `working capital ${NOT_RECORDED}` : `working capital ${formatAud(wc)} (entered)`,
        "LR 1.3.2 also limits cash and cash commitments to less than half of total tangible assets, or requires commitments consistent with the business objectives — confirm with your adviser",
      ].join("; "),
      nextStep: assetsStatus === "met" ? null : "Enter NTA after raising costs and working capital from the pro-forma balance sheet in the prospectus; size the raise so working capital is at least A$1.5 million after the raise",
    }),
  );

  // Audited accounts — 3 FYs for the profit test (LR 1.2.3), 2 for the assets test (LR 1.3.5(a)).
  const fys = p.audited_accounts_fys ?? [];
  const needed = p.asx_test === "profit" ? ASX_PROFIT_TEST_AUDITED_FYS : ASX_ASSETS_TEST_AUDITED_FYS;
  const yearsOld = yearsBetween(f.incorporatedAt, asOfDate(f));
  // A company younger than the audited period cannot have `needed` full
  // financial years; with at least one audited year on file the row stays
  // "not confirmed" (ASX may accept the shorter period), never "not met".
  const youngerThanNeeded = yearsOld !== null && yearsOld < needed;
  const auditedStatus: ReadinessStatus =
    fys.length === 0 && !p.audited_accounts_confirmed_at ? "not_confirmed" : fys.length >= needed ? "met" : fys.length > 0 && youngerThanNeeded ? "not_confirmed" : "not_met";
  rows.push(
    row("asx", {
      id: "asx.audited-accounts",
      rule: p.asx_test === "profit" ? "ASX LR 1.2.3" : "ASX LR 1.3.5(a)",
      label: `Audited accounts for the last ${needed} full financial years (${p.asx_test === "profit" ? "profit test" : "assets test"}; shorter where the entity is younger)`,
      status: auditedStatus,
      basis:
        fys.length === 0
          ? `No audited financial years recorded${youngerThanNeeded ? `; incorporated ${f.incorporatedAt} — ${yearsOld.toFixed(1)} years old, so ASX may accept a shorter audited period` : ""}`
          : `${fys.length} audited financial year${fys.length === 1 ? "" : "s"} on file (${fys.join(", ")})${p.audited_accounts_confirmed_at ? `, confirmed ${p.audited_accounts_confirmed_at}` : ""}${fys.length < needed && youngerThanNeeded ? `; incorporated ${f.incorporatedAt} — ${yearsOld.toFixed(1)} years old, so ASX may accept a shorter audited period (since incorporation)` : ""}; ASX also wants an audited or reviewed pro-forma balance sheet and, for a half-year gap, a reviewed half-year`,
      nextStep: auditedStatus === "met" ? null : `Engage a registered company auditor now — ASX expects ${needed} audited full financial years (or since incorporation) with unqualified opinions; tick each year here once the audit report is signed`,
    }),
  );

  // Condition 12 — 20 cent minimum issue price.
  const issuePrice = p.proposed_issue_price_aud ?? null;
  rows.push(
    row("asx", {
      id: "asx.issue-price",
      rule: "ASX LR 1.1 condition 12",
      label: `Issue / sale price of the securities to be quoted is at least ${formatAud(ASX_MIN_ISSUE_PRICE_AUD)} cash`,
      status: issuePrice === null ? "not_confirmed" : issuePrice >= ASX_MIN_ISSUE_PRICE_AUD ? "met" : "not_met",
      basis: issuePrice === null ? `Proposed issue price ${NOT_RECORDED}${f.sharePriceAud !== null ? ` (current indicative share price ${formatAud(f.sharePriceAud)} — not an offer price)` : ""}` : `Proposed issue price ${formatAud(issuePrice)} (entered)`,
      nextStep: issuePrice !== null && issuePrice >= ASX_MIN_ISSUE_PRICE_AUD ? null : "Set the proposed offer price with the lead manager; a share consolidation before the IPO is the usual fix when the implied price is below 20 cents",
    }),
  );

  // Condition 1A — constitution consistent with LR 15.11.
  rows.push(
    row("asx", {
      id: "asx.constitution",
      rule: "ASX LR 1.1 condition 1A (LR 15.11)",
      label: "Constitution consistent with the Listing Rules",
      status: p.constitution_reviewed_at ? "met" : "not_confirmed",
      basis: p.constitution_reviewed_at ? `Constitution reviewed against LR 15.11 on ${p.constitution_reviewed_at} (entered)` : `Constitution review ${NOT_RECORDED} — a proprietary company converts to a public company and adopts a listing-rule-compliant constitution before applying`,
      nextStep: p.constitution_reviewed_at ? null : "Have your lawyers replace the Pty Ltd constitution with a public-company constitution that satisfies LR 15.11 and record the date here; the conversion is lodged with ASIC",
    }),
  );

  // Escrow — restricted securities for assets-test entities.
  const assetsPath = p.asx_test !== "profit";
  rows.push(
    row("asx", {
      id: "asx.escrow",
      rule: "ASX LR Chapter 9 (LR 9.1, Appendix 9B)",
      label: "Escrow expectations for an assets-test entity acknowledged (restricted securities held by seed capitalists, promoters, vendors and related parties)",
      status: !assetsPath ? "not_confirmed" : p.escrow_acknowledged_at ? "met" : "confirm_current_rule",
      basis: !assetsPath
        ? "Targeting the profit test — ASX-imposed escrow generally applies to assets-test entities; confirm whether any voluntary escrow will be required by the lead manager"
        : p.escrow_acknowledged_at
          ? `Escrow expectations acknowledged ${p.escrow_acknowledged_at} (entered); the classification and period of each parcel is set by Appendix 9B — confirm the current periods with your lawyers`
          : "Assets-test path — ASX classifies related-party, promoter, seed and vendor securities as restricted for the period set in Appendix 9B; confirm the current periods and which of your holders are caught",
      nextStep: p.escrow_acknowledged_at ? null : "Map each pre-IPO holder to an Appendix 9B category with your lawyers, then mark the escrowed holders as restricted here so the spread and free-float rows exclude them",
    }),
  );

  // Condition 13 — corporate governance statement.
  rows.push(
    row("asx", {
      id: "asx.governance-statement",
      rule: "ASX LR 1.1 condition 13 (ongoing: LR 4.10.3)",
      label: "Corporate governance statement disclosing the extent to which the entity will follow the ASX Corporate Governance Council's Principles and Recommendations (4th edition)",
      status: p.governance_statement_at ? "met" : "not_confirmed",
      basis: p.governance_statement_at ? `Statement prepared ${p.governance_statement_at} (entered)` : `Governance statement ${NOT_RECORDED}`,
      nextStep: p.governance_statement_at ? null : "Draft the 'if not, why not' statement against the 4th-edition recommendations (board charter, audit and risk committee, diversity policy, code of conduct) and record the date here",
    }),
  );

  // Condition 20 — directors of good fame and character.
  rows.push(
    row("asx", {
      id: "asx.director-checks",
      rule: "ASX LR 1.1 condition 20",
      label: "Each director or proposed director is of good fame and character (police, bankruptcy and regulatory checks)",
      status: p.director_checks_at ? "met" : "not_confirmed",
      basis: p.director_checks_at ? `Checks completed ${p.director_checks_at} (entered)${typeof p.directors_total === "number" ? ` for a board of ${p.directors_total}` : ""}` : `Director checks ${NOT_RECORDED}`,
      nextStep: p.director_checks_at ? null : "Obtain a national police check, bankruptcy search and statutory declaration for every director and proposed director; ASX asks for these with the application",
    }),
  );

  // Currency check — the rules move.
  rows.push(
    row("asx", {
      id: "asx.currency",
      rule: "ASX Listing Rules — current edition",
      label: "Thresholds checked against the Listing Rules in force at your application date",
      status: "confirm_current_rule",
      basis: `The spread, free-float, profit-test and assets-test figures above were checked on ${ASX_RULES_AS_AT}. ASX consults on and amends the admission rules from time to time — confirm the current thresholds and any new admission conditions with your lawyers before relying on them`,
      nextStep: "Ask your lawyer or the lead manager for the current ASX Listing Rules Chapter 1 and Guidance Note 1 at the time of the application",
    }),
  );

  if (f.listed === true) {
    rows.unshift(
      row("asx", {
        id: "asx.already-listed",
        rule: "Project profile",
        label: "The project profile records the company as already listed",
        status: "not_confirmed",
        basis: "The grant profile has `listed` ticked — this checker is for an unlisted company preparing an application; clear the flag if that is wrong",
        nextStep: "Correct the listed flag on the funding profile if the company is not listed",
      }),
    );
  }

  return rows;
}

/* ── Nasdaq Capital Market ───────────────────────────────────────────── */

function usd(f: ListingFacts, aud: number | null | undefined): number | null {
  const rate = f.profile.aud_usd_rate ?? null;
  if (aud === null || aud === undefined || rate === null) return null;
  return aud * rate;
}

export function buildNasdaqChecklist(f: ListingFacts): ReadinessRow[] {
  const p = f.profile;
  const restricted = p.restricted_holder_ids ?? [];
  const rate = p.aud_usd_rate ?? null;
  const rateNote = rate === null ? "AUD→USD rate not entered — US$ figures cannot be computed" : `at 1 AUD = ${rate} USD (entered)`;
  const priceAud = p.proposed_issue_price_aud ?? f.sharePriceAud;
  const priceUsd = usd(f, priceAud);
  const pub = computeNasdaqPublic(f.holders, priceUsd, restricted);
  const rows: ReadinessRow[] = [];

  // 5505(a)(2) — unrestricted publicly held shares.
  rows.push(
    row("nasdaq", {
      id: "nasdaq.public-shares",
      rule: "Nasdaq Rule 5505(a)(2)",
      label: `At least ${count(NASDAQ_MIN_UNRESTRICTED_PUBLIC_SHARES)} unrestricted publicly held shares`,
      status: pub.unrestrictedPublicShares >= NASDAQ_MIN_UNRESTRICTED_PUBLIC_SHARES ? "met" : "not_met",
      basis: `${count(pub.unrestrictedPublicShares)} shares held by holders who are not founders, directors, executives or holders of more than ${NASDAQ_INSIDER_HOLDING_PCT} % (Rule 5005(a)(35) 'publicly held'); lock-up and other restricted shares also come out — mark them as restricted`,
      nextStep: pub.unrestrictedPublicShares >= NASDAQ_MIN_UNRESTRICTED_PUBLIC_SHARES ? null : "Size the IPO so at least 1,000,000 shares are unrestricted and publicly held after the offering (a pre-IPO split is common)",
    }),
  );

  // 5505(a)(3) — round lot holders with the 50 % / US$2,500 nuance.
  const halfNeeded = Math.ceil(NASDAQ_MIN_ROUND_LOT_HOLDERS * NASDAQ_ROUND_LOT_MIN_VALUE_SHARE);
  const rlStatus: ReadinessStatus =
    pub.roundLotHolders < NASDAQ_MIN_ROUND_LOT_HOLDERS ? "not_met" : priceUsd === null ? "not_confirmed" : pub.roundLotHoldersAboveMinValue >= halfNeeded ? "met" : "not_met";
  rows.push(
    row("nasdaq", {
      id: "nasdaq.round-lot-holders",
      rule: "Nasdaq Rule 5505(a)(3)",
      label: `At least ${NASDAQ_MIN_ROUND_LOT_HOLDERS} round lot holders (${NASDAQ_ROUND_LOT_SHARES}+ shares), at least 50 % of whom each hold unrestricted securities worth at least ${formatUsd(NASDAQ_ROUND_LOT_MIN_VALUE_USD)}`,
      status: rlStatus,
      basis: [
        `${count(pub.roundLotHolders)} non-affiliated holders with ≥ ${NASDAQ_ROUND_LOT_SHARES} shares`,
        priceUsd === null ? `minimum-value test not computable — ${rateNote}` : `${count(pub.roundLotHoldersAboveMinValue)} of them hold ≥ ${formatUsd(NASDAQ_ROUND_LOT_MIN_VALUE_USD)} at ${formatUsd(priceUsd)} per share (need ${halfNeeded})`,
      ].join("; "),
      nextStep: rlStatus === "met" ? null : "Build the holder base through the IPO allocation (underwriters allocate to reach the count) and enter an AUD→USD rate so the US$2,500 test can run",
    }),
  );

  // 5505(a)(4) — market makers.
  const mm = p.market_makers ?? null;
  rows.push(
    row("nasdaq", {
      id: "nasdaq.market-makers",
      rule: "Nasdaq Rule 5505(a)(4)",
      label: `At least ${NASDAQ_MIN_MARKET_MAKERS} registered and active market makers`,
      status: mm === null ? "not_confirmed" : mm >= NASDAQ_MIN_MARKET_MAKERS ? "met" : "not_met",
      basis: mm === null ? `Market makers ${NOT_RECORDED}` : `${mm} market maker${mm === 1 ? "" : "s"} committed (entered)`,
      nextStep: mm !== null && mm >= NASDAQ_MIN_MARKET_MAKERS ? null : "The underwriting syndicate normally arranges the market makers — record the committed number here once the syndicate is set",
    }),
  );

  // 5505(a)(1) — bid price.
  let bidStatus: ReadinessStatus;
  if (priceUsd === null) bidStatus = "not_confirmed";
  else if (priceUsd >= NASDAQ_BID_PRICE_USD) bidStatus = "met";
  else if (priceUsd >= NASDAQ_BID_PRICE_ALT_MVLS_USD) bidStatus = "not_confirmed";
  else bidStatus = "not_met";
  rows.push(
    row("nasdaq", {
      id: "nasdaq.bid-price",
      rule: "Nasdaq Rule 5505(a)(1)",
      label: `Minimum bid price of ${formatUsd(NASDAQ_BID_PRICE_USD)} (or a ${formatUsd(NASDAQ_BID_PRICE_ALT_EQUITY_USD)} closing price under the equity or net income standard / ${formatUsd(NASDAQ_BID_PRICE_ALT_MVLS_USD)} under the market value standard, each with extra conditions)`,
      status: bidStatus,
      basis: priceUsd === null ? `Indicative price not computable — ${rateNote}` : `${formatUsd(priceUsd)} per share (${p.proposed_issue_price_aud ? "proposed issue price" : "current share price mid"} ${rateNote})${bidStatus === "not_confirmed" ? " — between the alternative and the standard price; the alternatives carry seasoning and value conditions, confirm with counsel" : ""}`,
      nextStep: bidStatus === "met" ? null : "Set the offer price with the underwriters (a reverse split is the usual fix); price below US$4 only with counsel's confirmation that an alternative price standard applies",
    }),
  );

  // Financial standards — 5505(b)(1)–(3). One of them must be met.
  const equityUsd = usd(f, p.stockholders_equity_aud);
  const mvuphsUsd = priceUsd === null ? null : pub.unrestrictedPublicShares * priceUsd;
  const issued = f.holders.reduce((s, h) => s + (h.sharesHeld > 0 ? h.sharesHeld : 0), 0);
  const mvlsUsd = priceUsd === null || issued <= 0 ? null : issued * priceUsd;
  const netIncomeUsd = usd(f, f.profitLast12mAud ?? (p.profit_by_fy ?? []).slice().sort((a, b) => b.fy.localeCompare(a.fy))[0]?.profit_aud ?? null);
  const history = yearsBetween(f.incorporatedAt, asOfDate(f));

  type Sub = { label: string; value: number | null; min: number; fmt: (v: number) => string };
  const judge = (subs: Sub[]): { status: ReadinessStatus; basis: string } => {
    let anyMissing = false;
    let anyFail = false;
    const parts: string[] = [];
    for (const s of subs) {
      if (s.value === null) {
        anyMissing = true;
        parts.push(`${s.label} ${NOT_RECORDED}`);
      } else if (s.value >= s.min) parts.push(`${s.label} ${s.fmt(s.value)} ≥ ${s.fmt(s.min)}`);
      else {
        anyFail = true;
        parts.push(`${s.label} ${s.fmt(s.value)} < ${s.fmt(s.min)}`);
      }
    }
    return { status: anyFail ? "not_met" : anyMissing ? "not_confirmed" : "met", basis: parts.join("; ") };
  };
  const yrs = (v: number) => `${v.toFixed(1)} yrs`;

  const eq = judge([
    { label: "stockholders' equity", value: equityUsd, min: NASDAQ_EQUITY_STANDARD.equityUsd, fmt: formatUsd },
    { label: "market value of unrestricted publicly held shares", value: mvuphsUsd, min: NASDAQ_EQUITY_STANDARD.mvuphsUsd, fmt: formatUsd },
    { label: "operating history", value: history, min: NASDAQ_EQUITY_STANDARD.operatingHistoryYears, fmt: yrs },
  ]);
  rows.push(
    row("nasdaq", {
      id: "nasdaq.equity-standard",
      rule: "Nasdaq Rule 5505(b)(1) — Equity Standard",
      label: `Equity Standard — stockholders' equity ≥ ${formatUsd(NASDAQ_EQUITY_STANDARD.equityUsd)}, market value of unrestricted publicly held shares ≥ ${formatUsd(NASDAQ_EQUITY_STANDARD.mvuphsUsd)}, ${NASDAQ_EQUITY_STANDARD.operatingHistoryYears}-year operating history`,
      status: eq.status,
      basis: `${eq.basis}; ${rateNote}`,
      nextStep: eq.status === "met" ? null : "Only one of the three financial standards needs to be met — enter stockholders' equity from the audited balance sheet and an AUD→USD rate, then compare the three rows",
    }),
  );

  const mv = judge([
    { label: "market value of listed securities", value: mvlsUsd, min: NASDAQ_MVLS_STANDARD.mvlsUsd, fmt: formatUsd },
    { label: "stockholders' equity", value: equityUsd, min: NASDAQ_MVLS_STANDARD.equityUsd, fmt: formatUsd },
    { label: "market value of unrestricted publicly held shares", value: mvuphsUsd, min: NASDAQ_MVLS_STANDARD.mvuphsUsd, fmt: formatUsd },
  ]);
  rows.push(
    row("nasdaq", {
      id: "nasdaq.market-value-standard",
      rule: "Nasdaq Rule 5505(b)(2) — Market Value of Listed Securities Standard",
      label: `Market Value Standard — market value of listed securities ≥ ${formatUsd(NASDAQ_MVLS_STANDARD.mvlsUsd)}, stockholders' equity ≥ ${formatUsd(NASDAQ_MVLS_STANDARD.equityUsd)}, market value of unrestricted publicly held shares ≥ ${formatUsd(NASDAQ_MVLS_STANDARD.mvuphsUsd)}`,
      status: mv.status,
      basis: `${mv.basis}; ${rateNote}`,
      nextStep: mv.status === "met" ? null : "Market value is tested at the offering price × shares — model the IPO size in Exit Modelling and re-run once the price range is set",
    }),
  );

  const ni = judge([
    { label: "net income from continuing operations (latest FY or 2 of last 3)", value: netIncomeUsd, min: NASDAQ_NET_INCOME_STANDARD.netIncomeUsd, fmt: formatUsd },
    { label: "stockholders' equity", value: equityUsd, min: NASDAQ_NET_INCOME_STANDARD.equityUsd, fmt: formatUsd },
    { label: "market value of unrestricted publicly held shares", value: mvuphsUsd, min: NASDAQ_NET_INCOME_STANDARD.mvuphsUsd, fmt: formatUsd },
  ]);
  rows.push(
    row("nasdaq", {
      id: "nasdaq.net-income-standard",
      rule: "Nasdaq Rule 5505(b)(3) — Net Income Standard",
      label: `Net Income Standard — net income from continuing operations ≥ ${formatUsd(NASDAQ_NET_INCOME_STANDARD.netIncomeUsd)} (latest financial year or two of the last three), stockholders' equity ≥ ${formatUsd(NASDAQ_NET_INCOME_STANDARD.equityUsd)}, market value of unrestricted publicly held shares ≥ ${formatUsd(NASDAQ_NET_INCOME_STANDARD.mvuphsUsd)}`,
      status: ni.status,
      basis: `${ni.basis}${f.profitLast12mAud !== null ? " (net income taken from the last 12 months of categorised bank lines — an indicator, not an audited figure)" : ""}; ${rateNote}`,
      nextStep: ni.status === "met" ? null : "Use the audited income statement — bank-line profit is only an indicator; if the company is loss-making this standard does not apply and the equity or market value standard is the path",
    }),
  );

  // Governance — 5605(c)(2): audit committee of at least 3 independent directors.
  const acMembers = p.audit_committee_independent_members ?? null;
  const acStatus: ReadinessStatus = !p.audit_committee_at && acMembers === null ? "not_confirmed" : acMembers !== null && acMembers >= NASDAQ_AUDIT_COMMITTEE_MIN_INDEPENDENT ? "met" : "not_met";
  rows.push(
    row("nasdaq", {
      id: "nasdaq.audit-committee",
      rule: "Nasdaq Rule 5605(c)(2)",
      label: `Audit committee of at least ${NASDAQ_AUDIT_COMMITTEE_MIN_INDEPENDENT} members, each independent and meeting the SEC Rule 10A-3 criteria, with a written charter`,
      status: acStatus,
      basis: acStatus === "not_confirmed" ? `Audit committee ${NOT_RECORDED}` : `${acMembers ?? 0} independent member${acMembers === 1 ? "" : "s"}${p.audit_committee_at ? `, established ${p.audit_committee_at}` : ""} (entered); phase-in relief for a newly listed company exists (Rule 5615(b)) — confirm with counsel`,
      nextStep: acStatus === "met" ? null : "Recruit independent directors with financial literacy for the audit committee and adopt a charter; note the IPO phase-in schedule with US counsel",
    }),
  );

  // 5605(b)(1) — majority independent board.
  const total = p.directors_total ?? null;
  const indep = p.independent_directors ?? null;
  const boardStatus: ReadinessStatus = total === null || indep === null ? "not_confirmed" : total > 0 && indep * 2 > total ? "met" : "not_met";
  rows.push(
    row("nasdaq", {
      id: "nasdaq.independent-board",
      rule: "Nasdaq Rule 5605(b)(1)",
      label: "A majority of the board is independent (with regularly scheduled executive sessions of the independent directors)",
      status: boardStatus,
      basis: total === null || indep === null ? `Board composition ${NOT_RECORDED}` : `${indep} independent of ${total} directors (entered)${boardStatus === "not_met" ? " — not a majority" : ""}; controlled-company and phase-in exemptions may apply (Rules 5615(c), 5615(b))`,
      nextStep: boardStatus === "met" ? null : "Plan the board for listing: a majority of independent directors under the Rule 5605(a)(2) definition, appointed before the IPO or within the phase-in",
    }),
  );

  // 5610 — code of conduct.
  rows.push(
    row("nasdaq", {
      id: "nasdaq.code-of-conduct",
      rule: "Nasdaq Rule 5610",
      label: "Code of conduct adopted for all directors, officers and employees, publicly available, with waivers disclosed",
      status: p.code_of_conduct_at ? "met" : "not_confirmed",
      basis: p.code_of_conduct_at ? `Code adopted ${p.code_of_conduct_at} (entered)` : `Code of conduct ${NOT_RECORDED}`,
      nextStep: p.code_of_conduct_at ? null : "Adopt a code of conduct that satisfies the SEC's Item 406 'code of ethics' definition and publish it on the investor site",
    }),
  );

  // Currency — 2025 amendments (offering-proceeds MVUPHS, minimum raise).
  rows.push(
    row("nasdaq", {
      id: "nasdaq.currency",
      rule: "Nasdaq Rule 5505 — 2025 amendments",
      label: "Offering-proceeds and minimum-raise conditions in force at your application date",
      status: "confirm_current_rule",
      basis: `Nasdaq amended its initial listing rules in 2025 so that the market value of unrestricted publicly held shares for an IPO is satisfied from offering proceeds, and proposed a minimum public offering size for the Capital Market. This module does not assert those figures — confirm the current rule text and any accelerated-delisting provisions with US counsel (thresholds above checked ${NASDAQ_RULES_AS_AT})`,
      nextStep: "Ask US securities counsel for the current Rule 5505 text and Nasdaq's latest FAQ on IPO offering-proceeds requirements",
    }),
  );

  return rows;
}

/* ── Composite ───────────────────────────────────────────────────────── */

export function buildListingReadiness(exchange: Exchange, facts: ListingFacts): ReadinessRow[] {
  return exchange === "asx" ? buildAsxChecklist(facts) : buildNasdaqChecklist(facts);
}

export function scoreReadiness(rows: ReadinessRow[]): ReadinessScore {
  let met = 0;
  let notMet = 0;
  let notConfirmed = 0;
  let confirmCurrentRule = 0;
  for (const r of rows) {
    if (r.status === "met") met++;
    else if (r.status === "not_met") notMet++;
    else if (r.status === "not_confirmed") notConfirmed++;
    else confirmCurrentRule++;
  }
  const decided = met + notMet;
  return { met, notMet, notConfirmed, confirmCurrentRule, total: rows.length, pct: decided > 0 ? Math.round((met / decided) * 100) : null };
}

export const EXCHANGES: readonly Exchange[] = ["asx", "nasdaq"];

export function isExchange(v: unknown): v is Exchange {
  return v === "asx" || v === "nasdaq";
}

export function exchangeLabel(e: Exchange): string {
  return e === "asx" ? "ASX (admission conditions)" : "Nasdaq Capital Market (initial listing)";
}

export function statusLabel(s: ReadinessStatus): string {
  switch (s) {
    case "met":
      return "Met";
    case "not_met":
      return "Not met";
    case "not_confirmed":
      return "Not confirmed";
    default:
      return "Confirm current rule";
  }
}

/** Facts block with nothing on file — every computed row not confirmed / not met. */
export function emptyListingFacts(): ListingFacts {
  return { holders: [], sharePriceAud: null, profitLast12mAud: null, profitCoverageMonths: 0, incorporatedAt: null, listed: null, profile: {} };
}
