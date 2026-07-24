// Reseller module — full A + B walkthrough plan.
//
// docs/plans/reseller-module-goal.md P10_hardening exit criterion:
//   "Playwright E2E: full A + B walkthrough as founder, reseller, admin"
//
// The plan file listed a single-line requirement for a composite walkthrough
// that stitches the founder + reseller + admin surfaces into one end-to-end
// probe. Individual role-scoped specs already live under
// web/tests/e2e/reseller/ (39+ files by tick 393) covering per-endpoint authz,
// validation, scope-boundary, attribution-timing, and audit-log-writes. This
// module supplies the canonical ordered step-list they are missing: the
// exact surface sequence a live Playwright run must exercise to attest that
// Track A (reseller channel) + Track B (showcase workspace) are wired end to
// end. A live runner (web/tests/e2e/reseller/full-walkthrough.spec.ts) loops
// over WALKTHROUGH_STEPS and drives each surface; a future digest / CLI can
// summarise coverage via summariseWalkthroughPlan() without re-deriving the
// role split.
//
// Kept pure — no fetch, no fs, no next/headers — so vitest can lock in the
// invariants (phase coverage, role split, contiguous ordering, path shape)
// that a future edit could otherwise silently violate.

/** Role that owns the browser session for the step. */
export type WalkthroughRole = "founder" | "reseller" | "admin";

/** Track the step belongs to — A = reseller channel, B = showcase workspace. */
export type WalkthroughTrack = "A" | "B";

/**
 * One ordered probe in the composite walkthrough. `path` is the HTTP surface
 * the runner must load (page or API). `assert` names the invariant the
 * runner must verify — kept as a human-readable string so the spec file can
 * annotate the test row without duplicating the sentence.
 */
export interface WalkthroughStep {
  /** Stable slug — used as the vitest / Playwright test row label. */
  id: string;
  role: WalkthroughRole;
  track: WalkthroughTrack;
  /** Track A phase reference (P2..P10) or Track B leaf (B1..B10). */
  phase: string;
  /** URL path the runner navigates to (or hits with fetch). */
  path: string;
  /** One-sentence description of the runner's action. */
  action: string;
  /** One-sentence description of the invariant to assert. */
  assert: string;
}

/** Canonical ordered walkthrough — founder-attribution → reseller-console →
 *  admin-audit. Extending: append at the end of the relevant role block, keep
 *  the role blocks contiguous, ensure every added phase gains a step. */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  // -- Founder (Track A capture + Track B showcase) --------------------------
  {
    id: "founder.landing_with_via_cookie",
    role: "founder",
    track: "A",
    phase: "P2",
    path: "/svi?via=INFOVISION",
    action: "Land on SVI entrance with ?via= query.",
    assert: "blockid_via cookie is stamped with the reseller code.",
  },
  {
    id: "founder.onboarding_reseller_step",
    role: "founder",
    track: "A",
    phase: "P2",
    path: "/onboarding",
    action: "Advance through onboarding to the reseller-code step.",
    assert: "Reseller pill renders the display name from /api/reseller/code/validate.",
  },
  {
    id: "founder.consent_notice_visible",
    role: "founder",
    track: "A",
    phase: "P10",
    path: "/onboarding",
    action: "Open the reseller consent modal on the reseller step.",
    assert: "APP 5.2 (a)-(j) notice text renders in the founder's locale.",
  },
  {
    id: "founder.workspace_cobranding_pill",
    role: "founder",
    track: "A",
    phase: "P4",
    path: "/workspace",
    action: "Load the workspace shell as the attributed founder.",
    assert: "Topbar renders 'Referred by <reseller>' co-branding pill.",
  },
  {
    id: "founder.showcase_atlassian_step1",
    role: "founder",
    track: "B",
    phase: "B6",
    path: "/showcase/atlassian?step=1",
    action: "Load the anonymous showcase walkthrough at Step 1.",
    assert: "Step 1 of 9 heading + Start-Walkthrough CTA are visible.",
  },
  // -- Reseller (Track A console) -------------------------------------------
  {
    id: "reseller.dashboard_kpis",
    role: "reseller",
    track: "A",
    phase: "P4",
    path: "/reseller",
    action: "Reseller admin loads the console dashboard.",
    assert: "Attributed-customer count + phase distribution render without leaking k<5 buckets.",
  },
  {
    id: "reseller.customers_list_masked_email",
    role: "reseller",
    track: "A",
    phase: "P4",
    path: "/reseller/customers",
    action: "Open the customers list.",
    assert: "Each row shows a masked email; reveal button is present but does not auto-expand.",
  },
  {
    id: "reseller.customer_drawer_reveal_audit",
    role: "reseller",
    track: "A",
    phase: "P4",
    path: "/reseller/customers",
    action: "Reveal one attributed customer's email via the drawer button.",
    assert: "reseller_audit_log gains one row with action='email.revealed'.",
  },
  {
    id: "reseller.credits_grant_within_budget",
    role: "reseller",
    track: "A",
    phase: "P6",
    path: "/reseller/credits",
    action: "Grant a small credit bundle to the attributed customer.",
    assert: "credit_balances + credit_transactions + reseller_credit_grants all update atomically.",
  },
  {
    id: "reseller.credits_grant_over_budget_request",
    role: "reseller",
    track: "A",
    phase: "P6",
    path: "/reseller/credits",
    action: "Attempt an over-budget grant to trigger the 402 path.",
    assert: "Grant form offers 'Request admin approval' CTA that POSTs to /api/reseller/requests.",
  },
  {
    id: "reseller.codes_list_and_request",
    role: "reseller",
    track: "A",
    phase: "P9",
    path: "/reseller/codes",
    action: "Submit a new promotion-code request (tier 20).",
    assert: "reseller_requests row inserted with request_type='code_request' and status='pending'.",
  },
  {
    id: "reseller.reports_signed_url_download",
    role: "reseller",
    track: "A",
    phase: "P7",
    path: "/reseller/reports",
    action: "Request a monthly-report CSV signed URL.",
    assert: "Response returns a Storage signed URL scoped to the reseller-reports bucket.",
  },
  {
    id: "reseller.create_startup_wholesale",
    role: "reseller",
    track: "A",
    phase: "P5",
    path: "/reseller/create-startup",
    action: "Provision a wholesale-billed startup for a new founder email.",
    assert: "app_users + subscription_trial_state + reseller_attributions rows land in one commit.",
  },
  // -- Admin (Track A oversight + Track B showcase seed) --------------------
  {
    id: "admin.resellers_list",
    role: "admin",
    track: "A",
    phase: "P9",
    path: "/admin/resellers",
    action: "Admin loads the resellers list.",
    assert: "InfoVision row renders with the correct billing_model + commission_share_pct.",
  },
  {
    id: "admin.reseller_detail_and_edit",
    role: "admin",
    track: "A",
    phase: "P9",
    path: "/admin/resellers/INFOVISION",
    action: "Open the InfoVision detail page.",
    assert: "Overview cards + promotion codes + recent commissions render; PATCH form respects U.15.1 invariant.",
  },
  {
    id: "admin.requests_inbox_approve",
    role: "admin",
    track: "A",
    phase: "P9",
    path: "/admin/resellers/requests",
    action: "Approve the reseller's pending code_request.",
    assert: "Stripe coupon + promotion_code minted; reseller_promotion_codes row inserted; request flips to approved.",
  },
  {
    id: "admin.impersonation_trail_tab",
    role: "admin",
    track: "A",
    phase: "P12",
    path: "/admin/affiliate/INFOVISION",
    action: "Switch to the Impersonation tab on the affiliate drawer.",
    assert: "Six admin.* audit actions render per attributed user; each row links to /admin/users/[id].",
  },
  {
    id: "admin.showcase_seed_visible",
    role: "admin",
    track: "B",
    phase: "B1",
    path: "/showcase/blockid",
    action: "Load the BlockID showcase data-room as any visitor.",
    assert: "242+ report rows render from data_rooms.sections without an auth prompt.",
  },
] as const;

/** Roles the plan covers — used by the summary + tests. */
export const WALKTHROUGH_ROLES: readonly WalkthroughRole[] = [
  "founder",
  "reseller",
  "admin",
];

/** Tracks the plan covers. */
export const WALKTHROUGH_TRACKS: readonly WalkthroughTrack[] = ["A", "B"];

/** Track A phases (P2..P10, P12) that the walkthrough MUST cover at least once. */
export const REQUIRED_TRACK_A_PHASES: readonly string[] = [
  "P2",
  "P4",
  "P5",
  "P6",
  "P7",
  "P9",
  "P10",
];

export interface WalkthroughPlanSummary {
  totalSteps: number;
  stepsByRole: Record<WalkthroughRole, number>;
  stepsByTrack: Record<WalkthroughTrack, number>;
  phasesCovered: readonly string[];
}

/** Group the plan by role in ordered form — the runner uses this to boot one
 *  browser context per role rather than re-authenticating per step. */
export function stepsByRole(role: WalkthroughRole): readonly WalkthroughStep[] {
  return WALKTHROUGH_STEPS.filter((s) => s.role === role);
}

/** Group the plan by track. */
export function stepsByTrack(track: WalkthroughTrack): readonly WalkthroughStep[] {
  return WALKTHROUGH_STEPS.filter((s) => s.track === track);
}

/** Emit the sorted-unique phase-reference list. */
export function phasesCovered(): readonly string[] {
  const set = new Set(WALKTHROUGH_STEPS.map((s) => s.phase));
  return [...set].sort();
}

/** Digest-ready summary. */
export function summariseWalkthroughPlan(): WalkthroughPlanSummary {
  const stepsRole: Record<WalkthroughRole, number> = {
    founder: 0,
    reseller: 0,
    admin: 0,
  };
  const stepsTrack: Record<WalkthroughTrack, number> = { A: 0, B: 0 };
  for (const step of WALKTHROUGH_STEPS) {
    stepsRole[step.role] += 1;
    stepsTrack[step.track] += 1;
  }
  return {
    totalSteps: WALKTHROUGH_STEPS.length,
    stepsByRole: stepsRole,
    stepsByTrack: stepsTrack,
    phasesCovered: phasesCovered(),
  };
}

export interface WalkthroughValidationIssue {
  step: string;
  reason: string;
}

/**
 * Structural validator — asserts the invariants a live runner assumes. Kept
 * as a pure return-issue-array function so vitest can seed corrupt copies
 * (via structuredClone + mutation) and confirm the guard catches each break.
 */
export function validateWalkthroughPlan(
  steps: readonly WalkthroughStep[] = WALKTHROUGH_STEPS,
): WalkthroughValidationIssue[] {
  const issues: WalkthroughValidationIssue[] = [];
  const idSet = new Set<string>();
  const PHASE_RE = /^(P\d{1,2}|B\d{1,2})$/;
  for (const step of steps) {
    if (!step.id || step.id.trim() === "") {
      issues.push({ step: "(unnamed)", reason: "empty id" });
      continue;
    }
    if (idSet.has(step.id)) {
      issues.push({ step: step.id, reason: "duplicate id" });
    }
    idSet.add(step.id);
    if (!WALKTHROUGH_ROLES.includes(step.role)) {
      issues.push({ step: step.id, reason: `unknown role '${step.role}'` });
    }
    if (!WALKTHROUGH_TRACKS.includes(step.track)) {
      issues.push({ step: step.id, reason: `unknown track '${step.track}'` });
    }
    if (!PHASE_RE.test(step.phase)) {
      issues.push({ step: step.id, reason: `phase '${step.phase}' not in P<n> / B<n> shape` });
    }
    if (!step.path.startsWith("/")) {
      issues.push({ step: step.id, reason: `path '${step.path}' must start with /` });
    }
    if (!step.action || step.action.trim() === "") {
      issues.push({ step: step.id, reason: "empty action" });
    }
    if (!step.assert || step.assert.trim() === "") {
      issues.push({ step: step.id, reason: "empty assert" });
    }
  }
  return issues;
}
