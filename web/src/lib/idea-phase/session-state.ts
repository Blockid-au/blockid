// Browser-side sessionStorage bridge for the idea-phase tools.
//
// The 4 free tools (idea-valuation, equity-split, funding-plan, cofounder-
// match) each maintain their own React state. To support the "Save my
// Founder Pack" modal — which can be opened from anywhere on the site — we
// mirror the typed input shape of the first three to predictable SS keys
// on every state change. The modal reads them all when assembling the
// pendingPayload that ships to /api/auth/request.
//
// Cofounder-match writes to Supabase directly (separate concern; not
// captured here).
//
// Defensive everywhere: every read/write swallows storage errors, returns
// null on bad JSON, and tolerates SSR (no `window`).

import type { IdeaValuationInput } from "@/lib/idea-valuation";
import type { FounderInput, EquitySettings } from "@/lib/equity-split";
import type { FundingPlanInput } from "@/lib/funding-plan";

export const PACK_SS_KEYS = {
  ideaEvalInputs: "blockid:idea-eval:inputs",
  ideaEvalName: "blockid:idea-eval:idea-name",
  equityFounders: "blockid:equity-split:founders",
  equitySettings: "blockid:equity-split:settings",
  fundingInputs: "blockid:funding-plan:inputs",
} as const;

function safeWrite(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded, private mode, etc. Ignore — the tool still works.
  }
}

function safeWriteString(key: string, value: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (value && value.length > 0) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore.
  }
}

function safeRead<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeReadString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Per-tool save helpers. Tools call these inside a useEffect on input change.
// -----------------------------------------------------------------------------

export function saveIdeaEvalState(
  inputs: IdeaValuationInput,
  ideaName?: string | null,
): void {
  safeWrite(PACK_SS_KEYS.ideaEvalInputs, inputs);
  safeWriteString(PACK_SS_KEYS.ideaEvalName, ideaName ?? null);
}

export function saveEquitySplitState(
  founders: FounderInput[],
  settings: EquitySettings,
): void {
  safeWrite(PACK_SS_KEYS.equityFounders, founders);
  safeWrite(PACK_SS_KEYS.equitySettings, settings);
}

export function saveFundingPlanState(inputs: FundingPlanInput): void {
  safeWrite(PACK_SS_KEYS.fundingInputs, inputs);
}

// -----------------------------------------------------------------------------
// Pending-payload assembly. Mirrors the PendingPayload type from src/lib/auth.ts
// (kept structural here so this module stays browser-safe and doesn't drag in
// `server-only`).
// -----------------------------------------------------------------------------

export interface PendingPackPayload {
  ideaEval?: { inputs: IdeaValuationInput; ideaName?: string };
  equitySplit?: { founders: FounderInput[]; settings: EquitySettings };
  fundingPlan?: { inputs: FundingPlanInput };
}

export interface PendingPayloadStatus {
  payload: PendingPackPayload;
  hasIdeaEval: boolean;
  hasEquitySplit: boolean;
  hasFundingPlan: boolean;
  filledCount: number;
}

export function readPendingPayload(): PendingPayloadStatus {
  const ideaInputs = safeRead<IdeaValuationInput>(PACK_SS_KEYS.ideaEvalInputs);
  const ideaName = safeReadString(PACK_SS_KEYS.ideaEvalName);
  const eqFounders = safeRead<FounderInput[]>(PACK_SS_KEYS.equityFounders);
  const eqSettings = safeRead<EquitySettings>(PACK_SS_KEYS.equitySettings);
  const fpInputs = safeRead<FundingPlanInput>(PACK_SS_KEYS.fundingInputs);

  const payload: PendingPackPayload = {};
  if (ideaInputs) {
    payload.ideaEval = ideaName
      ? { inputs: ideaInputs, ideaName }
      : { inputs: ideaInputs };
  }
  if (eqFounders && Array.isArray(eqFounders) && eqFounders.length > 0 && eqSettings) {
    payload.equitySplit = { founders: eqFounders, settings: eqSettings };
  }
  if (fpInputs) {
    payload.fundingPlan = { inputs: fpInputs };
  }

  const hasIdeaEval = !!payload.ideaEval;
  const hasEquitySplit = !!payload.equitySplit;
  const hasFundingPlan = !!payload.fundingPlan;
  const filledCount =
    Number(hasIdeaEval) + Number(hasEquitySplit) + Number(hasFundingPlan);

  return {
    payload,
    hasIdeaEval,
    hasEquitySplit,
    hasFundingPlan,
    filledCount,
  };
}

// -----------------------------------------------------------------------------
// Clear — called after a successful magic-link send so the next session
// starts clean (the server already has the payload).
// -----------------------------------------------------------------------------

export function clearPendingPayload(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.values(PACK_SS_KEYS)) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore.
  }
}
