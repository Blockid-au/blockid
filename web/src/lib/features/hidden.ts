// HIDDEN_FEATURES — the one list of surfaces we do not sell yet (G20-F1,
// 2026-09-20; docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F1, § 5 F-1).
//
// "Ready for sale" means every feature a customer can reach either works
// end-to-end on production or is hidden: nav row removed, sitemap entry
// dropped, route answers the shared <NotOfferedCard> (noindex) instead of a
// half-built flow, no CTA points at it. Nothing is deleted — un-hiding is
// one row removed here (the inventory in docs/ops/feature-inventory.md
// records why each row exists and what would make it sellable).
//
// Consumers (each pinned by hidden.test.ts):
//   • lib/nav/hubs.ts            — hub tabs whose href is hidden are dropped
//   • components/workspace/nav-groups.ts — sidebar leaves dropped
//   • lib/nav/user-menu.ts       — avatar-menu rows dropped
//   • app/sitemap.ts             — hidden public URLs never advertised
//   • the hidden pages themselves — render <NotOfferedCard feature=key>
//
// Pure data + two resolvers. No React, no Next, no `server-only` — the nav
// catalogues that import it are themselves dependency-free and are read by
// server layouts, client components, the docs matrix and next.config-adjacent
// tests alike.

export type HiddenVisibility = "public" | "signed-in" | "admin";

export interface HiddenFeature {
  /** Stable slug — `?feature=` on the contact link, `data-feature` on the card, inventory row id. */
  key: string;
  /**
   * Route prefixes the feature owns. A prefix matches the exact pathname
   * and every path beneath it (`/innovator` covers `/innovator/watchlist`).
   * A trailing dynamic segment is written as the prefix above it
   * (`/es` covers `/es/tbr/[token]`); a dynamic segment in the middle is
   * kept as `[param]` and matches one segment of any value.
   */
  routes: string[];
  /**
   * Nav identifiers the feature had — documentation + test hooks:
   *   `hub:<hubId>:<segment>`  a hub tab (`lib/nav/hubs.ts`)
   *   `nav:<href>`             a sidebar leaf (`nav-groups.ts`)
   *   `menu:<key>`             an avatar-menu row (`user-menu.ts`)
   *   `tools:<slug>`           a card on /tools
   *   `section:<page>#<id>`    an in-page section that was removed
   */
  navKeys: string[];
  /** Why it is hidden — one sentence, in the founder's words where possible. */
  reason: string;
  since: "2026-09-20";
  /**
   * `public` pages get `robots: noindex` + sitemap exclusion; `signed-in`
   * pages are behind auth already; `admin` rows are listed for the founder
   * and answer the card to admins only.
   */
  visibility: HiddenVisibility;
}

const SINCE = "2026-09-20" as const;

export const HIDDEN_FEATURES: readonly HiddenFeature[] = Object.freeze([
  // ── Founder workspace ────────────────────────────────────────────────────
  {
    key: "sso",
    routes: [],
    navKeys: ["section:/workspace/settings/enterprise#sso"],
    reason: "SAML / OIDC sign-in needs an identity-provider integration that is not built; no plan grants it.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "white_label",
    routes: [],
    navKeys: ["section:/workspace/settings/enterprise#white-label"],
    reason: "Full white-label chrome (own domain, BlockID attribution removed) is not built; report branding (logo + colours) is what Growth sells.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "public_listing_submission",
    routes: ["/workspace/score/listing", "/submit"],
    navKeys: ["hub:score:listing"],
    reason: "No listing-submission flow exists: /submit wrote to public_index_submissions, which nothing reads, and no ticker is ever reserved. Index rows are computed from graded reports.",
    since: SINCE,
    visibility: "public",
  },
  {
    key: "investor_access_link_builder",
    routes: ["/workspace/investors/access/new"],
    navKeys: [],
    reason: "Static explainer ('the full builder form ships in a follow-up release'); links are created from the Access tab itself.",
    since: SINCE,
    visibility: "signed-in",
  },
  // ── Evaluator workspace ──────────────────────────────────────────────────
  {
    key: "advisor_weekly_digest",
    routes: ["/workspace/weekly-digest"],
    navKeys: ["nav:/workspace/weekly-digest"],
    reason: "No data path: the advisor roll-up page reads nothing; the founder and investor Monday digests are e-mails.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "investor_digest",
    routes: ["/workspace/investor/digest"],
    navKeys: ["nav:/workspace/investor/digest"],
    reason: "Reads watchlist_digest, which no cron writes — every investor saw the empty state forever. The Monday e-mail (api/cron/investor-weekly-digest) is the live surface.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "investor_portfolio",
    routes: ["/workspace/investor/portfolio"],
    navKeys: ["nav:/workspace/investor/portfolio"],
    reason: "Static explainer ('the full portfolio grid ships in a follow-up release'); the watchlist and deal flow cover the need today.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "advisor_roster_invite",
    routes: ["/workspace/advisor/roster/invite"],
    navKeys: [],
    reason: "Static explainer ('the full invite composer ships in a follow-up release'); clients are added by e-mail from the roster page.",
    since: SINCE,
    visibility: "signed-in",
  },
  // `accelerator_cohort_add` (/workspace/accelerator/cohort/add) left the
  // registry in G21 P2-A: the path is a config redirect to the BlockID Cohort
  // index (lib/nav/legacy-redirects.ts), where founders arrive by CSV import
  // or intake link.
  {
    key: "lp_quarterly_explainer",
    routes: ["/dashboard/reports/lp-quarterly"],
    navKeys: [],
    reason: "Static explainer for a PDF generator that does not exist ('automated PDF export ships in a follow-up release'); the working surfaces are /workspace/accelerator/quarterly-report and the LP report composer.",
    since: SINCE,
    visibility: "signed-in",
  },
  // ── Consoles ─────────────────────────────────────────────────────────────
  {
    key: "innovator_console",
    routes: ["/innovator"],
    navKeys: ["persona:innovator:console"],
    reason: "Four empty shells with no innovator_* tables (watchlist, deal pipeline, pinning are dead buttons); the industry map's leaderboard lives at /dataset.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "mentor_founder_tools",
    routes: ["/reseller/mentor/[founderId]/goals", "/reseller/mentor/[founderId]/notes", "/reseller/mentor/[founderId]/checkins"],
    navKeys: [],
    reason: "Read-only lists whose write paths (goal form, note composer, check-in scheduler, their API routes) were never built — the empty states rendered 'TODO:' copy.",
    since: SINCE,
    visibility: "signed-in",
  },
  // ── Connectors without a provisioned OAuth app (hidden dynamically) ──────
  // Rows carry no route: the UIs drop a connector whose key is absent
  // (`isProviderConfigured` / HEAD probe), so adding STRIPE_CLIENT_ID or
  // XERO_CLIENT_ID un-hides them without a code change. Listed here so the
  // inventory and the guard test know they are hidden on purpose.
  {
    key: "connector_stripe_connect",
    routes: [],
    navKeys: ["connector:stripe"],
    reason: "STRIPE_CLIENT_ID (Stripe Connect OAuth app) is not set on production; the start route answers 503.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "connector_xero",
    routes: [],
    navKeys: ["connector:xero"],
    reason: "XERO_CLIENT_ID / XERO_CLIENT_SECRET are not set on production; the start route answers 503.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "connector_quickbooks",
    routes: [],
    navKeys: ["connector:quickbooks"],
    reason: "No QuickBooks OAuth app or connector code exists; the P&L page offered a dead tile. CSV import under Expenses covers the same figures.",
    since: SINCE,
    visibility: "signed-in",
  },
  // ── Locale stubs (F-3: only /vi is a maintained mirror) ─────────────────
  {
    key: "locale_es",
    routes: ["/es"],
    navKeys: [],
    reason: "Spanish TBR shell is an unmaintained fork of /tbr (missing the score total, lead modal and view beacon) with a broken login bounce; only English and Vietnamese are offered.",
    since: SINCE,
    visibility: "signed-in",
  },
  {
    key: "locale_ja",
    routes: ["/ja"],
    navKeys: [],
    reason: "Japanese TBR shell is an unmaintained fork of /tbr (same drift as /es); only English and Vietnamese are offered.",
    since: SINCE,
    visibility: "signed-in",
  },
  // ── Admin-only ───────────────────────────────────────────────────────────
  {
    key: "admin_tokens",
    routes: ["/admin/tokens"],
    navKeys: ["nav:/admin/tokens"],
    reason: "Token console reads a hard-coded local-chain factory address and its create-company form is 'coming soon'; the private EVM explorer + CLI are the working surface.",
    since: SINCE,
    visibility: "admin",
  },
]);

function normalise(pathname: string): string {
  const p = pathname.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** `/reseller/mentor/[founderId]/goals` → one segment of any value in the `[…]` slot. */
function covers(prefix: string, path: string): boolean {
  if (!prefix.includes("[")) return path === prefix || path.startsWith(`${prefix}/`);
  const want = prefix.split("/");
  const have = path.split("/");
  if (have.length < want.length) return false;
  return want.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]") ? have[i]!.length > 0 : seg === have[i]));
}

/** The hidden feature that owns `pathname`, or null. */
export function hiddenFeatureFor(pathname: string): HiddenFeature | null {
  const path = normalise(pathname);
  for (const f of HIDDEN_FEATURES) {
    for (const r of f.routes) if (covers(r, path)) return f;
  }
  return null;
}

/** True when `pathname` (query / hash ignored) belongs to a hidden feature. */
export function isHiddenRoute(pathname: string): boolean {
  return hiddenFeatureFor(pathname) !== null;
}

/** True when a nav identifier (`hub:score:listing`, `menu:score`, …) was hidden. */
export function isHiddenNavKey(navKey: string): boolean {
  return HIDDEN_FEATURES.some((f) => f.navKeys.includes(navKey));
}

/** Every hidden route prefix (flat) — sitemap + tests. */
export function hiddenRoutes(): string[] {
  return HIDDEN_FEATURES.flatMap((f) => f.routes);
}

/** Hidden feature by key (card props, tests). */
export function hiddenFeature(key: string): HiddenFeature | undefined {
  return HIDDEN_FEATURES.find((f) => f.key === key);
}
