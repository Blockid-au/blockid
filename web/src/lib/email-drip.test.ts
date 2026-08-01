import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the server-only onboarding drip + NPS pulse
// orchestrator (`web/src/lib/email-drip.ts`) — the module `/api/svi` calls
// on first-report to arm the 5-touch sequence and `/api/cron/email-drip`
// polls each minute to send. Silent regressions here are load-bearing:
//   * losing the `.toLowerCase().trim()` on the incoming email would mis-key
//     the 7-day dedupe against the DB row (which is lowercased on insert)
//     and re-arm the whole sequence on every re-analysis
//   * losing the `.includes("@")` guard would insert 5 drip rows and an
//     nps_responses row keyed on an obviously-invalid string
//   * losing the "onboarding_d1 in last 7 days → skip" dedupe would
//     duplicate the entire 5-touch sequence for a founder who re-scores
//   * losing the "NPS insert failed → still send the other 4 drips" branch
//     would drop the D1/D3/D7/D14 email flow whenever the nps_responses
//     table is unavailable — the founder journey silently ends at Day 0
//   * losing the +1/+3/+7/+14/+30 day offsets would misfile scheduled_for
//     and the cron would either fire everything at once or never
//   * losing the `escapeHtml` in the D1/D3/D7 copy blocks would let an
//     attacker-controlled `weakestDim` (a value routed through the SVI
//     analyser onto the DripPayload) inject arbitrary markup into the
//     rendered email HTML — an XSS through the /nps landing page
//   * losing the `siteUrl` trailing-slash strip would produce `//` in every
//     rendered dashboard/team/pricing/nps URL and break the CTA buttons
//   * losing `encodeURIComponent` on the email/token in the unsubscribe +
//     /nps URLs would break links for addresses with `+`, `?`, or `&`
//   * losing the `Math.max(4, Math.min(12, …))` clamp in the D3 lift math
//     would generate "lift your Team score by ~0 points" (score=100) or
//     "~13 points" (score=0) — either shipping an obvious lie
//   * losing the sector `[_-]` → space normalisation in D7 would surface a
//     raw `fin_tech-b2b` string in the subject line, breaking mail-client
//     readability
//   * losing the `dueDrips` `status=pending AND scheduled_for<=now` filter
//     would re-send already-sent drips
//   * losing the `.slice(0, 500)` cap on `markFailed` would push arbitrary
//     stack traces into the varchar column and overflow the db row
//
// Pins the observable contract used by every caller:
//   - renderDripBody routes each of the 5 campaigns to the right copy block
//   - copy blocks embed the escaped payload fields, the correct CTA URLs,
//     and the Auschain-footer + encoded-unsubscribe on every render
//   - siteUrl reads NEXT_PUBLIC_SITE_URL (or defaults to blockid.au) and
//     always strips a trailing slash
//   - D3 lift clamp: 100→4, 0→12, 52→6, undefined→6, 90→4 (round(1.25)=1
//     but clamp lifts to 4), 20→10
//   - enqueueOnboardingDrip: null admin / blank email / bare "no-at" all
//     early-return with no DB write; dedupe hit skips the entire sequence;
//     dedupe error logs+returns; NPS insert failure downgrades to 4 rows
//     (still commits the drip inserts); email is lowercased+trimmed before
//     both the dedupe select AND the row inserts; scheduled_for offsets
//     land exactly at +1/+3/+7/+14/+30 days from a pinned Date.now()
//   - dueDrips returns [] on null admin / on error, otherwise returns the
//     rows the chain resolved; chain shape matches the cron contract
//     exactly (from, select cols, eq(status), lte(scheduled_for), order
//     ascending, limit)
//   - markSent / markFailed no-op when admin is null; happy path issues the
//     right table + update patch + eq(id); markFailed truncates long errors
//
// Mocks:
//   - `@/lib/supabase` (getSupabaseAdmin only) — the chain builder tracks
//     every from/select/eq/gt/lte/order/limit/insert/update call so the
//     assertions can inspect the *actual* wire shape without hand-rolling
//     a Supabase double per test.

// ── Fake Supabase harness ────────────────────────────────────────────────────

type ChainResult = { data: unknown; error: { message: string } | null };

interface FakeState {
  adminNull: boolean;
  // Per-terminal results, keyed on `${table}:${op}` so a single tick can
  // exercise the dedupe select, the nps_responses insert, and the
  // email_drips insert without cross-contamination.
  results: Record<string, ChainResult>;
  captured: {
    from: string[];
    selectCols: Array<{ table: string; cols: string }>;
    eqs: Array<{ table: string; op: string; col: string; val: unknown }>;
    gts: Array<{ table: string; col: string; val: unknown }>;
    ltes: Array<{ table: string; col: string; val: unknown }>;
    orders: Array<{ table: string; col: string; ascending: boolean }>;
    limits: Array<{ table: string; op: string; n: number }>;
    inserts: Array<{ table: string; rows: unknown }>;
    updates: Array<{ table: string; patch: unknown }>;
    updateEqs: Array<{ table: string; col: string; val: unknown }>;
  };
}

const state: FakeState = {
  adminNull: false,
  results: {},
  captured: {
    from: [],
    selectCols: [],
    eqs: [],
    gts: [],
    ltes: [],
    orders: [],
    limits: [],
    inserts: [],
    updates: [],
    updateEqs: [],
  },
};

function resetState() {
  state.adminNull = false;
  state.results = {};
  state.captured = {
    from: [],
    selectCols: [],
    eqs: [],
    gts: [],
    ltes: [],
    orders: [],
    limits: [],
    inserts: [],
    updates: [],
    updateEqs: [],
  };
}

function resultFor(key: string): ChainResult {
  return state.results[key] ?? { data: null, error: null };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from(table: string) {
        state.captured.from.push(table);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selectChain: any = {
          _op: "select",
          eq(col: string, val: unknown) {
            state.captured.eqs.push({ table, op: "select", col, val });
            return selectChain;
          },
          gt(col: string, val: unknown) {
            state.captured.gts.push({ table, col, val });
            return selectChain;
          },
          lte(col: string, val: unknown) {
            state.captured.ltes.push({ table, col, val });
            return selectChain;
          },
          order(col: string, opts: { ascending: boolean }) {
            state.captured.orders.push({
              table,
              col,
              ascending: opts.ascending,
            });
            return selectChain;
          },
          limit(n: number) {
            state.captured.limits.push({ table, op: "select", n });
            return selectChain;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then(onFulfilled: any, onRejected: any) {
            return Promise.resolve(resultFor(`${table}:select`)).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateChain: any = {
          _op: "update",
          eq(col: string, val: unknown) {
            state.captured.updateEqs.push({ table, col, val });
            return updateChain;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then(onFulfilled: any, onRejected: any) {
            return Promise.resolve(resultFor(`${table}:update`)).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return {
          select(cols: string) {
            state.captured.selectCols.push({ table, cols });
            return selectChain;
          },
          insert(rows: unknown) {
            state.captured.inserts.push({ table, rows });
            return Promise.resolve(resultFor(`${table}:insert`));
          },
          update(patch: unknown) {
            state.captured.updates.push({ table, patch });
            return updateChain;
          },
        };
      },
    };
  },
}));

// The module reads process.env.NEXT_PUBLIC_SITE_URL at call time via
// `siteUrl()`, so each test can override the env var before invoking a
// render helper.
const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

import {
  renderDripBody,
  enqueueOnboardingDrip,
  dueDrips,
  markSent,
  markFailed,
} from "./email-drip";

beforeEach(() => {
  resetState();
  // Pin site URL so every rendered link is deterministic. Individual
  // tests override + restore this to prove the trailing-slash strip and
  // the default-fallback path.
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

// ── A · Pure copy: siteUrl / escapeHtml behaviour via rendered links ────────

describe("siteUrl (via renderDripBody CTAs)", () => {
  it("strips a trailing slash so CTAs never emit `//`", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test/";
    const out = renderDripBody("onboarding_d1", "a@b.co", { weakestDim: "x" });
    expect(out.html).toContain("https://example.test/dashboard/svi");
    expect(out.html).not.toContain("example.test//dashboard");
  });

  it("defaults to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const out = renderDripBody("onboarding_d1", "a@b.co", { weakestDim: "x" });
    expect(out.html).toContain("https://blockid.au/dashboard/svi");
    expect(out.text).toContain("https://blockid.au/dashboard/svi");
  });

  it("re-reads the env var per call (not cached at module load)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://one.test";
    const first = renderDripBody("onboarding_d14", "a@b.co", {});
    expect(first.html).toContain("https://one.test/pricing");
    process.env.NEXT_PUBLIC_SITE_URL = "https://two.test";
    const second = renderDripBody("onboarding_d14", "a@b.co", {});
    expect(second.html).toContain("https://two.test/pricing");
  });
});

describe("escapeHtml through the copy blocks", () => {
  it("escapes `<script>` in weakestDim so no raw tag survives in D1 html", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "<script>x</script>",
    });
    expect(out.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(out.html).not.toContain("<script>x</script>");
  });

  it("escapes `&` and quotes so entities do not double-render", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: `Team "A" & B`,
    });
    expect(out.html).toContain("Team &quot;A&quot; &amp; B");
  });

  it("escapes the D7 sector so `<img>` in a sector string cannot inject", () => {
    const out = renderDripBody("onboarding_d7", "a@b.co", {
      weakestDim: "traction",
      sector: "<img src=x onerror=1>",
    });
    expect(out.html).toContain(
      "&lt;img src=x onerror=1&gt;",
    );
    expect(out.html).not.toContain("<img src=x onerror=1>");
  });
});

// ── B · renderDripBody per campaign ──────────────────────────────────────────

describe("renderDripBody — onboarding_d1", () => {
  it("subject cites the ready-report cue and the weakest dimension", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "traction",
      weakestScore: 42,
    });
    expect(out.subject).toBe(
      "Your SVI report is ready — three next steps for traction",
    );
  });

  it("subject falls back to the neutral phrase when weakestDim is undefined", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {});
    expect(out.subject).toContain("your investor readiness signal");
  });

  it("html shows the score suffix only when weakestScore is present", () => {
    const withScore = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "traction",
      weakestScore: 42,
    });
    expect(withScore.html).toContain("at 42/100");
    const withoutScore = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "traction",
    });
    expect(withoutScore.html).not.toContain("/100");
  });

  it("html contains dashboard + Evidence Vault CTAs", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "traction",
    });
    expect(out.html).toContain("https://blockid.au/dashboard/svi");
    expect(out.html).toContain("https://blockid.au/workspace/evidence");
    expect(out.html).toContain(">Open dashboard<");
  });

  it("text version mirrors the html — same URLs + score suffix", () => {
    const out = renderDripBody("onboarding_d1", "a@b.co", {
      weakestDim: "traction",
      weakestScore: 42,
    });
    expect(out.text).toContain("Dashboard: https://blockid.au/dashboard/svi");
    expect(out.text).toContain(
      "Evidence Vault: https://blockid.au/workspace/evidence",
    );
    expect(out.text).toContain("(42/100)");
  });
});

describe("renderDripBody — onboarding_d3 lift math", () => {
  it("clamps to 4 when weakestScore=100 (round(0)=0 → floor by max)", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", { weakestScore: 100 });
    expect(out.subject).toContain("~4 points");
    expect(out.html).toContain("<strong>4 points</strong>");
  });

  it("clamps to 12 when weakestScore=0 (round(12.5)=13 → ceiling by min)", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", { weakestScore: 0 });
    expect(out.subject).toContain("~12 points");
    expect(out.html).toContain("<strong>12 points</strong>");
  });

  it("returns 6 for weakestScore=52 (round((100-52)/8)=6)", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", { weakestScore: 52 });
    expect(out.subject).toContain("~6 points");
  });

  it("defaults weakestScore to 50 when undefined (round(6.25)=6)", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", {});
    expect(out.subject).toContain("~6 points");
  });

  it("clamps sub-4 raw values back up to 4 (score=90, round(1.25)=1)", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", { weakestScore: 90 });
    expect(out.subject).toContain("~4 points");
  });

  it("html embeds the /workspace/team CTA and the free-invite footnote", () => {
    const out = renderDripBody("onboarding_d3", "a@b.co", { weakestScore: 40 });
    expect(out.html).toContain("https://blockid.au/workspace/team");
    expect(out.html).toContain(">Invite team<");
    expect(out.html).toContain(
      "Team members do not consume your credit balance",
    );
  });
});

describe("renderDripBody — onboarding_d7", () => {
  it("normalises sector: `fin_tech-b2b` → `fin tech b2b`", () => {
    const out = renderDripBody("onboarding_d7", "a@b.co", {
      weakestDim: "gtm",
      sector: "fin_tech-b2b",
    });
    expect(out.subject).toContain("in fin tech b2b are unblocking gtm");
    expect(out.html).toContain(">A pattern we see in fin tech b2b<");
  });

  it("falls back to `your sector` when sector is null", () => {
    const out = renderDripBody("onboarding_d7", "a@b.co", {
      weakestDim: "traction",
      sector: null,
    });
    expect(out.subject).toContain("in your sector are unblocking traction");
  });

  it("falls back to `traction` when weakestDim is missing", () => {
    const out = renderDripBody("onboarding_d7", "a@b.co", { sector: "saas" });
    expect(out.subject).toContain("unblocking traction");
  });

  it("html includes the insights CTA", () => {
    const out = renderDripBody("onboarding_d7", "a@b.co", { sector: "saas" });
    expect(out.html).toContain("https://blockid.au/insights");
    expect(out.html).toContain(">Read the full playbook<");
  });
});

describe("renderDripBody — onboarding_d14", () => {
  it("subject is the fixed A$29/mo Founder-plan cue", () => {
    const out = renderDripBody("onboarding_d14", "a@b.co", {});
    expect(out.subject).toBe(
      "Ready for the full report? Founder plan is A$29/mo",
    );
  });

  it("ignores the payload — no personalisation in D14", () => {
    const withPayload = renderDripBody("onboarding_d14", "a@b.co", {
      weakestDim: "should-not-appear",
      sector: "should-not-appear",
    });
    expect(withPayload.html).not.toContain("should-not-appear");
    expect(withPayload.text).not.toContain("should-not-appear");
  });

  it("html routes to /pricing", () => {
    const out = renderDripBody("onboarding_d14", "a@b.co", {});
    expect(out.html).toContain("https://blockid.au/pricing");
    expect(out.html).toContain(">See plans<");
  });
});

describe("renderDripBody — nps_d30", () => {
  it("subject is the 0..10 NPS prompt", () => {
    const out = renderDripBody("nps_d30", "a@b.co", { npsToken: "tok-abc" });
    expect(out.subject).toBe("How likely are you to recommend BlockID?");
  });

  it("URL-encodes the token so `+` and `?` in the token do not break the link", () => {
    const out = renderDripBody("nps_d30", "a@b.co", {
      npsToken: "abc+def?ghi=jkl",
    });
    expect(out.html).toContain(
      "https://blockid.au/nps?token=abc%2Bdef%3Fghi%3Djkl",
    );
    expect(out.text).toContain(
      "https://blockid.au/nps?token=abc%2Bdef%3Fghi%3Djkl",
    );
  });

  it("empty-string token still emits a stable /nps?token= URL", () => {
    const out = renderDripBody("nps_d30", "a@b.co", {});
    expect(out.html).toContain("https://blockid.au/nps?token=");
  });
});

describe("footer — every campaign renders the Auschain block + unsubscribe", () => {
  const campaigns = [
    "onboarding_d1",
    "onboarding_d3",
    "onboarding_d7",
    "onboarding_d14",
    "nps_d30",
  ] as const;

  it("every rendered html includes the ACN/ABN legal footer + unsubscribe link", () => {
    for (const c of campaigns) {
      const out = renderDripBody(c, "user+tag@example.com", {
        weakestDim: "x",
        weakestScore: 10,
        sector: "saas",
        npsToken: "tok",
      });
      expect(out.html).toContain(
        "Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111",
      );
      expect(out.html).toContain(
        "https://blockid.au/unsubscribe?email=user%2Btag%40example.com",
      );
    }
  });

  it("plain-text footer echoes the same Auschain block and unsubscribe URL", () => {
    const out = renderDripBody("onboarding_d1", "a+b@c.co", { weakestDim: "x" });
    expect(out.text).toContain(
      "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111",
    );
    expect(out.text).toContain(
      "Unsubscribe: https://blockid.au/unsubscribe?email=a%2Bb%40c.co",
    );
  });
});

// ── C · enqueueOnboardingDrip ────────────────────────────────────────────────

describe("enqueueOnboardingDrip guards", () => {
  it("returns silently when getSupabaseAdmin() is null (no throw, no capture)", async () => {
    state.adminNull = true;
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "x",
      weakestScore: 42,
      sector: "saas",
    });
    expect(state.captured.from).toEqual([]);
  });

  it("returns silently on a blank email (no DB call issued)", async () => {
    await enqueueOnboardingDrip("   ", "user-1", {
      weakestDim: "x",
      weakestScore: 42,
      sector: "saas",
    });
    expect(state.captured.from).toEqual([]);
  });

  it("returns silently on an email with no @ sign", async () => {
    await enqueueOnboardingDrip("no-at-here", "user-1", {
      weakestDim: "x",
      weakestScore: 42,
      sector: "saas",
    });
    expect(state.captured.from).toEqual([]);
  });

  it("dedupe: existing onboarding_d1 in last 7d → no insert issued", async () => {
    state.results["email_drips:select"] = {
      data: [{ id: "existing" }],
      error: null,
    };
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "x",
      weakestScore: 42,
      sector: "saas",
    });
    expect(state.captured.from).toEqual(["email_drips"]);
    expect(state.captured.inserts).toHaveLength(0);
  });

  it("dedupe error path: logs the failure then returns without inserting", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:select"] = {
      data: null,
      error: { message: "boom" },
    };
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "x",
      weakestScore: 42,
      sector: "saas",
    });
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] dedupe lookup failed",
      expect.objectContaining({ message: "boom" }),
    );
    expect(state.captured.inserts).toHaveLength(0);
  });
});

describe("enqueueOnboardingDrip happy path (5-touch sequence)", () => {
  beforeEach(() => {
    // Pin `Date.now()` so scheduled_for offsets are computable byte-for-byte.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
  });

  it("lowercases + trims the email on both the dedupe select and inserts", async () => {
    await enqueueOnboardingDrip("  Founder+X@Example.COM  ", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const dedupeEmailEq = state.captured.eqs.find(
      (e) => e.table === "email_drips" && e.col === "email",
    );
    expect(dedupeEmailEq?.val).toBe("founder+x@example.com");
    const npsRow = state.captured.inserts.find(
      (i) => i.table === "nps_responses",
    );
    expect((npsRow?.rows as { email: string }).email).toBe(
      "founder+x@example.com",
    );
    const dripRows = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    );
    for (const r of dripRows?.rows as Array<{ email: string }>) {
      expect(r.email).toBe("founder+x@example.com");
    }
  });

  it("issues exactly one nps_responses insert containing user_id + email + a non-empty token", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const npsRow = state.captured.inserts.find(
      (i) => i.table === "nps_responses",
    );
    expect(npsRow).toBeDefined();
    const row = npsRow?.rows as {
      user_id: string;
      email: string;
      token: string;
    };
    expect(row.user_id).toBe("user-1");
    expect(row.email).toBe("a@b.co");
    expect(row.token).toEqual(expect.any(String));
    expect(row.token.length).toBeGreaterThan(0);
  });

  it("produces 5 drip rows in the email_drips insert (d1/d3/d7/d14/nps_d30)", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const dripInsert = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    );
    const rows = dripInsert?.rows as Array<{ campaign: string }>;
    expect(rows.map((r) => r.campaign)).toEqual([
      "onboarding_d1",
      "onboarding_d3",
      "onboarding_d7",
      "onboarding_d14",
      "nps_d30",
    ]);
  });

  it("scheduled_for lands at exactly +1/+3/+7/+14/+30 days from pinned now", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const dripInsert = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    );
    const rows = dripInsert?.rows as Array<{
      campaign: string;
      scheduled_for: string;
    }>;
    const expected: Record<string, string> = {
      onboarding_d1: "2026-08-02T00:00:00.000Z",
      onboarding_d3: "2026-08-04T00:00:00.000Z",
      onboarding_d7: "2026-08-08T00:00:00.000Z",
      onboarding_d14: "2026-08-15T00:00:00.000Z",
      nps_d30: "2026-08-31T00:00:00.000Z",
    };
    for (const row of rows) {
      expect(row.scheduled_for).toBe(expected[row.campaign]);
    }
  });

  it("propagates weakestDim / weakestScore / sector into every non-nps payload", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const dripInsert = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    );
    const rows = dripInsert?.rows as Array<{
      campaign: string;
      payload: {
        weakestDim?: string;
        weakestScore?: number;
        sector?: string | null;
        npsToken?: string;
      };
    }>;
    for (const r of rows) {
      expect(r.payload.weakestDim).toBe("traction");
      expect(r.payload.weakestScore).toBe(42);
      expect(r.payload.sector).toBe("saas");
    }
    const nps = rows.find((r) => r.campaign === "nps_d30");
    expect(nps?.payload.npsToken).toEqual(expect.any(String));
    const others = rows.filter((r) => r.campaign !== "nps_d30");
    for (const r of others) {
      expect(r.payload.npsToken).toBeUndefined();
    }
  });

  it("nps_d30 payload token matches the token inserted into nps_responses", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const nps = state.captured.inserts.find((i) => i.table === "nps_responses")
      ?.rows as { token: string };
    const dripRow = (
      state.captured.inserts.find((i) => i.table === "email_drips")?.rows as
        | Array<{ campaign: string; payload: { npsToken?: string } }>
        | undefined
    )?.find((r) => r.campaign === "nps_d30");
    expect(dripRow?.payload.npsToken).toBe(nps.token);
  });

  it("carries the user_id (possibly null) onto every drip row", async () => {
    await enqueueOnboardingDrip("a@b.co", null, {
      weakestDim: "traction",
      weakestScore: 42,
      sector: null,
    });
    const rows = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    )?.rows as Array<{ user_id: string | null }>;
    for (const r of rows) expect(r.user_id).toBeNull();
  });

  it("dedupe select gt() horizon is exactly 7 days before pinned now", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    const gtEntry = state.captured.gts.find(
      (g) => g.table === "email_drips" && g.col === "scheduled_for",
    );
    expect(gtEntry?.val).toBe("2026-07-25T00:00:00.000Z");
  });

  it("dedupe select uses .eq(email, ...) .eq(campaign, onboarding_d1) .limit(1)", async () => {
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    expect(state.captured.selectCols[0]).toEqual({
      table: "email_drips",
      cols: "id",
    });
    const eqCols = state.captured.eqs
      .filter((e) => e.table === "email_drips" && e.op === "select")
      .map((e) => e.col);
    expect(eqCols).toEqual(["email", "campaign"]);
    const eqCampaign = state.captured.eqs.find(
      (e) => e.table === "email_drips" && e.col === "campaign",
    );
    expect(eqCampaign?.val).toBe("onboarding_d1");
    const limit = state.captured.limits.find(
      (l) => l.table === "email_drips",
    );
    expect(limit?.n).toBe(1);
  });
});

describe("enqueueOnboardingDrip degraded paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
  });

  it("NPS insert failure: logs warning, still commits the 4 non-nps drip rows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["nps_responses:insert"] = {
      data: null,
      error: { message: "nps table missing" },
    };
    await enqueueOnboardingDrip("a@b.co", "user-1", {
      weakestDim: "traction",
      weakestScore: 42,
      sector: "saas",
    });
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] failed to create nps stub",
      expect.objectContaining({ message: "nps table missing" }),
    );
    const dripInsert = state.captured.inserts.find(
      (i) => i.table === "email_drips",
    );
    const rows = dripInsert?.rows as Array<{ campaign: string }>;
    expect(rows.map((r) => r.campaign)).toEqual([
      "onboarding_d1",
      "onboarding_d3",
      "onboarding_d7",
      "onboarding_d14",
    ]);
  });

  it("drip insert failure: logs warning + does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:insert"] = {
      data: null,
      error: { message: "drip table missing" },
    };
    await expect(
      enqueueOnboardingDrip("a@b.co", "user-1", {
        weakestDim: "traction",
        weakestScore: 42,
        sector: "saas",
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] insert failed",
      expect.objectContaining({ message: "drip table missing" }),
    );
  });
});

// ── D · dueDrips ─────────────────────────────────────────────────────────────

describe("dueDrips", () => {
  it("returns [] when getSupabaseAdmin() is null", async () => {
    state.adminNull = true;
    const out = await dueDrips(new Date("2026-08-01T00:00:00.000Z"), 25);
    expect(out).toEqual([]);
  });

  it("returns [] on error and logs a warning (never throws to the cron)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:select"] = {
      data: null,
      error: { message: "boom" },
    };
    const out = await dueDrips(new Date(), 25);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] dueDrips lookup failed",
      expect.objectContaining({ message: "boom" }),
    );
  });

  it("returns the mapped rows when the select resolves data", async () => {
    const rows = [
      { id: "1", campaign: "onboarding_d1", email: "a@b.co", status: "pending" },
      { id: "2", campaign: "onboarding_d3", email: "a@b.co", status: "pending" },
    ];
    state.results["email_drips:select"] = { data: rows, error: null };
    const out = await dueDrips(new Date("2026-08-01T00:00:00.000Z"), 25);
    expect(out).toEqual(rows);
  });

  it("emits the cron-contract chain: select(*), eq(status,pending), lte(scheduled_for,now), order(scheduled_for asc), limit(N)", async () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    state.results["email_drips:select"] = { data: [], error: null };
    await dueDrips(now, 25);
    expect(state.captured.selectCols[0]).toEqual({
      table: "email_drips",
      cols: "*",
    });
    const statusEq = state.captured.eqs.find(
      (e) => e.table === "email_drips" && e.col === "status",
    );
    expect(statusEq?.val).toBe("pending");
    const lteEntry = state.captured.ltes.find(
      (l) => l.table === "email_drips" && l.col === "scheduled_for",
    );
    expect(lteEntry?.val).toBe(now.toISOString());
    const orderEntry = state.captured.orders.find(
      (o) => o.table === "email_drips" && o.col === "scheduled_for",
    );
    expect(orderEntry?.ascending).toBe(true);
    const limitEntry = state.captured.limits.find(
      (l) => l.table === "email_drips",
    );
    expect(limitEntry?.n).toBe(25);
  });

  it("null data path collapses to [] (data ?? [] guard)", async () => {
    state.results["email_drips:select"] = { data: null, error: null };
    const out = await dueDrips(new Date(), 10);
    expect(out).toEqual([]);
  });
});

// ── E · markSent / markFailed ────────────────────────────────────────────────

describe("markSent", () => {
  it("no-ops when admin is null (does not throw)", async () => {
    state.adminNull = true;
    await expect(markSent("row-1")).resolves.toBeUndefined();
    expect(state.captured.updates).toHaveLength(0);
  });

  it("issues update(status=sent, sent_at) then .eq(id, ...)", async () => {
    await markSent("row-1");
    expect(state.captured.updates).toHaveLength(1);
    const patch = state.captured.updates[0].patch as {
      status: string;
      sent_at: string;
    };
    expect(patch.status).toBe("sent");
    expect(new Date(patch.sent_at).toString()).not.toBe("Invalid Date");
    expect(state.captured.updateEqs[0]).toEqual({
      table: "email_drips",
      col: "id",
      val: "row-1",
    });
  });
});

describe("markFailed", () => {
  it("no-ops when admin is null (does not throw)", async () => {
    state.adminNull = true;
    await expect(markFailed("row-1", "boom")).resolves.toBeUndefined();
    expect(state.captured.updates).toHaveLength(0);
  });

  it("stores status=failed + last_error verbatim when it fits under 500 chars", async () => {
    await markFailed("row-1", "smtp: connection refused");
    const patch = state.captured.updates[0].patch as {
      status: string;
      last_error: string;
    };
    expect(patch.status).toBe("failed");
    expect(patch.last_error).toBe("smtp: connection refused");
    expect(state.captured.updateEqs[0]).toEqual({
      table: "email_drips",
      col: "id",
      val: "row-1",
    });
  });

  it("truncates last_error to 500 characters so a huge stack trace cannot overflow the column", async () => {
    const huge = "X".repeat(1200);
    await markFailed("row-1", huge);
    const patch = state.captured.updates[0].patch as { last_error: string };
    expect(patch.last_error).toHaveLength(500);
    expect(patch.last_error).toBe("X".repeat(500));
  });
});
