"use client";

// AnalyzeRoot — the /analyze route's client-side state machine.
//
// Phases:
//   1. INTAKE   — user drops a deck / pastes a URL / types an idea.
//   2. CONFIRM  — after /api/intake settles, load /api/svi/report-estimate
//                 (real per-context cost) then show AnalyzeCostModal.
//   3. LIVE     — mount the variant panel keyed to intake.inputKind.
//                 Each panel drives its own real progress (deck slides
//                 walked from intake.structured.slides; site EventSource
//                 to /api/site-crawl/stream; idea lab stage card from
//                 intake.context) then fires onDone(intake).
//   4. RESULTS  — <AnalyzeResults intake={intake} /> derives StageBanner,
//                 SviScoreRing, radar, gaps, actions from the intake.
//
// This ships the "honesty" fix flagged by prior review: handleConfirm()
// now actually calls the backend instead of only flipping UI state and
// animating a fake sequence.

import * as React from "react";
import dynamic from "next/dynamic";
import { SmartIntake, type SmartIntakeSubmission } from "./smart-intake";
import { AnalyzeCostModal, type CostRow } from "./analyze-cost-modal";
import { SavedAnalysisPanel } from "./saved-analysis-panel";
import { FreeSummaryPanel } from "./free-summary-panel";
import { FreeReportEmailPanel, type FreeReportEmailError } from "./free-report-email-panel";
import { FreeReportPayPanel, type FreeReportPayQuote } from "./free-report-pay-panel";
import { ArtefactGatePanel } from "./artefact-gate-panel";
import {
  GuestPaidCheckout,
  type GuestInputType,
} from "./guest-paid-checkout";
import { plannedAgentsFor } from "@/lib/analyze/agent-plan";
import {
  clearPendingIntake,
  clearSignupIntake,
  submissionFromQuery,
  takePendingIntake,
  takeSignupIntake,
} from "@/lib/analyze/pending-intake";
import { claimedMessage, savedAnalysisPath } from "@/lib/analyses/summary";
import {
  FREE_REPORT_ALLOWANCE_USED,
  FREE_REPORT_HONEYPOT_FIELD,
  FREE_REPORT_IP_LIMIT,
} from "@/lib/reports/free-grants-rules";
import type { FreeReportCopy } from "@/lib/reports/free-report-copy";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { IntakeContext } from "@/lib/intake/detect-context";
import type { AgentRole } from "@/lib/report-pipeline/types";
import { sviStageToCanonical } from "@/lib/journey-vocabulary";

const DeckReaderPanel = dynamic(
  () => import("./deck-reader-panel").then((m) => m.DeckReaderPanel),
  { ssr: false },
);
const SiteVisitorPanel = dynamic(
  () => import("./site-visitor-panel").then((m) => m.SiteVisitorPanel),
  { ssr: false },
);
const IdeaLabPanel = dynamic(
  () => import("./idea-lab-panel").then((m) => m.IdeaLabPanel),
  { ssr: false },
);
const AnalyzeResults = dynamic(
  () => import("./analyze-results").then((m) => m.AnalyzeResults),
  { ssr: false },
);
// S32-B — the full first analysis: "What we read", the valuation working and
// the seven C-level sections, streamed in from the background job.
const FullReportPanel = dynamic(
  () => import("./full-report-panel").then((m) => m.FullReportPanel),
  { ssr: false },
);

// G25-C: `email` — a guest is asked where the report goes BEFORE the run;
// `pay` — the third run: the A$3 quote, nothing was run.
type Phase = "intake" | "email" | "pay" | "confirm" | "live" | "results";

/** localStorage key for the address a guest gave — the second run is one click. */
export const REPORT_EMAIL_STORAGE_KEY = "blockid_report_email";

function rememberedEmail(): string | null {
  try {
    const v = window.localStorage.getItem(REPORT_EMAIL_STORAGE_KEY);
    return v && v.includes("@") ? v : null;
  } catch {
    return null;
  }
}

function rememberEmail(email: string): void {
  try {
    window.localStorage.setItem(REPORT_EMAIL_STORAGE_KEY, email);
  } catch {
    /* private mode / blocked storage — the panel simply asks again next time */
  }
}

/** Fill `{n}` / `{count}` / `{email}` in a status line. Client-safe (no catalogue import). */
export function fillFreeReportLine(template: string, tokens: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, key: string) => {
    const v = tokens[key];
    return v === null || v === undefined ? whole : String(v);
  });
}

interface AnalyzeRootProps {
  /** ?tier=free|paid — controls whether a paid tier is pre-selected. */
  tier?: "free" | "paid";
  /** G25-C: the free-allowance copy, resolved server-side (EN / VI). */
  freeReportCopy: FreeReportCopy;
  /**
   * Server-resolved session state. When false and `tier === "paid"` the
   * confirm step sells the A$3 guest report instead of spending credits the
   * visitor does not have. Undefined means "unknown" — we then fall back to
   * the 401 signal from /api/svi/report-estimate.
   */
  authenticated?: boolean;
  /**
   * `?q=` from the homepage hero — the text or URL the visitor already typed.
   * When present the analysis runs against it on mount so nobody is asked to
   * type the same thing twice.
   */
  initialQuery?: string;
  /** `?kind=` — which variant the hero classified before navigating. */
  initialKind?: string;
  /**
   * `?resume=signup` — this visitor was shown the account wall, made an
   * account, and has come straight back. The run they were promised is free,
   * so it starts immediately rather than routing through a credit
   * confirmation nobody warned them about.
   */
  resumedFromSignup?: boolean;
  /**
   * `?claimed=` — how many earlier runs the signup actually attached to the
   * new account. A real number from the auth endpoint; 0 means say nothing.
   */
  claimed?: number;
}

/**
 * Should the run start without the confirm modal?
 *
 * The free path costs nothing, so an extra "yes I meant it" click after the
 * visitor already pressed the hero button is pure friction — that is the
 * double-entry this exists to kill. Anything that can spend credits or take
 * money (a signed-in run, or `?tier=paid`) still goes through the confirm
 * step, because price must always be shown before it is charged.
 */
export function shouldAutoRun(opts: {
  tier?: "free" | "paid";
  authenticated?: boolean;
  /**
   * Returning from the signup gate. This exact run was promised free before
   * the account existed, so showing a credit confirmation now would be a
   * bait and switch — and a brand-new account has no credits to satisfy it
   * with, so the CTA would be disabled and the promise simply broken.
   */
  resumedFromSignup?: boolean;
}): boolean {
  if (opts.tier === "paid") return false;
  if (opts.resumedFromSignup) return true;
  return opts.authenticated === false;
}

// Placeholder per-agent credit cost used before the live estimate arrives
// so the modal has something to render immediately.
const PLACEHOLDER_AGENT_COST: Record<AgentRole, number> = {
  ceo: 1.5,
  cfo: 1.5,
  cto: 1.0,
  cpo: 1.0,
  cmo: 1.0,
  cro: 1.0,
  clo: 1.0,
  chro: 0.5,
  ciso: 0.5,
  cdo: 0.5,
  coo: 0.5,
};

interface EstimateResult {
  rows: CostRow[];
  total: number;
  fullTeardown?: number;
  balance?: number;
  canAfford?: boolean;
  signInRequired?: boolean;
}

/** Build a placeholder estimate off just the intake context. */
function placeholderEstimate(context?: IntakeContext): EstimateResult {
  const stage = context ? sviStageToCanonical(context.stage) : "idea";
  const planned = plannedAgentsFor(stage);
  const rows: CostRow[] = planned.map((p) => ({
    planned: p,
    credits: PLACEHOLDER_AGENT_COST[p.agent] ?? 0.75,
  }));
  const total = rows.reduce((sum, r) => sum + r.credits, 0);
  const fullTeardown = Object.values(PLACEHOLDER_AGENT_COST).reduce(
    (a, b) => a + b,
    0,
  );
  return { rows, total, fullTeardown };
}

/** POST /api/intake with the SmartIntake submission. */
/** Mirrors DECK_MAX_BYTES on the server (25 MB) — client copy only. */
const FILE_MAX_MB = 25;

export interface GuestIdentity {
  /** The address the report goes to (required for a guest — G25-C). */
  email: string;
  /** The hidden field's value — empty for a person. */
  honeypot: string;
}

async function postIntake(
  sub: SmartIntakeSubmission,
  tier: "free" | "paid" = "free",
  guest?: GuestIdentity | null,
): Promise<Response> {
  // `tier` rides along so the server-side gate can let a guest heading for
  // the A$3 guest checkout straight through. It only ever widens the gate —
  // it never charges anything and never grants credits.
  if (sub.file) {
    const form = new FormData();
    form.set("file", sub.file);
    if (sub.text) form.set("text", sub.text);
    if (sub.url) form.set("url", sub.url);
    form.set("tier", tier);
    if (guest) {
      form.set("email", guest.email);
      form.set(FREE_REPORT_HONEYPOT_FIELD, guest.honeypot);
    }
    return fetch("/api/intake", { method: "POST", body: form });
  }
  const body: Record<string, string> = { tier };
  if (sub.text) body.text = sub.text;
  if (sub.url) body.url = sub.url;
  if (guest) {
    body.email = guest.email;
    body[FREE_REPORT_HONEYPOT_FIELD] = guest.honeypot;
  }
  return fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Which guest SKU (if any) this submission can be sold as. The guest API
 * (`/api/guest-analysis/create-order`) only accepts `pitch_file` and
 * `website_url` — a typed idea has no A$3 SKU, so it stays on the free /
 * credits path.
 */
export function guestInputTypeFor(
  intake: IntakeResult | null,
  sub: SmartIntakeSubmission | null,
): GuestInputType | null {
  if (!intake) return null;
  if (intake.inputKind === "pitch_deck" && sub?.file) return "pitch_file";
  if (intake.inputKind === "website" && guestUrlFor(intake, sub)) {
    return "website_url";
  }
  return null;
}

/**
 * G25-C: the guest SKU from the SUBMISSION alone — on the third run the
 * server never classified the input (`free_allowance_used` runs nothing),
 * so the pay panel decides from what the visitor handed over.
 */
export function guestInputTypeForSubmission(sub: SmartIntakeSubmission | null): GuestInputType | null {
  if (!sub) return null;
  if (sub.file) return "pitch_file";
  return guestUrlFor(null, sub) ? "website_url" : null;
}

/** Best-effort recovery of the site URL the visitor supplied. */
export function guestUrlFor(
  intake: IntakeResult | null,
  sub: SmartIntakeSubmission | null,
): string {
  const candidate = sub?.url ?? sub?.text ?? intake?.rawText ?? "";
  const trimmed = candidate.trim();
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

export function AnalyzeRoot({
  tier = "free",
  freeReportCopy,
  authenticated,
  initialQuery,
  initialKind,
  resumedFromSignup = false,
  claimed = 0,
}: AnalyzeRootProps) {
  const [phase, setPhase] = React.useState<Phase>("intake");
  const [submission, setSubmission] =
    React.useState<SmartIntakeSubmission | null>(null);
  const [intake, setIntake] = React.useState<IntakeResult | null>(null);
  // Row id from POST /api/intake. `null` means the save failed — the analysis
  // is still valid, we just have no permalink to offer and say nothing about
  // saving. See SavedAnalysisPanel.
  const [analysisId, setAnalysisId] = React.useState<string | null>(null);
  const [intakeLoading, setIntakeLoading] = React.useState(false);
  const [estimate, setEstimate] = React.useState<EstimateResult | null>(null);
  const [estimateLoading, setEstimateLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [ocrOffered, setOcrOffered] = React.useState(false);
  const [ocrLoading, setOcrLoading] = React.useState(false);
  const [guestCheckoutOpen, setGuestCheckoutOpen] = React.useState(false);
  // Bumped when the free-summary card reports a send, so the full-report
  // panel re-polls at once and the guest's locked sections open without a
  // reload.
  const [unlockNonce, setUnlockNonce] = React.useState(0);
  // G25-C — the address a guest gave for the report (remembered on this
  // browser so the second run is one click), the server's verdict on it,
  // the quote when the allowance is used, and the run's own free-report
  // facts (which of the two, where it goes, whether the cap queued it).
  const [reportEmail, setReportEmail] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<FreeReportEmailError>(null);
  const [payInfo, setPayInfo] = React.useState<{ quote: FreeReportPayQuote | null; payHref: string } | null>(null);
  const [freeReportInfo, setFreeReportInfo] = React.useState<{
    sequenceNo: number | null;
    remaining: number;
    queued: boolean;
    emailTo: string | null;
  } | null>(null);
  // Whether the run parked behind the e-mail ask should auto-start.
  const pendingAutoRunRef = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    // Post-hydration read of a per-browser convenience; the server render
    // has no address and the first client render must agree with it.
    const remembered = rememberedEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; read once after mount
    if (remembered) setReportEmail(remembered);
  }, []);

  /** POST /api/svi/report-estimate with the freshly-detected context. */
  const loadEstimate = React.useCallback(
    async (context: IntakeContext | undefined) => {
      setEstimateLoading(true);
      const placeholder = placeholderEstimate(context);
      setEstimate(placeholder);
      // The server already told the page the visitor is anonymous: the
      // estimate route would answer 401 (its guest signal) and the browser
      // would log a console error on every guest analysis (live QA
      // 2026-09-15). Take the guest branch without the round trip.
      if (authenticated === false) {
        setEstimate({ ...placeholder, signInRequired: true });
        setEstimateLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/svi/report-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        if (res.status === 401) {
          setEstimate({ ...placeholder, signInRequired: true });
          return;
        }
        if (!res.ok) {
          // Keep the placeholder rows so the user still sees something —
          // the surface just won't show live balance/canAfford.
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          agentsPlanned?: AgentRole[];
          totalCredits?: number;
          fullTeardownCost?: number;
          balance?: number;
          canAfford?: boolean;
        };
        if (!data.ok || !Array.isArray(data.agentsPlanned)) return;
        const stageKey = context ? sviStageToCanonical(context.stage) : "idea";
        const planned = plannedAgentsFor(stageKey);
        // Match the estimator's returned agent list against the planned
        // lineup so the tier chips (opus/sonnet/haiku) stay in sync.
        const rows: CostRow[] = data.agentsPlanned.map((agent) => {
          const match = planned.find((p) => p.agent === agent);
          const perAgentCost =
            data.totalCredits && data.agentsPlanned!.length > 0
              ? Math.round(
                  (data.totalCredits / data.agentsPlanned!.length) * 100,
                ) / 100
              : PLACEHOLDER_AGENT_COST[agent] ?? 0.75;
          return {
            planned: match ?? { agent, tier: "sonnet" },
            credits: perAgentCost,
          };
        });
        setEstimate({
          rows,
          total: data.totalCredits ?? placeholder.total,
          fullTeardown: data.fullTeardownCost ?? placeholder.fullTeardown,
          balance: data.balance,
          canAfford: data.canAfford,
        });
      } catch {
        // Network hiccup — placeholder is already staged, keep it.
      } finally {
        setEstimateLoading(false);
      }
    },
    [authenticated],
  );

  /**
   * SmartIntake handed us a submission. Fire /api/intake, then move to
   * confirm and kick off the estimate load.
   */
  async function handleSubmit(
    sub: SmartIntakeSubmission,
    opts?: { autoRun?: boolean; guest?: GuestIdentity },
  ) {
    setSubmission(sub);
    setErrorMsg(null);
    // G25-C — a guest is asked where the report goes BEFORE anything runs.
    // The address is remembered on this browser, so only the first run on
    // a device shows the panel; the run itself is parked and resumes with
    // the same auto-run decision it arrived with.
    const isGuest = authenticated !== true;
    const guest: GuestIdentity | null = isGuest
      ? (opts?.guest ?? (() => {
          const known = reportEmail ?? rememberedEmail();
          return known ? { email: known, honeypot: "" } : null;
        })())
      : null;
    if (isGuest && !guest) {
      pendingAutoRunRef.current = opts?.autoRun;
      setAwaitingHandoff(false);
      setPhase("email");
      return;
    }
    setIntakeLoading(true);
    try {
      const res = await postIntake(sub, tier, guest);
      if (res.status === 400 && isGuest) {
        // The address did not pass the server (required / invalid /
        // disposable) — back to the ask with the server's reason.
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        const reason = body?.reason ?? "";
        setEmailError(reason === "email_disposable" ? "disposable" : reason === "email_required" ? "required" : "invalid");
        pendingAutoRunRef.current = opts?.autoRun;
        setPhase("email");
        setIntakeLoading(false);
        return;
      }
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        setErrorMsg(
          body?.reason === FREE_REPORT_IP_LIMIT
            ? freeReportCopy.ipLimit
            : "Slow down — rate limited. Try again in a minute.",
        );
        setIntakeLoading(false);
        return;
      }
      if (res.status === 413) {
        // Either our typed cap or (before 2026-09-19) nginx's bare page —
        // both mean the same thing to the founder.
        setErrorMsg(
          `That file is too large — the maximum is ${FILE_MAX_MB} MB. Try a compressed PDF or paste the deck text instead.`,
        );
        setIntakeLoading(false);
        return;
      }
      if (!res.ok) {
        setErrorMsg(
          "Something went wrong. Try again or contact support.",
        );
        setIntakeLoading(false);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        used?: number;
        price?: FreeReportPayQuote;
        payHref?: string;
        freeReport?: { sequenceNo: number | null; remaining: number; queued: boolean; emailTo: string | null } | null;
        analysisId?: string | null;
      } & IntakeResult;
      // The quote. A 200 with `ok: false` and this reason means the two
      // free reports are used and the server deliberately declined to run
      // — nothing was analysed and nothing was spent. It is NOT an error
      // and must never be rendered as one: the price is shown, then the
      // existing A$3 path takes over.
      if (data.ok === false && data.reason === FREE_REPORT_ALLOWANCE_USED) {
        setPayInfo({ quote: data.price ?? null, payHref: data.payHref ?? "/workspace/reports/business" });
        setPhase("pay");
        setIntakeLoading(false);
        return;
      }
      if (!data.ok) {
        setErrorMsg("Something went wrong. Try again or contact support.");
        setIntakeLoading(false);
        return;
      }
      if (guest) {
        setReportEmail(guest.email);
        setEmailError(null);
        rememberEmail(guest.email);
      }
      setFreeReportInfo(data.freeReport ?? null);
      setIntake(data);
      setAnalysisId(
        typeof data.analysisId === "string" ? data.analysisId : null,
      );
      setOcrOffered(
        data.inputKind === "pitch_deck" &&
          Boolean(
            data.warnings?.some((w) => /pdf.*ocr|image-only/i.test(w)),
          ),
      );
      // Default to the shared rule rather than to "show the modal". An
      // anonymous free run costs the visitor nothing, so the confirm step has
      // no price to disclose — and for an anonymous caller the modal renders
      // a SIGN IN link in place of the run button, which walled run 1 for
      // anyone who typed into the box on /analyze instead of arriving from
      // the hero. Run 1 is meant to be completely unwalled on every path.
      const autoRun =
        opts?.autoRun ??
        shouldAutoRun({ tier, authenticated, resumedFromSignup });
      if (autoRun) {
        setPhase("live");
        setRunning(true);
      } else {
        setPhase("confirm");
      }
      // Fire-and-forget — modal shows placeholder rows immediately, then
      // real estimate rewires them when it resolves.
      void loadEstimate(data.context);
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Network error — please retry.",
      );
    } finally {
      setAwaitingHandoff(false);
      setIntakeLoading(false);
    }
  }

  // ── Hero handoff ───────────────────────────────────────────────────
  // The homepage hero parks its submission in the pending-intake store and
  // navigates here. Claim it on mount and run — the visitor typed once and
  // should never be asked to type again. If the store is empty (hard reload,
  // shared link) `?q=` rebuilds a text/URL submission. A deck that lost its
  // bytes falls through to the intake box with an explanation.
  const autoRanRef = React.useRef(false);
  const [deckHandoffLost, setDeckHandoffLost] = React.useState(false);
  // Whether a handoff is expected on this render. Derived from the URL only
  // (never from the module store), so the server HTML and the first client
  // render agree — otherwise the visitor sees an empty box flash before the
  // run starts, which is the exact "type it again" moment being removed.
  const [awaitingHandoff, setAwaitingHandoff] = React.useState(
    () => Boolean(initialQuery) || initialKind === "deck" || resumedFromSignup,
  );

  React.useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    // Order matters: the in-memory handoff (a hero click, File handle intact)
    // beats the written-down one, which beats rebuilding from `?q=`.
    const parked = takePendingIntake() ?? takeSignupIntake();
    const sub = parked ?? submissionFromQuery({ q: initialQuery, kind: initialKind });
    if (!sub) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration claim of the client-only pending-intake store; the initial state is URL-derived so server and first client render agree
      if (initialKind === "deck") setDeckHandoffLost(true);
      setAwaitingHandoff(false);
      return;
    }
    void handleSubmit(sub, {
      autoRun: shouldAutoRun({ tier, authenticated, resumedFromSignup }),
    });
    // Mount-only: the handoff is single-shot by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guest A$3 path ─────────────────────────────────────────────────
  // `?tier=paid` on an anonymous visit means "I want the paid report" — the
  // credits flow is useless to someone with no account. Sell them the same
  // A$3 One-Click Report that /one-click-report sells, using the identical
  // upload-pitch → create-order → Stripe contract.
  const isAnonymous =
    authenticated === false ||
    (authenticated === undefined && estimate?.signInRequired === true);
  const guestInputType = guestInputTypeFor(intake, submission);
  const guestSellable = tier === "paid" && isAnonymous && !!guestInputType;

  /** Confirm modal → guest checkout, or advance to the live variant panel. */
  function handleConfirm() {
    if (!intake) return;
    if (guestSellable) {
      setGuestCheckoutOpen(true);
      return;
    }
    setPhase("live");
    setRunning(true);
  }

  /** Variant panel finished → mount results view. */
  const handleVariantDone = React.useCallback(
    (_i?: IntakeResult) => {
      setRunning(false);
      setPhase("results");
    },
    [],
  );

  /** Fire OCR fallback for image-only PDFs. */
  async function runOcr() {
    if (!submission?.file || ocrLoading) return;
    setOcrLoading(true);
    try {
      const form = new FormData();
      form.set("file", submission.file);
      const res = await fetch("/api/pitchdeck/ocr", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setErrorMsg("OCR failed — try uploading a text-based PDF instead.");
        return;
      }
      // Re-post intake now that OCR has enriched the text — the intake
      // endpoint owns the extraction pipeline so we just re-run it.
      await handleSubmit(submission);
      setOcrOffered(false);
    } finally {
      setOcrLoading(false);
    }
  }

  function handleReset() {
    clearPendingIntake();
    clearSignupIntake();
    setPayInfo(null);
    setEmailError(null);
    setFreeReportInfo(null);
    pendingAutoRunRef.current = undefined;
    setDeckHandoffLost(false);
    setAwaitingHandoff(false);
    setPhase("intake");
    setSubmission(null);
    setIntake(null);
    setAnalysisId(null);
    setEstimate(null);
    setErrorMsg(null);
    setOcrOffered(false);
    setGuestCheckoutOpen(false);
  }

  // ── Render ─────────────────────────────────────────────────────────
  // A real claim count from the signup that just ran. `claimedMessage`
  // returns null for 0, so nothing is said when nothing was claimed.
  const claimedNote = claimedMessage(claimed);

  if (phase === "email") {
    // G25-C — the address ask, before the run. Nothing has been sent to
    // the server yet (or it came back asking for a usable address).
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <FreeReportEmailPanel
          copy={freeReportCopy.email}
          initialEmail={reportEmail}
          serverError={emailError}
          busy={intakeLoading}
          onContinue={(email, honeypot) => {
            if (!submission) return;
            setEmailError(null);
            void handleSubmit(submission, {
              autoRun: pendingAutoRunRef.current ?? shouldAutoRun({ tier, authenticated, resumedFromSignup }),
              guest: { email, honeypot },
            });
          }}
          onEdit={handleReset}
        />
      </div>
    );
  }

  if (phase === "pay") {
    // G25-C — the third run: the quote. The server ran nothing and charged
    // nothing; the price is on screen before any checkout exists.
    const sellable = guestInputTypeForSubmission(submission);
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <FreeReportPayPanel
          copy={freeReportCopy.pay}
          quote={payInfo?.quote ?? null}
          payHref={payInfo?.payHref ?? "/workspace/reports/business"}
          authenticated={authenticated === true}
          guestSellable={Boolean(sellable)}
          onGuestCheckout={sellable ? () => setGuestCheckoutOpen(true) : undefined}
          onEdit={handleReset}
        />
        {sellable && (
          <GuestPaidCheckout
            open={guestCheckoutOpen}
            onClose={() => setGuestCheckoutOpen(false)}
            inputType={sellable}
            file={submission?.file ?? null}
            url={guestUrlFor(null, submission)}
            initialEmail={reportEmail ?? undefined}
          />
        )}
      </div>
    );
  }

  if (phase === "intake") {
    // A handoff is in flight — show that the run is starting rather than an
    // empty box the visitor might start retyping into.
    if (awaitingHandoff && !errorMsg) {
      return (
        <div
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-line-subtle bg-surface-raised px-6 py-10"
          data-testid="analyze-handoff-starting"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-action motion-reduce:animate-none"
          />
          <p className="text-sm font-medium text-primary">
            Starting your analysis…
          </p>
          <p className="text-xs text-muted">
            Using what you already entered — no need to type it again.
          </p>
          {claimedNote && (
            <p className="text-xs text-secondary" data-testid="analyze-claimed-note">
              {claimedNote}
            </p>
          )}
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col items-center gap-3">
        {claimedNote && (
          <div
            role="status"
            className="w-full rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
            data-testid="analyze-claimed-note"
          >
            {claimedNote}
          </div>
        )}
        {deckHandoffLost && (
          <div
            role="status"
            className="w-full rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
            data-testid="analyze-deck-handoff-lost"
          >
            Your deck did not make it through the page refresh — files can’t
            travel in a link. Drop it here once and the analysis starts.
          </div>
        )}
        <SmartIntake onSubmit={(sub) => void handleSubmit(sub)} />
        {intakeLoading && (
          <p className="text-xs text-tertiary">
            Reading your input…
          </p>
        )}
        {errorMsg && (
          <div
            role="alert"
            className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-primary"
            data-testid="analyze-error"
          >
            {errorMsg}
          </div>
        )}
        <p className="text-[11px] uppercase tracking-wider text-tertiary">
          {tier === "paid"
            ? "Paid report · A$3 inc. GST · emailed as a PDF"
            : "Your first two business reports are free · e-mailed as a PDF"}
        </p>
      </div>
    );
  }

  const stageLabel = intake?.context
    ? sviStageToCanonical(intake.context.stage).replace(/_/g, " ")
    : "unknown";
  const lineupCount = estimate?.rows.length ?? 0;

  return (
    <div className="w-full">
      {ocrOffered && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-primary"
          data-testid="analyze-ocr-banner"
        >
          <span>
            This PDF looks scanned. Run OCR (+2 credits) to extract the
            text?
          </span>
          <button
            type="button"
            onClick={() => void runOcr()}
            disabled={ocrLoading}
            className="rounded-lg bg-warn px-3 py-1.5 text-xs font-semibold text-on-warn hover:opacity-90 disabled:opacity-60"
            data-testid="analyze-ocr-run"
          >
            {ocrLoading ? "Running OCR…" : "Run OCR"}
          </button>
        </div>
      )}

      <AnalyzeCostModal
        open={phase === "confirm" && !!estimate && !guestCheckoutOpen}
        onClose={handleReset}
        onConfirm={handleConfirm}
        rows={estimate?.rows ?? []}
        totalCredits={estimate?.total}
        fullTeardownCredits={estimate?.fullTeardown}
        // A guest buying the A$3 report is not spending credits, so the
        // balance / affordability gate must not disable the CTA.
        creditBalance={guestSellable ? undefined : estimate?.balance}
        estimateLoading={estimateLoading}
        signInHref={
          !guestSellable && estimate?.signInRequired
            ? "/auth/login?next=/analyze"
            : undefined
        }
        ctaLabel={guestSellable ? "Continue — A$3 report" : "Run analysis"}
        title={guestSellable ? "Your A$3 report" : "Confirm the analysis"}
        subtitle={
          guestSellable
            ? `Detected stage: ${stageLabel} · ${lineupCount} agents run on your input. One-off A$3 inc. GST — emailed as a PDF, no account needed.`
            : `Detected stage: ${stageLabel} · ${lineupCount} agents will run.`
        }
      />

      {guestInputType && (
        <GuestPaidCheckout
          open={guestCheckoutOpen}
          onClose={() => setGuestCheckoutOpen(false)}
          inputType={guestInputType}
          file={submission?.file ?? null}
          url={guestUrlFor(intake, submission)}
        />
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-primary"
          data-testid="analyze-error"
        >
          {errorMsg}
        </div>
      )}

      {phase === "live" && intake && (
        <div className="w-full">
          {intake.inputKind === "pitch_deck" && (
            <DeckReaderPanel intake={intake} onDone={handleVariantDone} />
          )}
          {intake.inputKind === "website" && (
            <SiteVisitorPanel
              url={submission?.url ?? submission?.text ?? intake.rawText}
              intake={intake}
              onDone={handleVariantDone}
            />
          )}
          {(intake.inputKind === "idea_text" ||
            intake.inputKind === "existing_company_text") && (
            <IdeaLabPanel intake={intake} onDone={handleVariantDone} />
          )}
          {running && (
            <p className="mt-3 text-center text-xs text-tertiary">
              Analysing your input…
            </p>
          )}
        </div>
      )}

      {phase === "results" && intake && (
        <>
          <AnalyzeResults intake={intake} />
          <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-4 px-4 text-left">
            {/* G25-C — which free report this is and where it goes. Facts
                from the API (never invented): sequence, destination, and
                whether today's cap queued it for the cron. */}
            {freeReportInfo && (
              <div
                role="status"
                className="rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
                data-testid="analyze-free-report-status"
                data-sequence={freeReportInfo.sequenceNo ?? undefined}
                data-queued={freeReportInfo.queued ? "1" : "0"}
              >
                <p>
                  {fillFreeReportLine(
                    freeReportInfo.queued ? freeReportCopy.status.queued : freeReportCopy.status.sending,
                    { n: freeReportInfo.sequenceNo, email: freeReportInfo.emailTo ?? "your inbox" },
                  )}
                </p>
                {freeReportInfo.sequenceNo !== null && (
                  <p className="mt-1 text-xs text-tertiary">
                    {freeReportInfo.remaining > 0 ? freeReportCopy.status.remainingOne : freeReportCopy.status.remainingNone}
                  </p>
                )}
              </div>
            )}
            {/* S32-B — the first analysis in full: what we read, the
                valuation working, the seven C-level voices as they land.
                Renders the echo instantly from the intake; everything else
                streams in from the job keyed on the saved row. */}
            <FullReportPanel
              analysisId={analysisId}
              authenticated={authenticated}
              unlockNonce={unlockNonce}
              intake={intake}
            />
            {claimedNote && (
              <div
                role="status"
                className="rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm text-secondary"
                data-testid="analyze-claimed-note"
              >
                {claimedNote}
              </div>
            )}
            {/* The ask, after the answer. Value has already been given —
                the score and the range are on screen above this line — so
                the email buys the portable written version, not the result
                itself. Never rendered before `phase === "results"`. */}
            <FreeSummaryPanel
              analysisId={analysisId}
              onSent={() => setUnlockNonce((n) => n + 1)}
            />
            <SavedAnalysisPanel
              analysisId={analysisId}
              authenticated={authenticated}
            />
            <ArtefactGatePanel
              authenticated={authenticated}
              analysisPath={analysisId ? savedAnalysisPath(analysisId) : null}
            />
            <div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-action"
              >
                Analyse another
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyzeRoot;
