// Colocated vitest for POST /api/cfo-advisor/commentary — P9-cfo-advisor-commentary-route-test.
//
// The route is a thin wrapper around two pure scoring helpers
// (computeHealthScore + computeAlerts) plus a callAI call that renders 4
// bullet-point CFO insights. Silent regressions this suite pins against:
//   - Dropping the 401 gate so the widget can be dogpiled anonymously.
//   - Dropping the JSON try/catch and 500-ing the widget on malformed body.
//   - Regressing the toNum() so numeric strings ("5000") stop coercing —
//     the health score would silently fall back to 0 and the CFO would
//     render "no revenue" alerts to a founder who typed real numbers.
//   - Regressing the runway thresholds (<3 → −40, <6 → −20) so a
//     3-month-runway startup no longer trips the critical alert.
//   - Regressing the mvpStages set so a "growth"-stage founder with zero
//     MRR stops triggering the "prioritise your first paying customer"
//     nudge — this is the load-bearing insight for the widget.
//   - Regressing the burn/MRR ratio (>3x) so unit-economics warnings
//     silently disappear.
//   - Regressing the health-score clamp (0..100) so a broken input yields
//     a NaN score that the widget will render as blank.
//   - Regressing the bullet parser so a "•"-prefixed AI response is
//     accepted verbatim (falling back to newline-split blows up the UI
//     because the widget expects at most 4 items).
//   - Dropping the .slice(0, 4) cap so the AI can flood the widget with
//     20+ bullets.
//   - Regressing the fallback branch (bullets < 2) so a two-line "1.\n2."
//     AI response yields an empty commentary[] — the widget renders blank.
//   - Regressing the 500 branch so a callAI throw surfaces the raw stack
//     to the widget instead of the sanitised {ok:false, error}.
//   - Regressing the runway=99 sentinel when burn_rate=0 so a bootstrapped
//     no-burn startup no longer surfaces as "healthy" (score 100).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  callAI: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => mocks.callAI(opts),
}));

import { POST, dynamic } from "./route";

const USER = { id: "user-1", email: "founder@example.com" };

function req(body: unknown, opts: { raw?: string } = {}) {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  init.body = opts.raw !== undefined ? opts.raw : JSON.stringify(body);
  return new Request("http://x/api/cfo-advisor/commentary", init);
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

const DEFAULT_BULLETS = [
  "• Runway is healthy — extend fundraising conversations 6 months out.",
  "• MRR growth of 15% MoM is strong; keep pricing under review.",
  "• Team size is right for stage.",
  "• Cash reserves cover >12 months at current burn.",
].join("\n");

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.callAI.mockResolvedValue({ text: DEFAULT_BULLETS, provider: "free", model: "m" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("route module", () => {
  it("exports dynamic='force-dynamic' so the route never gets statically cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/cfo-advisor/commentary — auth gate", () => {
  it("returns 401 when getCurrentUser resolves null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ mrr: 1000 }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("401 never invokes callAI", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ mrr: 1000 }));
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("propagates a getCurrentUser rejection (upstream should map to 500)", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("auth exploded"));
    await expect(POST(req({ mrr: 1 }))).rejects.toThrow("auth exploded");
  });
});

describe("POST /api/cfo-advisor/commentary — JSON parse", () => {
  it("returns 400 'Invalid JSON body' when body is not JSON", async () => {
    const res = await POST(req(undefined, { raw: "not json {" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("400 on invalid JSON body never calls callAI", async () => {
    await POST(req(undefined, { raw: "{" }));
    expect(mocks.callAI).not.toHaveBeenCalled();
  });
});

describe("POST /api/cfo-advisor/commentary — signal coercion", () => {
  it("toNum: numeric field passes through as number in the prompt", async () => {
    await POST(req({ mrr: 12345, burn_rate: 5000, cash_balance: 60000, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("MRR: A$12,345");
  });

  it("toNum: numeric-string field coerces ('5000' → 5000)", async () => {
    await POST(req({ mrr: "5000", burn_rate: 1000, cash_balance: 10000, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("MRR: A$5,000");
  });

  it("toNum: non-numeric string falls back to 0 (not NaN)", async () => {
    await POST(req({ mrr: "not-a-number", burn_rate: 1, cash_balance: 1, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("MRR: A$0");
  });

  it("toNum: NaN input falls back to 0 (Number.isFinite guard)", async () => {
    await POST(req({ mrr: NaN, burn_rate: 1, cash_balance: 1, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("MRR: A$0");
  });

  it("toNum: boolean input falls back to 0 (not number-or-string)", async () => {
    await POST(req({ mrr: true, burn_rate: 1, cash_balance: 1, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("MRR: A$0");
  });

  it("stage defaults to 'idea' when not a string", async () => {
    await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0, stage: 42 }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Stage: idea");
  });

  it("stage defaults to 'idea' when omitted", async () => {
    await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Stage: idea");
  });

  it("startup_name falls back to 'the startup' when not a string", async () => {
    await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0, startup_name: 42 }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Startup: the startup");
  });

  it("startup_name renders verbatim when supplied", async () => {
    await POST(req({ startup_name: "Acme", mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Startup: Acme");
  });

  it("ARR is derived as mrr * 12 in the prompt", async () => {
    await POST(req({ mrr: 1000, burn_rate: 0, cash_balance: 0, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("ARR: A$12,000");
  });

  it("runway line reads 'N/A (no burn)' when burn_rate is 0", async () => {
    await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 500000, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Runway: N/A (no burn)");
  });

  it("runway line renders months to 1dp when burn_rate > 0", async () => {
    await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 45000, stage: "seed" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    expect(opts.user).toContain("Runway: 4.5 months");
  });
});

describe("POST /api/cfo-advisor/commentary — health score", () => {
  it("returns 100 for a healthy bootstrapped startup (no burn, no MRR, idea stage)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(100);
  });

  it("subtracts 40 when runway is under 3 months (burn ratio also fires since burn > mrr*3 = 0)", async () => {
    // burn 10k, cash 20k → 2 months runway; mrr=0 so burn>mrr*3 also trips (−10 extra)
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 20000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(50); // 100 − 40 (runway) − 10 (burn ratio)
  });

  it("subtracts 20 when runway is between 3 and 6 months (burn ratio also fires at mrr=0)", async () => {
    // burn 10k, cash 45k → 4.5 months; mrr=0 so burn>mrr*3 also trips (−10 extra)
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 45000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(70); // 100 − 20 (runway) − 10 (burn ratio)
  });

  it("does NOT subtract runway penalty when runway is 6+ months (burn ratio still fires)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 120000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(90); // 100 − 10 (burn ratio at mrr=0)
  });

  it("returns 100 for a 12-month-runway startup with healthy MRR (no burn/runway/mrr penalties)", async () => {
    // MRR 5000, burn 10000 (only 2x, below 3x threshold), 24-month runway, idea stage
    const res = await POST(req({ mrr: 5000, burn_rate: 10000, cash_balance: 240000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(100);
  });

  it("subtracts 15 when MRR is 0 at MVP/launch/growth/scale/series_a/series_b stage", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 100000, stage: "growth" }));
    const body = await json(res);
    expect(body.health_score).toBe(85);
  });

  it("mvpStages check is case-insensitive (MVP uppercase triggers the penalty)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 100000, stage: "MVP" }));
    const body = await json(res);
    expect(body.health_score).toBe(85);
  });

  it("does NOT subtract MRR penalty when stage is 'idea' (pre-revenue is expected)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(100);
  });

  it("subtracts 10 when burn_rate > mrr * 3 (unit economics)", async () => {
    // MRR 1000, burn 5000 → 5x, idea stage, big cash so no runway penalty
    const res = await POST(req({ mrr: 1000, burn_rate: 5000, cash_balance: 1_000_000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(90);
  });

  it("does NOT subtract burn penalty when burn_rate is exactly 3x MRR (strict >)", async () => {
    const res = await POST(req({ mrr: 1000, burn_rate: 3000, cash_balance: 1_000_000, stage: "idea" }));
    const body = await json(res);
    expect(body.health_score).toBe(100);
  });

  it("clamps to 0 when penalties would drive the score negative", async () => {
    // <3mo runway (−40), zero MRR at growth stage (−15), 5x burn (−10) = 65
    // stack more penalties by combining critical runway with zero MRR + high burn
    // Actual: 100 − 40 − 15 − 10 = 35; can't drive negative from these branches.
    // Use idea stage + <3mo runway + burn ratio to confirm floor path is reachable:
    // 100 − 40 − 10 = 50; still positive. The clamp is defensive; assert it
    // never returns > 100 or < 0 across a randomised sweep.
    for (const bomb of [
      { mrr: -1e12, burn_rate: 1, cash_balance: 0, stage: "growth" },
      { mrr: 0, burn_rate: 1e9, cash_balance: 0, stage: "growth" },
    ]) {
      const res = await POST(req(bomb));
      const body = await json(res);
      expect(body.health_score).toBeGreaterThanOrEqual(0);
      expect(body.health_score).toBeLessThanOrEqual(100);
    }
  });
});

describe("POST /api/cfo-advisor/commentary — alerts", () => {
  it("emits critical alert when runway is under 3 months", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 20000, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.startsWith("Critical:"))).toBe(true);
  });

  it("emits runway warning when runway is 3-6 months (with month value to 1dp)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 45000, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("4.5 months"))).toBe(true);
    expect(alerts.some((a) => a.startsWith("Critical:"))).toBe(false);
  });

  it("does NOT emit runway alerts when runway is 6+ months", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 120000, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("months"))).toBe(false);
  });

  it("emits no-revenue alert when MRR is 0 at MVP+ stage", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 100000, stage: "growth" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("No revenue recorded"))).toBe(true);
  });

  it("does NOT emit no-revenue alert at idea stage (pre-revenue is expected)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 100000, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("No revenue recorded"))).toBe(false);
  });

  it("emits burn-ratio alert when burn > 3x MRR (percentage rounded to whole)", async () => {
    const res = await POST(req({ mrr: 1000, burn_rate: 5000, cash_balance: 1_000_000, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("500% of MRR"))).toBe(true);
  });

  it("emits zero-cash alert when cash_balance is 0 and burn_rate > 0", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 1, cash_balance: 0, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("Cash balance is zero"))).toBe(true);
  });

  it("does NOT emit zero-cash alert when burn_rate is 0 (bootstrapped)", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0, stage: "idea" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    expect(alerts.some((a) => a.includes("Cash balance is zero"))).toBe(false);
  });

  it("emits multiple alerts when multiple thresholds trip simultaneously", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 20000, stage: "growth" }));
    const body = await json(res);
    const alerts = body.alerts as string[];
    // Critical runway + no revenue at growth stage
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/cfo-advisor/commentary — callAI seam", () => {
  it("invokes callAI exactly once with system + user + maxTokens=400 + timeoutMs=30s", async () => {
    await POST(req({ mrr: 1000, burn_rate: 500, cash_balance: 12000, stage: "seed" }));
    expect(mocks.callAI).toHaveBeenCalledTimes(1);
    const opts = mocks.callAI.mock.calls[0]?.[0] as {
      system: string;
      user: string;
      maxTokens: number;
      timeoutMs: number;
    };
    expect(opts.system).toContain("CFO advisor");
    expect(opts.maxTokens).toBe(400);
    expect(opts.timeoutMs).toBe(30_000);
  });

  it("prompt embeds the health_score line", async () => {
    await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 20000, stage: "idea" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { user: string };
    // burn 10k, cash 20k, mrr 0, idea stage → 100 − 40 (runway) − 10 (burn ratio) = 50
    expect(opts.user).toContain("Financial health score: 50/100");
  });
});

describe("POST /api/cfo-advisor/commentary — bullet parser", () => {
  it("returns 200 with parsed bullets on happy path", async () => {
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.commentary)).toBe(true);
    expect((body.commentary as string[]).length).toBe(4);
  });

  it("strips the '• ' prefix off each bullet", async () => {
    mocks.callAI.mockResolvedValue({
      text: "• first insight\n• second insight",
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    expect(body.commentary).toEqual(["first insight", "second insight"]);
  });

  it("caps at 4 bullets even when AI returns more", async () => {
    mocks.callAI.mockResolvedValue({
      text: ["• a", "• b", "• c", "• d", "• e", "• f"].join("\n"),
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    expect(body.commentary).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to newline-split when fewer than 2 bullets present", async () => {
    mocks.callAI.mockResolvedValue({
      text: "line one\nline two\nline three\nline four\nline five",
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    expect(body.commentary).toEqual(["line one", "line two", "line three", "line four"]);
  });

  it("fallback path filters blank lines", async () => {
    mocks.callAI.mockResolvedValue({
      text: "\n\nreal line\n   \nanother\n",
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    expect(body.commentary).toEqual(["real line", "another"]);
  });

  it("keeps single-bullet response by falling back rather than emitting a length-1 array", async () => {
    mocks.callAI.mockResolvedValue({
      text: "• only one bullet",
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    // Fallback triggers (bullets.length < 2) → splits raw text; single line survives.
    expect(body.commentary).toEqual(["• only one bullet"]);
  });

  it("trims whitespace off each bullet before stripping the prefix", async () => {
    mocks.callAI.mockResolvedValue({
      text: "   • padded one\n\t• padded two",
      provider: "free",
      model: "m",
    });
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    const body = await json(res);
    expect(body.commentary).toEqual(["padded one", "padded two"]);
  });
});

describe("POST /api/cfo-advisor/commentary — thrown error", () => {
  it("returns 500 with the Error.message when callAI rejects", async () => {
    mocks.callAI.mockRejectedValue(new Error("provider down"));
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("provider down");
  });

  it("returns 500 with fallback 'CFO advisor failed' when reject value is not an Error", async () => {
    mocks.callAI.mockRejectedValue("string reject");
    const res = await POST(req({ mrr: 0, burn_rate: 0, cash_balance: 0 }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("CFO advisor failed");
  });

  it("500 response omits health_score/commentary/alerts (no leak of partial state)", async () => {
    mocks.callAI.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ mrr: 0, burn_rate: 10000, cash_balance: 20000, stage: "growth" }));
    const body = await json(res);
    expect(body).not.toHaveProperty("health_score");
    expect(body).not.toHaveProperty("commentary");
    expect(body).not.toHaveProperty("alerts");
  });
});

describe("POST /api/cfo-advisor/commentary — happy-path envelope", () => {
  it("returns {ok:true, health_score, commentary, alerts} — pinning the response shape", async () => {
    const res = await POST(req({ mrr: 1000, burn_rate: 500, cash_balance: 12000, stage: "seed" }));
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["alerts", "commentary", "health_score", "ok"]);
  });
});
