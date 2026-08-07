// Colocated vitest for POST /api/cap-table/health — P9-cap-table-health-route-test.
//
// The route is the "grade my cap table" endpoint that powers the founder's
// cap-table health dial + ASIC nudge tile referenced from the /cap-table
// dashboard and the P6_ausindustry_esic_gates work in
// docs/plans/atlassian-standard-mapping-goal.md. It ingests founder-supplied
// ownership percentages + vesting + shareholder count, walks four
// independent scoring rubrics, and returns { score, issues, recommendations }.
//
// Silent regressions this suite pins against:
//
//   - Dropping the `gateRequireFeature("share_management")` call so a free
//     tier founder can grade their cap table (paywall leak) — or flipping
//     the feature key so the gate always passes / always fails.
//   - Re-deriving auth or the 402 response shape locally instead of
//     returning `gate.response` verbatim — that lets a bypass ship because
//     the client never receives the `feature: "share_management"` hint the
//     upgrade CTA depends on.
//   - Losing the JSON-parse `catch` so a malformed body 500s instead of
//     returning the documented `{ error: "Invalid JSON body" }` at 400.
//   - Regressing the founder-dilution boundary (<40 → red, ≤60 → amber,
//     else green): flipping to `<=40` would silently downgrade a founder
//     sitting on exactly 40% into the "critically diluted" bucket and
//     spook them into unnecessary recapitalisation.
//   - Regressing the score deltas (-30 red / -10 amber founder,
//     -15 no cliff, -15 small pool, -20 ASIC breach, -5 ASIC approach,
//     -25 sum>100.5) — the /cap-table dial reads the score number directly.
//   - Regressing the option-pool fallback so `optionPoolPct` no longer
//     overrides `employeeOptionsPct` — the pool grade would always read
//     the employee options % and misgrade founders who track their pool
//     separately.
//   - Dropping the `shareholderCount != null` guard so an omitted count
//     is coerced to 0 and the "approaching ASIC" branch never fires.
//   - Regressing the sum-check tolerance from 100.5 to 100 so rounding
//     noise (99.9 + 0.1 + 0.1 = 100.1) trips the red flag on every save.
//   - Losing the score clamp so a founder with every red flag receives a
//     negative score and the dial renders NaN%.
//   - Regressing the `recommendations` filter so green "keep doing this"
//     bullets bleed into the "things to fix" tile.
//   - Losing `export const dynamic = "force-dynamic"` so a build-time
//     cache pins the score across founders / body payloads.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  gateRequireFeatureMock: vi.fn(),
}));

vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => mocks.gateRequireFeatureMock(feature),
}));

// Route import must come AFTER every vi.mock above.
import { POST, dynamic } from "./route";

// --- Helpers --------------------------------------------------------------

function gateOk(): { ok: true; user: { id: string; email: string }; uwp: unknown } {
  return {
    ok: true,
    user: { id: "u-1", email: "f@x.com" },
    uwp: { id: "u-1", plan: "growth", segment: "founder" },
  };
}

function gateFail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return {
    ok: false as const,
    response: NextResponse.json({ ok: false, error, ...extra }, { status }),
  };
}

function jsonPost(body: unknown): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/cap-table/health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
}

interface HealthIssue {
  severity: "red" | "amber" | "green";
  code: string;
  message: string;
  recommendation: string;
}

interface HealthBody {
  score: number;
  issues: HealthIssue[];
  recommendations: string[];
}

async function invoke(body: unknown): Promise<{ status: number; body: HealthBody }> {
  const res = await POST(jsonPost(body));
  return { status: res.status, body: (await res.json()) as HealthBody };
}

function codes(issues: HealthIssue[]): string[] {
  return issues.map((i) => i.code);
}

function findIssue(issues: HealthIssue[], code: string): HealthIssue | undefined {
  return issues.find((i) => i.code === code);
}

// --- Fixtures -------------------------------------------------------------

beforeEach(() => {
  mocks.gateRequireFeatureMock.mockReset();
  mocks.gateRequireFeatureMock.mockResolvedValue(gateOk());
});

// --------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — cap-table grade must never be pinned to a build-time cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("feature gate", () => {
  it("calls gateRequireFeature('share_management') on every POST", async () => {
    await invoke({ founderPct: 70, employeeOptionsPct: 10 });
    expect(mocks.gateRequireFeatureMock).toHaveBeenCalledTimes(1);
    expect(mocks.gateRequireFeatureMock).toHaveBeenCalledWith("share_management");
  });

  it("returns the gate's 401 response verbatim when the founder is unauthenticated", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(
      gateFail(401, "Authentication required"),
    );
    const res = await POST(jsonPost({ founderPct: 70 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
  });

  it("returns the gate's 402 response verbatim when the feature is locked (paywall)", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(
      gateFail(402, "feature_locked", { feature: "share_management" }),
    );
    const res = await POST(jsonPost({ founderPct: 70 }));
    expect(res.status).toBe(402);
    // The `feature` key is load-bearing for the upgrade-CTA redirect.
    expect(await res.json()).toEqual({
      ok: false,
      error: "feature_locked",
      feature: "share_management",
    });
  });

  it("does not process the body when the gate fails (never grades a locked account)", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateFail(402, "feature_locked"));
    // Malformed body would 400 if the parse ran — the gate must bail out first.
    const res = await POST(jsonPost("not json"));
    expect(res.status).toBe(402);
  });
});

// --------------------------------------------------------------------------
describe("body parsing", () => {
  it("returns 400 with the documented shape when the JSON body is malformed", async () => {
    const res = await POST(jsonPost("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("accepts an empty object body and defaults every percentage to 0", async () => {
    const { status, body } = await invoke({});
    expect(status).toBe(200);
    // 0% founder → red -30, 0% pool → amber -15, no cliff/shareholder → no penalty
    expect(findIssue(body.issues, "founder_dilution_high")).toBeDefined();
    expect(findIssue(body.issues, "option_pool_small")).toBeDefined();
  });
});

// --------------------------------------------------------------------------
describe("founder dilution rubric", () => {
  it("flags founder <40% as red 'critically diluted' with a -30 penalty", async () => {
    const { body } = await invoke({ founderPct: 25, employeeOptionsPct: 12 });
    const issue = findIssue(body.issues, "founder_dilution_high");
    expect(issue?.severity).toBe("red");
    expect(issue?.message).toContain("25.0%");
    // baseline 100 - 30 red founder = 70 (pool 12% is green, no other penalties)
    expect(body.score).toBe(70);
  });

  it("flags founder in [40, 60] as amber 'watch for dilution' with a -10 penalty", async () => {
    const { body } = await invoke({ founderPct: 55, employeeOptionsPct: 12 });
    const issue = findIssue(body.issues, "founder_dilution_moderate");
    expect(issue?.severity).toBe("amber");
    // 100 - 10 amber = 90
    expect(body.score).toBe(90);
  });

  it("treats founder EXACTLY 40% as amber (boundary: <40 is red)", async () => {
    const { body } = await invoke({ founderPct: 40, employeeOptionsPct: 12 });
    expect(findIssue(body.issues, "founder_dilution_moderate")).toBeDefined();
    expect(findIssue(body.issues, "founder_dilution_high")).toBeUndefined();
  });

  it("treats founder EXACTLY 60% as amber (boundary: ≤60 is amber, >60 is green)", async () => {
    const { body } = await invoke({ founderPct: 60, employeeOptionsPct: 12 });
    expect(findIssue(body.issues, "founder_dilution_moderate")).toBeDefined();
    expect(findIssue(body.issues, "founder_dilution_ok")).toBeUndefined();
  });

  it("marks founder >60% as green 'healthy' with no penalty", async () => {
    const { body } = await invoke({ founderPct: 75, employeeOptionsPct: 12 });
    const issue = findIssue(body.issues, "founder_dilution_ok");
    expect(issue?.severity).toBe("green");
    // Pool 12% green as well → full 100
    expect(body.score).toBe(100);
  });
});

// --------------------------------------------------------------------------
describe("vesting-cliff rubric", () => {
  it("flags hasVestingCliff=false as amber with a -15 penalty", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      hasVestingCliff: false,
    });
    const issue = findIssue(body.issues, "no_vesting_cliff");
    expect(issue?.severity).toBe("amber");
    // 100 - 15 = 85
    expect(body.score).toBe(85);
  });

  it("marks hasVestingCliff=true as green with no penalty", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      hasVestingCliff: true,
    });
    expect(findIssue(body.issues, "vesting_cliff_ok")?.severity).toBe("green");
    expect(body.score).toBe(100);
  });

  it("omits any vesting_cliff issue when hasVestingCliff is undefined", async () => {
    const { body } = await invoke({ founderPct: 70, employeeOptionsPct: 12 });
    expect(findIssue(body.issues, "no_vesting_cliff")).toBeUndefined();
    expect(findIssue(body.issues, "vesting_cliff_ok")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
describe("option-pool rubric", () => {
  it("uses optionPoolPct in preference to employeeOptionsPct when both are supplied", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 4, // would trip amber if used
      optionPoolPct: 15, // green — pool takes precedence
    });
    expect(findIssue(body.issues, "option_pool_ok")?.severity).toBe("green");
    expect(findIssue(body.issues, "option_pool_small")).toBeUndefined();
  });

  it("falls back to employeeOptionsPct when optionPoolPct is omitted", async () => {
    const { body } = await invoke({ founderPct: 70, employeeOptionsPct: 4 });
    const issue = findIssue(body.issues, "option_pool_small");
    expect(issue?.severity).toBe("amber");
    expect(issue?.message).toContain("4.0%");
  });

  it("flags pool <10% as amber with a -15 penalty", async () => {
    const { body } = await invoke({ founderPct: 70, optionPoolPct: 5 });
    expect(findIssue(body.issues, "option_pool_small")?.severity).toBe("amber");
    expect(body.score).toBe(85);
  });

  it("marks pool ≥10% as green with no penalty (boundary: 10 is green)", async () => {
    const { body } = await invoke({ founderPct: 70, optionPoolPct: 10 });
    expect(findIssue(body.issues, "option_pool_ok")?.severity).toBe("green");
    expect(body.score).toBe(100);
  });
});

// --------------------------------------------------------------------------
describe("ASIC shareholder-threshold rubric", () => {
  it("flags shareholderCount >50 as red with a -20 penalty and cites the threshold", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      shareholderCount: 75,
    });
    const issue = findIssue(body.issues, "asic_reporting_threshold");
    expect(issue?.severity).toBe("red");
    expect(issue?.message).toContain("75 shareholders");
    expect(issue?.recommendation).toContain("ASIC");
    // 100 - 20 = 80
    expect(body.score).toBe(80);
  });

  it("flags shareholderCount in (40, 50] as amber 'approaching threshold' with a -5 penalty", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      shareholderCount: 45,
    });
    expect(findIssue(body.issues, "asic_approaching_threshold")?.severity).toBe("amber");
    expect(body.score).toBe(95);
  });

  it("marks shareholderCount EXACTLY 50 as amber (boundary: >50 is red)", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      shareholderCount: 50,
    });
    expect(findIssue(body.issues, "asic_approaching_threshold")).toBeDefined();
    expect(findIssue(body.issues, "asic_reporting_threshold")).toBeUndefined();
  });

  it("marks shareholderCount EXACTLY 40 as no-issue (boundary: >40 is amber)", async () => {
    const { body } = await invoke({
      founderPct: 70,
      employeeOptionsPct: 12,
      shareholderCount: 40,
    });
    expect(findIssue(body.issues, "asic_approaching_threshold")).toBeUndefined();
    expect(findIssue(body.issues, "asic_reporting_threshold")).toBeUndefined();
  });

  it("emits no ASIC issue when shareholderCount is omitted (undefined ≠ 0)", async () => {
    const { body } = await invoke({ founderPct: 70, employeeOptionsPct: 12 });
    expect(codes(body.issues).some((c) => c.startsWith("asic_"))).toBe(false);
  });
});

// --------------------------------------------------------------------------
describe("percentages-sum sanity check", () => {
  it("flags sum >100.5 as red with a -25 penalty", async () => {
    const { body } = await invoke({
      founderPct: 80,
      investorPct: 20,
      employeeOptionsPct: 10, // total 110
    });
    const issue = findIssue(body.issues, "percentages_exceed_100");
    expect(issue?.severity).toBe("red");
    expect(issue?.message).toContain("110.0%");
    // 100 - 25 sum = 75 (founder 80 green, pool 10 green, no cliff/shareholder)
    expect(body.score).toBe(75);
  });

  it("tolerates rounding noise up to +0.5% (100.5 is NOT flagged)", async () => {
    const { body } = await invoke({
      founderPct: 70,
      investorPct: 20.3,
      employeeOptionsPct: 10.2, // 100.5 exactly
    });
    expect(findIssue(body.issues, "percentages_exceed_100")).toBeUndefined();
  });

  it("does NOT flag a sum below 100 (under-allocation is a data-entry choice, not an error)", async () => {
    const { body } = await invoke({
      founderPct: 60,
      investorPct: 10,
      employeeOptionsPct: 10, // total 80
    });
    expect(findIssue(body.issues, "percentages_exceed_100")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
describe("score aggregation", () => {
  it("clamps a worst-case score at 0 (never returns a negative number)", async () => {
    const { body } = await invoke({
      founderPct: 10, // -30
      investorPct: 60,
      employeeOptionsPct: 40, // total 110 → -25
      optionPoolPct: 2, // -15
      hasVestingCliff: false, // -15
      shareholderCount: 200, // -20
    });
    // baseline 100 - 30 - 25 - 15 - 15 - 20 = -5 → clamped to 0
    expect(body.score).toBe(0);
  });

  it("clamps the best-case score at 100 (returns 100 when every rubric is green)", async () => {
    const { body } = await invoke({
      founderPct: 80,
      employeeOptionsPct: 15,
      hasVestingCliff: true,
      shareholderCount: 20,
    });
    expect(body.score).toBe(100);
  });

  it("stacks penalties additively across independent rubrics", async () => {
    const { body } = await invoke({
      founderPct: 55, // amber -10
      employeeOptionsPct: 5, // amber -15
      hasVestingCliff: false, // amber -15
      shareholderCount: 42, // amber -5
    });
    // 100 - 10 - 15 - 15 - 5 = 55
    expect(body.score).toBe(55);
  });
});

// --------------------------------------------------------------------------
describe("recommendations projection", () => {
  it("excludes green issues from the recommendations tile", async () => {
    const { body } = await invoke({ founderPct: 80, employeeOptionsPct: 15 });
    // All rubrics green → recommendations empty
    expect(body.recommendations).toEqual([]);
    // …but the green issues still appear in the full issues array so the
    // dial can render the "healthy" chips.
    expect(codes(body.issues)).toContain("founder_dilution_ok");
    expect(codes(body.issues)).toContain("option_pool_ok");
  });

  it("surfaces every non-green issue's recommendation string, in insertion order", async () => {
    const { body } = await invoke({
      founderPct: 30, // red
      employeeOptionsPct: 5, // amber
      hasVestingCliff: false, // amber (inserted between pool and shareholder)
      shareholderCount: 75, // red
    });
    // Handler inserts issues in this fixed order: founder, cliff, pool, ASIC.
    const nonGreenCodes = body.issues
      .filter((i) => i.severity !== "green")
      .map((i) => i.code);
    expect(nonGreenCodes).toEqual([
      "founder_dilution_high",
      "no_vesting_cliff",
      "option_pool_small",
      "asic_reporting_threshold",
    ]);
    expect(body.recommendations).toEqual(
      nonGreenCodes.map((code) => findIssue(body.issues, code)!.recommendation),
    );
  });
});

// --------------------------------------------------------------------------
describe("response envelope", () => {
  it("returns exactly the three-key { score, issues, recommendations } shape", async () => {
    const { status, body } = await invoke({ founderPct: 70, employeeOptionsPct: 12 });
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["issues", "recommendations", "score"]);
  });

  it("every issue carries {severity, code, message, recommendation}", async () => {
    const { body } = await invoke({
      founderPct: 55,
      employeeOptionsPct: 5,
      hasVestingCliff: false,
      shareholderCount: 51,
    });
    for (const issue of body.issues) {
      expect(issue).toEqual(
        expect.objectContaining({
          severity: expect.stringMatching(/^(red|amber|green)$/),
          code: expect.any(String),
          message: expect.any(String),
          recommendation: expect.any(String),
        }),
      );
    }
  });
});
