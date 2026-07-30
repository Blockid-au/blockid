// Colocated vitest for the browser-side sessionStorage bridge.
//
// The pure `readPendingPayload` / `clearPendingPayload` / `save*State` helpers
// mirror the free-tool inputs onto predictable SS keys so the Founder-Pack
// modal can lift them into the pending magic-link payload. All branches must
// be SSR-safe (no `window`) and must swallow storage errors — the pinned
// contract callers rely on.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IdeaValuationInput } from "@/lib/idea-valuation";
import type { FounderInput, EquitySettings } from "@/lib/equity-split";
import type { FundingPlanInput } from "@/lib/funding-plan";
import {
  PACK_SS_KEYS,
  saveIdeaEvalState,
  saveEquitySplitState,
  saveFundingPlanState,
  readPendingPayload,
  clearPendingPayload,
} from "./session-state";

interface FakeStorage {
  store: Map<string, string>;
  fail: { get: boolean; set: boolean; remove: boolean };
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function makeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    fail: { get: false, set: false, remove: false },
    getItem(key) {
      if (this.fail.get) throw new Error("get boom");
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key, value) {
      if (this.fail.set) throw new Error("set boom");
      store.set(key, value);
    },
    removeItem(key) {
      if (this.fail.remove) throw new Error("remove boom");
      store.delete(key);
    },
  };
}

function installWindow(storage: FakeStorage): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = { sessionStorage: storage };
}

function uninstallWindow(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
}

const ideaInputs = {
  tamAud: 1_000_000,
  problemSeverity: 4,
  founderStrength: 3,
  solutionMaturity: 2,
  moatStrength: 3,
  competitionDensity: 4,
} as unknown as IdeaValuationInput;

const founders = [
  { id: "f1", name: "Alice", cashAud: 10000, sweatMonths: 12 },
  { id: "f2", name: "Bob", cashAud: 0, sweatMonths: 12 },
] as unknown as FounderInput[];

const equitySettings = {
  esopEnabled: true,
  esopPct: 10,
  firstHirePct: 2,
} as unknown as EquitySettings;

const fundingInputs = {
  cofounderCount: 2,
  monthlyWageAud: 6000,
  sweatFirstSixMonths: true,
  monthlyToolsAud: 500,
  monthlyMarketingAud: 500,
  legalOneOffAud: 2000,
  bufferPct: 15,
  runwayMonths: 12,
} as unknown as FundingPlanInput;

let storage: FakeStorage;

beforeEach(() => {
  storage = makeStorage();
  installWindow(storage);
});

afterEach(() => {
  uninstallWindow();
});

// ─── PACK_SS_KEYS shape ────────────────────────────────────────────────

describe("PACK_SS_KEYS", () => {
  it("exposes the 5 canonical namespaced keys used by the free tools", () => {
    expect(PACK_SS_KEYS).toEqual({
      ideaEvalInputs: "blockid:idea-eval:inputs",
      ideaEvalName: "blockid:idea-eval:idea-name",
      equityFounders: "blockid:equity-split:founders",
      equitySettings: "blockid:equity-split:settings",
      fundingInputs: "blockid:funding-plan:inputs",
    });
  });
});

// ─── SSR safety ────────────────────────────────────────────────────────

describe("SSR safety (no window)", () => {
  beforeEach(() => {
    uninstallWindow();
  });

  it("readPendingPayload returns an empty status envelope", () => {
    const status = readPendingPayload();
    expect(status).toEqual({
      payload: {},
      hasIdeaEval: false,
      hasEquitySplit: false,
      hasFundingPlan: false,
      filledCount: 0,
    });
  });

  it("save*State + clearPendingPayload do not throw", () => {
    expect(() => saveIdeaEvalState(ideaInputs, "MyCo")).not.toThrow();
    expect(() => saveEquitySplitState(founders, equitySettings)).not.toThrow();
    expect(() => saveFundingPlanState(fundingInputs)).not.toThrow();
    expect(() => clearPendingPayload()).not.toThrow();
  });
});

// ─── saveIdeaEvalState ─────────────────────────────────────────────────

describe("saveIdeaEvalState", () => {
  it("writes JSON inputs and raw idea-name to their SS keys", () => {
    saveIdeaEvalState(ideaInputs, "Acme");
    expect(storage.store.get(PACK_SS_KEYS.ideaEvalInputs)).toBe(JSON.stringify(ideaInputs));
    // ideaName is written raw (not JSON) so the modal can read it as a plain string.
    expect(storage.store.get(PACK_SS_KEYS.ideaEvalName)).toBe("Acme");
  });

  it("removes the idea-name key when the name is null", () => {
    storage.store.set(PACK_SS_KEYS.ideaEvalName, "stale");
    saveIdeaEvalState(ideaInputs, null);
    expect(storage.store.has(PACK_SS_KEYS.ideaEvalName)).toBe(false);
  });

  it("removes the idea-name key when the name is an empty string", () => {
    storage.store.set(PACK_SS_KEYS.ideaEvalName, "stale");
    saveIdeaEvalState(ideaInputs, "");
    expect(storage.store.has(PACK_SS_KEYS.ideaEvalName)).toBe(false);
  });

  it("removes the idea-name key when the name is omitted (undefined)", () => {
    storage.store.set(PACK_SS_KEYS.ideaEvalName, "stale");
    saveIdeaEvalState(ideaInputs);
    expect(storage.store.has(PACK_SS_KEYS.ideaEvalName)).toBe(false);
  });

  it("swallows sessionStorage.setItem failures", () => {
    storage.fail.set = true;
    expect(() => saveIdeaEvalState(ideaInputs, "Acme")).not.toThrow();
    expect(storage.store.size).toBe(0);
  });
});

// ─── saveEquitySplitState ──────────────────────────────────────────────

describe("saveEquitySplitState", () => {
  it("writes founders array + settings object as JSON", () => {
    saveEquitySplitState(founders, equitySettings);
    expect(JSON.parse(storage.store.get(PACK_SS_KEYS.equityFounders) as string)).toEqual(founders);
    expect(JSON.parse(storage.store.get(PACK_SS_KEYS.equitySettings) as string)).toEqual(equitySettings);
  });

  it("still writes when the founders array is empty (matches free-tool state shape)", () => {
    saveEquitySplitState([] as unknown as FounderInput[], equitySettings);
    expect(storage.store.get(PACK_SS_KEYS.equityFounders)).toBe("[]");
  });
});

// ─── saveFundingPlanState ──────────────────────────────────────────────

describe("saveFundingPlanState", () => {
  it("writes funding inputs as JSON", () => {
    saveFundingPlanState(fundingInputs);
    expect(JSON.parse(storage.store.get(PACK_SS_KEYS.fundingInputs) as string)).toEqual(fundingInputs);
  });
});

// ─── readPendingPayload ────────────────────────────────────────────────

describe("readPendingPayload", () => {
  it("returns an empty envelope on a clean storage", () => {
    const status = readPendingPayload();
    expect(status.payload).toEqual({});
    expect(status.hasIdeaEval).toBe(false);
    expect(status.hasEquitySplit).toBe(false);
    expect(status.hasFundingPlan).toBe(false);
    expect(status.filledCount).toBe(0);
  });

  it("surfaces ideaEval with ideaName when both are set", () => {
    saveIdeaEvalState(ideaInputs, "Acme");
    const status = readPendingPayload();
    expect(status.hasIdeaEval).toBe(true);
    expect(status.payload.ideaEval).toEqual({ inputs: ideaInputs, ideaName: "Acme" });
    expect(status.filledCount).toBe(1);
  });

  it("surfaces ideaEval WITHOUT ideaName when only inputs are set", () => {
    saveIdeaEvalState(ideaInputs);
    const status = readPendingPayload();
    expect(status.hasIdeaEval).toBe(true);
    expect(status.payload.ideaEval).toEqual({ inputs: ideaInputs });
    expect(status.payload.ideaEval).not.toHaveProperty("ideaName");
  });

  it("surfaces equitySplit when both founders (non-empty) + settings are set", () => {
    saveEquitySplitState(founders, equitySettings);
    const status = readPendingPayload();
    expect(status.hasEquitySplit).toBe(true);
    expect(status.payload.equitySplit).toEqual({ founders, settings: equitySettings });
  });

  it("does NOT surface equitySplit when founders array is empty (guard)", () => {
    // Empty array is falsy for the modal's "worth lifting" test.
    storage.store.set(PACK_SS_KEYS.equityFounders, "[]");
    storage.store.set(PACK_SS_KEYS.equitySettings, JSON.stringify(equitySettings));
    const status = readPendingPayload();
    expect(status.hasEquitySplit).toBe(false);
    expect(status.payload.equitySplit).toBeUndefined();
  });

  it("does NOT surface equitySplit when founders JSON is a non-array (guard)", () => {
    storage.store.set(PACK_SS_KEYS.equityFounders, JSON.stringify({ not: "an array" }));
    storage.store.set(PACK_SS_KEYS.equitySettings, JSON.stringify(equitySettings));
    const status = readPendingPayload();
    expect(status.hasEquitySplit).toBe(false);
  });

  it("does NOT surface equitySplit when settings are missing", () => {
    saveEquitySplitState(founders, equitySettings);
    storage.store.delete(PACK_SS_KEYS.equitySettings);
    const status = readPendingPayload();
    expect(status.hasEquitySplit).toBe(false);
  });

  it("surfaces fundingPlan when inputs are set", () => {
    saveFundingPlanState(fundingInputs);
    const status = readPendingPayload();
    expect(status.hasFundingPlan).toBe(true);
    expect(status.payload.fundingPlan).toEqual({ inputs: fundingInputs });
    expect(status.filledCount).toBe(1);
  });

  it("filledCount reaches 3 when every tool has been touched", () => {
    saveIdeaEvalState(ideaInputs, "Acme");
    saveEquitySplitState(founders, equitySettings);
    saveFundingPlanState(fundingInputs);
    const status = readPendingPayload();
    expect(status.filledCount).toBe(3);
    expect(status.hasIdeaEval && status.hasEquitySplit && status.hasFundingPlan).toBe(true);
  });

  it("treats a corrupt JSON blob as absent instead of throwing", () => {
    storage.store.set(PACK_SS_KEYS.ideaEvalInputs, "not-json {");
    storage.store.set(PACK_SS_KEYS.fundingInputs, JSON.stringify(fundingInputs));
    const status = readPendingPayload();
    expect(status.hasIdeaEval).toBe(false);
    expect(status.hasFundingPlan).toBe(true);
    expect(status.filledCount).toBe(1);
  });

  it("swallows sessionStorage.getItem failures and returns an empty envelope", () => {
    storage.fail.get = true;
    const status = readPendingPayload();
    expect(status).toEqual({
      payload: {},
      hasIdeaEval: false,
      hasEquitySplit: false,
      hasFundingPlan: false,
      filledCount: 0,
    });
  });
});

// ─── clearPendingPayload ───────────────────────────────────────────────

describe("clearPendingPayload", () => {
  it("removes every PACK_SS_KEY without touching foreign keys", () => {
    saveIdeaEvalState(ideaInputs, "Acme");
    saveEquitySplitState(founders, equitySettings);
    saveFundingPlanState(fundingInputs);
    storage.store.set("unrelated:key", "keep-me");

    clearPendingPayload();

    for (const key of Object.values(PACK_SS_KEYS)) {
      expect(storage.store.has(key)).toBe(false);
    }
    expect(storage.store.get("unrelated:key")).toBe("keep-me");
  });

  it("swallows sessionStorage.removeItem failures", () => {
    saveIdeaEvalState(ideaInputs, "Acme");
    storage.fail.remove = true;
    expect(() => clearPendingPayload()).not.toThrow();
  });
});
