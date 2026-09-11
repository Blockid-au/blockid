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
    ins: Array<{ table: string; col: string; val: unknown }>;
    ltes: Array<{ table: string; col: string; val: unknown }>;
    lts: Array<{ table: string; op: string; col: string; val: unknown }>;
    iss: Array<{ table: string; op: string; col: string; val: unknown }>;
    updateSelects: Array<{ table: string; cols: string }>;
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
    ins: [],
    ltes: [],
    lts: [],
    iss: [],
    updateSelects: [],
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
    ins: [],
    ltes: [],
    lts: [],
    iss: [],
    updateSelects: [],
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

const canSendEmailMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (...args: unknown[]) => canSendEmailMock(...args),
  // Real builder shape: /unsubscribe?token=…&category=… — radar drips use it.
  getUnsubscribeUrl: (token: string, category?: string) =>
    `${(process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "")}/unsubscribe?token=${token}${category ? `&category=${category}` : ""}`,
}));

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
          in(col: string, val: unknown) {
            state.captured.ins.push({ table, col, val });
            return selectChain;
          },
          lte(col: string, val: unknown) {
            state.captured.ltes.push({ table, col, val });
            return selectChain;
          },
          is(col: string, val: unknown) {
            state.captured.iss.push({ table, op: "select", col, val });
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
          is(col: string, val: unknown) {
            state.captured.iss.push({ table, op: "update", col, val });
            return updateChain;
          },
          lt(col: string, val: unknown) {
            state.captured.lts.push({ table, op: "update", col, val });
            return updateChain;
          },
          select(cols: string) {
            state.captured.updateSelects.push({ table, cols });
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  renderDripBody,
  enqueueOnboardingDrip,
  enqueueRadarDrip,
  enqueueRadarSetupDrip,
  listRadarSetupTouches,
  ALL_DRIP_CAMPAIGNS,
  RADAR_CAMPAIGNS,
  RADAR_SETUP_CAMPAIGNS,
  RADAR_SETUP_SUBJECTS,
  RADAR_DRIP_DEDUPE_DAYS,
  RADAR_SETUP_DEDUPE_DAYS,
  RADAR_SETUP_FOLLOWUP_DAYS,
  isRadarCampaign,
  isRadarSetupCampaign,
  dueDrips,
  markSent,
  markFailed,
  expireStaleDrips,
  claimDrip,
  suppressDrip,
  canSendDrip,
  dripCategory,
  DRIP_EXPIRY_DAYS,
} from "./email-drip";

beforeEach(() => {
  resetState();
  canSendEmailMock.mockReset();
  canSendEmailMock.mockResolvedValue(true);
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

// ── F · Expiry guard ─────────────────────────────────────────────────────────

describe("DRIP_EXPIRY_DAYS", () => {
  it("is 14 — the gap in the real backlog between the recent cluster (<=13d late) and the stale tail (>=16d late), and the D14 touch interval", () => {
    expect(DRIP_EXPIRY_DAYS).toBe(14);
  });
});

describe("expireStaleDrips", () => {
  it("returns 0 when getSupabaseAdmin() is null (never throws to the cron)", async () => {
    state.adminNull = true;
    await expect(expireStaleDrips(new Date())).resolves.toBe(0);
    expect(state.captured.updates).toHaveLength(0);
  });

  it("returns 0 and warns on error rather than throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:update"] = {
      data: null,
      error: { message: "constraint" },
    };
    await expect(expireStaleDrips(new Date())).resolves.toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] expireStaleDrips failed",
      expect.objectContaining({ message: "constraint" }),
    );
  });

  it("counts the returned rows so the cron envelope reports what it retired", async () => {
    state.results["email_drips:update"] = {
      data: [{ id: "1" }, { id: "2" }, { id: "3" }],
      error: null,
    };
    await expect(expireStaleDrips(new Date())).resolves.toBe(3);
  });

  it("null data collapses to 0", async () => {
    state.results["email_drips:update"] = { data: null, error: null };
    await expect(expireStaleDrips(new Date())).resolves.toBe(0);
  });

  it("writes status=expired with a reason naming the threshold", async () => {
    await expireStaleDrips(new Date("2026-09-09T00:00:00.000Z"));
    const patch = state.captured.updates[0].patch as {
      status: string;
      last_error: string;
    };
    expect(patch.status).toBe("expired");
    expect(patch.last_error).toBe(
      "expired: more than 14 days past scheduled_for",
    );
  });

  it("only touches pending, unsent rows strictly older than now minus the threshold", async () => {
    const now = new Date("2026-09-09T00:00:00.000Z");
    await expireStaleDrips(now, 14);
    const statusEq = state.captured.updateEqs.find((e) => e.col === "status");
    expect(statusEq?.val).toBe("pending");
    const sentAtIs = state.captured.iss.find(
      (i) => i.op === "update" && i.col === "sent_at",
    );
    expect(sentAtIs?.val).toBeNull();
    const lt = state.captured.lts.find((l) => l.col === "scheduled_for");
    expect(lt?.val).toBe("2026-08-26T00:00:00.000Z");
    expect(state.captured.updateSelects[0]).toEqual({
      table: "email_drips",
      cols: "id",
    });
  });

  it("honours a caller-supplied threshold (used by the ops dry-run tooling)", async () => {
    await expireStaleDrips(new Date("2026-09-09T00:00:00.000Z"), 7);
    const lt = state.captured.lts.find((l) => l.col === "scheduled_for");
    expect(lt?.val).toBe("2026-09-02T00:00:00.000Z");
    const patch = state.captured.updates[0].patch as { last_error: string };
    expect(patch.last_error).toBe(
      "expired: more than 7 days past scheduled_for",
    );
  });

  it("is idempotent by construction — the status=pending filter means a second sweep matches nothing", async () => {
    state.results["email_drips:update"] = { data: [{ id: "1" }], error: null };
    await expireStaleDrips(new Date());
    state.results["email_drips:update"] = { data: [], error: null };
    await expect(expireStaleDrips(new Date())).resolves.toBe(0);
  });
});

// ── G · Suppression ──────────────────────────────────────────────────────────

describe("dripCategory", () => {
  it("maps the D14 pricing pitch onto promotions", () => {
    expect(dripCategory("onboarding_d14")).toBe("promotions");
  });

  it("maps the tips and the NPS pulse onto product_updates", () => {
    expect(dripCategory("onboarding_d1")).toBe("product_updates");
    expect(dripCategory("onboarding_d3")).toBe("product_updates");
    expect(dripCategory("onboarding_d7")).toBe("product_updates");
    expect(dripCategory("nps_d30")).toBe("product_updates");
  });
});

describe("canSendDrip", () => {
  it("delegates to the single existing mechanism, canSendEmail, with the mapped category", async () => {
    await canSendDrip("a@b.co", "onboarding_d7");
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "product_updates");
  });

  it("passes promotions through for the D14 touch", async () => {
    await canSendDrip("a@b.co", "onboarding_d14");
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "promotions");
  });

  it("returns whatever canSendEmail decides — no second opinion", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    await expect(canSendDrip("a@b.co", "onboarding_d1")).resolves.toBe(false);
    canSendEmailMock.mockResolvedValueOnce(true);
    await expect(canSendDrip("a@b.co", "onboarding_d1")).resolves.toBe(true);
  });
});

describe("suppressDrip", () => {
  it("no-ops when admin is null", async () => {
    state.adminNull = true;
    await expect(suppressDrip("row-1", "opt-out")).resolves.toBeUndefined();
    expect(state.captured.updates).toHaveLength(0);
  });

  it("cancels the row and leaves sent_at untouched — an opted-out address is never recorded as mailed", async () => {
    await suppressDrip("row-1", "suppressed: promotions opt-out");
    const patch = state.captured.updates[0].patch as {
      status: string;
      last_error: string;
      sent_at?: unknown;
    };
    expect(patch.status).toBe("cancelled");
    expect(patch.last_error).toBe("suppressed: promotions opt-out");
    expect(patch).not.toHaveProperty("sent_at");
    expect(state.captured.updateEqs[0]).toEqual({
      table: "email_drips",
      col: "id",
      val: "row-1",
    });
    const sentAtIs = state.captured.iss.find(
      (i) => i.op === "update" && i.col === "sent_at",
    );
    expect(sentAtIs?.val).toBeNull();
  });

  it("truncates the reason to 500 chars", async () => {
    await suppressDrip("row-1", "Y".repeat(900));
    const patch = state.captured.updates[0].patch as { last_error: string };
    expect(patch.last_error).toHaveLength(500);
  });
});

// ── H · Once-only claim ──────────────────────────────────────────────────────

describe("claimDrip", () => {
  it("returns false when admin is null", async () => {
    state.adminNull = true;
    await expect(claimDrip("row-1")).resolves.toBe(false);
  });

  it("returns false and warns on error rather than throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:update"] = {
      data: null,
      error: { message: "deadlock" },
    };
    await expect(claimDrip("row-1")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[email-drip] claimDrip failed",
      expect.objectContaining({ message: "deadlock" }),
    );
  });

  it("returns true only when exactly one row was claimed", async () => {
    state.results["email_drips:update"] = { data: [{ id: "row-1" }], error: null };
    await expect(claimDrip("row-1")).resolves.toBe(true);
  });

  it("returns false when zero rows matched — the retry case that must not double-send", async () => {
    state.results["email_drips:update"] = { data: [], error: null };
    await expect(claimDrip("row-1")).resolves.toBe(false);
  });

  it("returns false when data is null", async () => {
    state.results["email_drips:update"] = { data: null, error: null };
    await expect(claimDrip("row-1")).resolves.toBe(false);
  });

  it("stamps sent_at under WHERE id = ? AND status = pending AND sent_at IS NULL", async () => {
    state.results["email_drips:update"] = { data: [{ id: "row-1" }], error: null };
    await claimDrip("row-1");
    const patch = state.captured.updates[0].patch as { sent_at: string };
    expect(new Date(patch.sent_at).toString()).not.toBe("Invalid Date");
    expect(patch).not.toHaveProperty("status");
    expect(state.captured.updateEqs).toEqual([
      { table: "email_drips", col: "id", val: "row-1" },
      { table: "email_drips", col: "status", val: "pending" },
    ]);
    const sentAtIs = state.captured.iss.find(
      (i) => i.op === "update" && i.col === "sent_at",
    );
    expect(sentAtIs?.val).toBeNull();
    expect(state.captured.updateSelects[0]).toEqual({
      table: "email_drips",
      cols: "id",
    });
  });
});

// ---------------------------------------------------------------------------
// 2026-09-09 sweep: the Day-14 upsell sold A$29 on cap table, vesting and ESOP
// tools, and on "unlimited" reports. founder_starter holds none of
// cap_table.write / vesting.* / esop.manage, and its 20 monthly credits are a
// hard meter. The rung now lists what it actually grants.
// ---------------------------------------------------------------------------
describe("day-14 upsell describes what A$29 grants", () => {
  const render = () => renderDripBody("onboarding_d14", "founder@example.com", {});

  it("does not promise cap table, vesting or ESOP at A$29", () => {
    const body = `${render().html} ${render().text}`.toLowerCase();
    expect(body).not.toContain("cap table");
    expect(body).not.toContain("vesting");
    expect(body).not.toContain("esop");
  });

  it("does not call the report allowance unlimited", () => {
    const body = `${render().html} ${render().text}`.toLowerCase();
    expect(body).not.toContain("unlimited");
  });
});

// ---------------------------------------------------------------------------
// T0246 — Money Radar drips: radar_t30 / radar_t14 / radar_t3 /
// radar_status_changed. Subjects are the approved D-3 strings; every body
// names the program, the A$ ceiling when known, the official link, the
// "Draft application" CTA to /workspace/funding, and a working unsubscribe
// (category-scoped when a token is on the payload).
// ---------------------------------------------------------------------------

const RADAR_PAYLOAD = {
  ref_kind: "grant" as const,
  ref_id: "nsw-mvp-ventures",
  ref_name: "MVP Ventures",
  closes_at: "2026-10-10",
  amount_max_aud: 50_000,
  official_url: "https://www.investment.nsw.gov.au/mvp",
  report_url: "https://blockid.au/funding/report/r1",
};

describe("renderDripBody — radar_t30", () => {
  it("uses the approved subject and carries every required piece", () => {
    const out = renderDripBody("radar_t30", "f@x.co", RADAR_PAYLOAD);
    expect(out.subject).toBe("30 days to MVP Ventures: your eligibility checklist");
    expect(out.html).toContain("MVP Ventures");
    expect(out.html).toContain("up to A$50,000");
    expect(out.html).toContain('href="https://www.investment.nsw.gov.au/mvp"');
    expect(out.html).toContain("https://blockid.au/workspace/funding");
    expect(out.html).toContain("Draft application");
    expect(out.html).toContain("Closes 2026-10-10");
    expect(out.html).toContain("https://blockid.au/funding/report/r1");
    expect(out.html).toContain("https://blockid.au/unsubscribe?email=f%40x.co");
    expect(out.text).toContain("Draft application: https://blockid.au/workspace/funding");
    expect(out.text).toContain("Official page: https://www.investment.nsw.gov.au/mvp");
    expect(out.text).toContain("up to A$50,000");
  });

  it("never invents an amount when none is known and says 'Applications close' for programs", () => {
    const out = renderDripBody("radar_t30", "f@x.co", {
      ...RADAR_PAYLOAD,
      ref_kind: "program",
      amount_max_aud: null,
      official_url: null,
    });
    expect(out.html).not.toContain("A$");
    expect(out.html).toContain("Applications close 2026-10-10");
    expect(out.html).not.toContain("Official page");
  });

  it("escapes an attacker-controlled program name", () => {
    const out = renderDripBody("radar_t30", "f@x.co", { ...RADAR_PAYLOAD, ref_name: "<img src=x onerror=1>" });
    expect(out.html).toContain("&lt;img src=x onerror=1&gt;");
    expect(out.html).not.toContain("<img src=x onerror=1>");
  });

  it("prefers the category-scoped token unsubscribe when the payload carries one", () => {
    const out = renderDripBody("radar_t30", "f@x.co", { ...RADAR_PAYLOAD, unsubscribe_token: "tok-1" });
    expect(out.html).toContain("https://blockid.au/unsubscribe?token=tok-1&amp;category=money_radar");
    expect(out.text).toContain("Unsubscribe: https://blockid.au/unsubscribe?token=tok-1&category=money_radar");
    expect(out.html).not.toContain("unsubscribe?email=");
  });
});

describe("renderDripBody — radar_t14", () => {
  it("subject + required pieces", () => {
    const out = renderDripBody("radar_t14", "f@x.co", RADAR_PAYLOAD);
    expect(out.subject).toBe("MVP Ventures closes in 2 weeks — draft ready?");
    expect(out.html).toContain("up to A$50,000");
    expect(out.html).toContain('href="https://www.investment.nsw.gov.au/mvp"');
    expect(out.html).toContain("https://blockid.au/workspace/funding");
    expect(out.html).toContain("Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111");
    expect(out.html).toContain("Founder Radar is watching this deadline");
  });
});

describe("renderDripBody — radar_t3", () => {
  it("subject + required pieces", () => {
    const out = renderDripBody("radar_t3", "f@x.co", RADAR_PAYLOAD);
    expect(out.subject).toBe("Final 72 hours for MVP Ventures");
    expect(out.html).toContain("up to A$50,000");
    expect(out.html).toContain('href="https://www.investment.nsw.gov.au/mvp"');
    expect(out.html).toContain("Draft application");
    expect(out.text).toContain("Final 72 hours for MVP Ventures");
  });
});

describe("renderDripBody — radar_status_changed", () => {
  it("names the paused program and lists the two alternatives by score", () => {
    const out = renderDripBody("radar_status_changed", "f@x.co", {
      ...RADAR_PAYLOAD,
      status: "paused",
      alternatives: [
        { ref_kind: "grant", ref_id: "g2", name: "Ignite Ideas", amount_max_aud: 200_000, official_url: "https://ignite.example", closes_at: "2026-11-01" },
        { ref_kind: "program", ref_id: "p1", name: "Startmate", amount_max_aud: null, official_url: null, closes_at: null },
      ],
    });
    expect(out.subject).toBe("MVP Ventures paused — here are 2 alternatives");
    expect(out.html).toContain("Ignite Ideas");
    expect(out.html).toContain("up to A$200,000");
    expect(out.html).toContain('href="https://ignite.example"');
    expect(out.html).toContain("Startmate");
    expect(out.html).toContain("https://blockid.au/workspace/funding");
    expect(out.text).toContain("1. Ignite Ideas — up to A$200,000 · closes 2026-11-01 · https://ignite.example");
    expect(out.text).toContain("2. Startmate");
  });

  it("says 'closed' for a closed flip and degrades gracefully with no alternatives", () => {
    const out = renderDripBody("radar_status_changed", "f@x.co", { ...RADAR_PAYLOAD, status: "closed", alternatives: [] });
    expect(out.subject).toBe("MVP Ventures closed — here are 2 alternatives");
    expect(out.html).toContain("No other match is open this week");
  });
});

describe("radar campaigns → money_radar category", () => {
  it("dripCategory maps every radar campaign to money_radar and leaves onboarding alone", () => {
    for (const c of RADAR_CAMPAIGNS) expect(dripCategory(c)).toBe("money_radar");
    expect(dripCategory("onboarding_d1")).toBe("product_updates");
    expect(dripCategory("onboarding_d14")).toBe("promotions");
    expect(isRadarCampaign("radar_t3")).toBe(true);
    expect(isRadarCampaign("nps_d30")).toBe(false);
  });

  it("canSendDrip asks canSendEmail for money_radar on a radar campaign", async () => {
    canSendEmailMock.mockResolvedValue(false);
    expect(await canSendDrip("f@x.co", "radar_t14")).toBe(false);
    expect(canSendEmailMock).toHaveBeenCalledWith("f@x.co", "money_radar");
  });
});

// The DB CHECK is the last line of defence against a campaign id the worker
// cannot render. This pins the LATEST migration's list (0327, S11-A) to the
// TS union (via the runtime ALL_DRIP_CAMPAIGNS mirror) so neither can drift
// alone; each earlier re-assertion (0320) must be a strict subset.
function campaignCheckList(file: string): { sql: string; listed: string[] } {
  const sql = readFileSync(resolve(__dirname, `../../supabase/migrations/${file}`), "utf8");
  const block = sql.match(/add constraint email_drips_campaign_check[\s\S]*?\]\)\);/i)?.[0] ?? "";
  expect(block, file).not.toBe("");
  return { sql, listed: Array.from(block.matchAll(/'([a-z0-9_]+)'::text/g)).map((m) => m[1]) };
}

describe("migration 0327 campaign CHECK matches the DripCampaign union", () => {
  it("lists exactly ALL_DRIP_CAMPAIGNS (onboarding five + radar four + setup two)", () => {
    const { sql, listed } = campaignCheckList("0327_radar_setup_drip.sql");
    expect([...listed].sort()).toEqual([...ALL_DRIP_CAMPAIGNS].sort());
    expect(listed).toContain("radar_setup");
    expect(listed).toContain("radar_setup_2");
    expect(sql).toMatch(/drop constraint if exists email_drips_campaign_check/i);
    expect(sql).toMatch(/notify pgrst, 'reload schema'/);
  });

  it("0320's list is a strict subset (nothing was dropped)", () => {
    const { sql, listed } = campaignCheckList("0320_radar_drips.sql");
    expect(listed.length).toBe(9);
    for (const c of listed) expect(ALL_DRIP_CAMPAIGNS).toContain(c);
    expect(sql).toMatch(/drop constraint if exists email_drips_campaign_check/i);
  });

  it("0088's original inline CHECK is a strict subset (nothing was dropped)", () => {
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/0088_email_drips_and_nps.sql"), "utf8");
    const block = sql.match(/campaign\s+text not null check \(campaign in \(([\s\S]*?)\)\)/i)?.[1] ?? "";
    const original = Array.from(block.matchAll(/'([a-z0-9_]+)'/g)).map((m) => m[1]);
    expect(original.length).toBe(5);
    for (const c of original) expect(ALL_DRIP_CAMPAIGNS).toContain(c);
  });
});

describe("enqueueRadarDrip", () => {
  const NOW = new Date("2026-09-13T05:10:00.000Z");

  it("inserts one due-now row keyed on the ref and returns 'queued'", async () => {
    const r = await enqueueRadarDrip("F@X.co ", "u1", "radar_t14", RADAR_PAYLOAD, { now: NOW });
    expect(r).toBe("queued");
    // Dedupe lookup shape: email + campaign + payload->>ref_id inside the window.
    const eqs = state.captured.eqs.filter((e) => e.table === "email_drips" && e.op === "select");
    expect(eqs.map((e) => [e.col, e.val])).toEqual([
      ["email", "f@x.co"],
      ["campaign", "radar_t14"],
      ["payload->>ref_id", "nsw-mvp-ventures"],
    ]);
    const gt = state.captured.gts.find((g) => g.table === "email_drips");
    expect(gt?.col).toBe("scheduled_for");
    expect(gt?.val).toBe(new Date(NOW.getTime() - RADAR_DRIP_DEDUPE_DAYS * 86_400_000).toISOString());
    const ins = state.captured.inserts.find((i) => i.table === "email_drips");
    expect(ins?.rows).toEqual([
      {
        email: "f@x.co",
        user_id: "u1",
        campaign: "radar_t14",
        scheduled_for: NOW.toISOString(),
        payload: RADAR_PAYLOAD,
      },
    ]);
  });

  it("returns 'duplicate' and inserts nothing when the (email, campaign, ref_id) row exists", async () => {
    state.results["email_drips:select"] = { data: [{ id: "existing" }], error: null };
    const r = await enqueueRadarDrip("f@x.co", "u1", "radar_t14", RADAR_PAYLOAD, { now: NOW });
    expect(r).toBe("duplicate");
    expect(state.captured.inserts).toHaveLength(0);
  });

  it("rejects a bad address, a missing ref_id and a non-radar campaign without touching the DB", async () => {
    expect(await enqueueRadarDrip("nope", "u1", "radar_t3", RADAR_PAYLOAD)).toBe("invalid");
    expect(await enqueueRadarDrip("f@x.co", "u1", "radar_t3", { ...RADAR_PAYLOAD, ref_id: " " })).toBe("invalid");
    expect(await enqueueRadarDrip("f@x.co", "u1", "onboarding_d1" as never, RADAR_PAYLOAD)).toBe("invalid");
    expect(state.captured.from).toHaveLength(0);
  });

  it("returns 'error' on a null admin, a dedupe error, or an insert error", async () => {
    state.adminNull = true;
    expect(await enqueueRadarDrip("f@x.co", "u1", "radar_t3", RADAR_PAYLOAD)).toBe("error");
    state.adminNull = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:select"] = { data: null, error: { message: "boom" } };
    expect(await enqueueRadarDrip("f@x.co", "u1", "radar_t3", RADAR_PAYLOAD)).toBe("error");
    state.results["email_drips:select"] = { data: [], error: null };
    state.results["email_drips:insert"] = { data: null, error: { message: "boom" } };
    expect(await enqueueRadarDrip("f@x.co", "u1", "radar_t3", RADAR_PAYLOAD)).toBe("error");
  });

  it("accepts an injected db (the sweep's client) instead of getSupabaseAdmin", async () => {
    state.adminNull = true;
    const calls: string[] = [];
    const db = {
      from(table: string) {
        calls.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          gt: () => chain,
          limit: () => Promise.resolve({ data: [], error: null }),
          insert: () => Promise.resolve({ error: null }),
        };
        return chain;
      },
    };
    expect(await enqueueRadarDrip("f@x.co", "u1", "radar_t30", RADAR_PAYLOAD, { db })).toBe("queued");
    expect(calls).toEqual(["email_drips", "email_drips"]);
  });
});

// ---------------------------------------------------------------------------
// S11-A — Founder Radar activation nudges: radar_setup (first empty sweep)
// and radar_setup_2 (≥ 14 days later, still empty). Subjects are the approved
// strings; each body is ≤ 120 words, names the live counts, carries ONE CTA
// to /workspace/funding?from=radar_setup and the money_radar unsubscribe.
// ---------------------------------------------------------------------------

const SETUP_PAYLOAD = { startup: "Acme Agtech", open_grants: 14, open_programs: 6, unsubscribe_token: null };

function wordCount(text: string): number {
  // Body only — drop the footer (company line + unsubscribe) and the CTA URL.
  const body = text.split("\n\n—\n")[0].replace(/https?:\/\/\S+/g, "");
  return body.split(/\s+/).filter(Boolean).length;
}

describe("renderDripBody — radar_setup / radar_setup_2 (S11-A)", () => {
  it("radar_setup: approved subject, counts, startup name, one CTA to ?from=radar_setup, money_radar footer, ≤ 120 words", () => {
    const out = renderDripBody("radar_setup", "f@x.co", SETUP_PAYLOAD);
    expect(out.subject).toBe("Your Founder Radar is on — tell us 3 things to start matching");
    expect(out.subject).toBe(RADAR_SETUP_SUBJECTS.radar_setup);
    expect(out.html).toContain("Acme Agtech");
    expect(out.html).toContain("14 grants and 6 programs are open today");
    expect(out.html).toContain('href="https://blockid.au/workspace/funding?from=radar_setup"');
    expect(out.html.match(/href="https:\/\/blockid\.au\/workspace\/funding\?from=radar_setup"/g)).toHaveLength(1);
    expect(out.html).toContain("Answer 3 questions");
    expect(out.html).toContain("https://blockid.au/unsubscribe?email=f%40x.co");
    expect(out.html).toContain("Founder Radar is included in your BlockID plan");
    expect(out.text).toContain("Answer 3 questions: https://blockid.au/workspace/funding?from=radar_setup");
    expect(wordCount(out.text)).toBeLessThanOrEqual(120);
    // D-3 voice: no exclamation marks, no emoji.
    expect(out.text).not.toMatch(/!/);
  });

  it("radar_setup_2: the follow-up subject, says it is the last ask, same single CTA, ≤ 120 words", () => {
    const out = renderDripBody("radar_setup_2", "f@x.co", { ...SETUP_PAYLOAD, unsubscribe_token: "tok-9" });
    expect(out.subject).toBe("Still want grant alerts? 60 seconds sets them up");
    expect(out.subject).toBe(RADAR_SETUP_SUBJECTS.radar_setup_2);
    expect(out.html).toContain("we will not ask again");
    expect(out.html).toContain("14 grants and 6 programs are open today");
    expect(out.html.match(/href="https:\/\/blockid\.au\/workspace\/funding\?from=radar_setup"/g)).toHaveLength(1);
    expect(out.html).toContain("Set up matching");
    expect(out.html).toContain("https://blockid.au/unsubscribe?token=tok-9&amp;category=money_radar");
    expect(wordCount(out.text)).toBeLessThanOrEqual(120);
  });

  it("never blank when counts are missing, and escapes the startup name", () => {
    const out = renderDripBody("radar_setup", "f@x.co", { startup: "<b>Evil</b>" });
    expect(out.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(out.html).not.toContain("<b>Evil</b>");
    expect(out.html).not.toContain("are open today");
    expect(out.html).toContain("Answer three questions");
    const noName = renderDripBody("radar_setup", "f@x.co", { open_grants: 0, open_programs: 0 });
    expect(noName.html).toContain("your startup");
    expect(noName.html).not.toContain("0 grants");
  });

  it("campaign registry: setup campaigns are money_radar, in ALL_DRIP_CAMPAIGNS, not radar deadline campaigns", () => {
    expect(RADAR_SETUP_CAMPAIGNS).toEqual(["radar_setup", "radar_setup_2"]);
    for (const c of RADAR_SETUP_CAMPAIGNS) {
      expect(ALL_DRIP_CAMPAIGNS).toContain(c);
      expect(dripCategory(c)).toBe("money_radar");
      expect(isRadarSetupCampaign(c)).toBe(true);
      expect(isRadarCampaign(c)).toBe(false);
    }
    expect(isRadarSetupCampaign("radar_t14")).toBe(false);
    expect(RADAR_SETUP_DEDUPE_DAYS).toBe(30);
    expect(RADAR_SETUP_FOLLOWUP_DAYS).toBe(14);
  });

  it("canSendDrip gates a setup campaign on money_radar", async () => {
    canSendEmailMock.mockResolvedValue(false);
    expect(await canSendDrip("f@x.co", "radar_setup_2")).toBe(false);
    expect(canSendEmailMock).toHaveBeenCalledWith("f@x.co", "money_radar");
  });
});

describe("enqueueRadarSetupDrip / listRadarSetupTouches (S11-A)", () => {
  const NOW = new Date("2026-09-13T05:10:00.000Z");

  it("inserts one due-now row deduped on (email, campaign) inside 30 days", async () => {
    const r = await enqueueRadarSetupDrip("F@X.co ", "u1", "radar_setup", SETUP_PAYLOAD, { now: NOW });
    expect(r).toBe("queued");
    const eqs = state.captured.eqs.filter((e) => e.table === "email_drips" && e.op === "select");
    expect(eqs.map((e) => [e.col, e.val])).toEqual([
      ["email", "f@x.co"],
      ["campaign", "radar_setup"],
    ]);
    const gt = state.captured.gts.find((g) => g.table === "email_drips");
    expect(gt?.col).toBe("scheduled_for");
    expect(gt?.val).toBe(new Date(NOW.getTime() - RADAR_SETUP_DEDUPE_DAYS * 86_400_000).toISOString());
    expect(state.captured.inserts.find((i) => i.table === "email_drips")?.rows).toEqual([
      { email: "f@x.co", user_id: "u1", campaign: "radar_setup", scheduled_for: NOW.toISOString(), payload: SETUP_PAYLOAD },
    ]);
  });

  it("returns 'duplicate' inside the window, 'invalid' for a bad address or non-setup campaign, 'error' on db failure", async () => {
    state.results["email_drips:select"] = { data: [{ id: "existing" }], error: null };
    expect(await enqueueRadarSetupDrip("f@x.co", "u1", "radar_setup_2", SETUP_PAYLOAD, { now: NOW })).toBe("duplicate");
    expect(state.captured.inserts).toHaveLength(0);
    expect(await enqueueRadarSetupDrip("nope", "u1", "radar_setup", SETUP_PAYLOAD)).toBe("invalid");
    expect(await enqueueRadarSetupDrip("f@x.co", "u1", "radar_t14" as never, SETUP_PAYLOAD)).toBe("invalid");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:select"] = { data: null, error: { message: "boom" } };
    expect(await enqueueRadarSetupDrip("f@x.co", "u1", "radar_setup", SETUP_PAYLOAD)).toBe("error");
    state.adminNull = true;
    expect(await enqueueRadarSetupDrip("f@x.co", "u1", "radar_setup", SETUP_PAYLOAD)).toBe("error");
  });

  it("listRadarSetupTouches reads every setup row for the address (any status), newest first, ignoring other campaigns", async () => {
    state.results["email_drips:select"] = {
      data: [
        { campaign: "radar_setup_2", scheduled_for: "2026-09-27T05:00:00Z" },
        { campaign: "radar_setup", scheduled_for: "2026-09-13T05:00:00Z" },
        { campaign: "radar_t14", scheduled_for: "2026-09-13T05:00:00Z" },
      ],
      error: null,
    };
    const touches = await listRadarSetupTouches(" F@x.co ");
    expect(touches).toEqual([
      { campaign: "radar_setup_2", scheduled_for: "2026-09-27T05:00:00Z" },
      { campaign: "radar_setup", scheduled_for: "2026-09-13T05:00:00Z" },
    ]);
    expect(state.captured.eqs.find((e) => e.table === "email_drips")).toMatchObject({ col: "email", val: "f@x.co" });
    expect(state.captured.ins.find((i) => i.table === "email_drips")).toMatchObject({ col: "campaign", val: ["radar_setup", "radar_setup_2"] });
    expect(state.captured.orders.find((o) => o.table === "email_drips")).toMatchObject({ col: "scheduled_for", ascending: false });
    // No status filter — a cancelled (opt-out) or expired row still counts as a touch.
    expect(state.captured.eqs.filter((e) => e.table === "email_drips").map((e) => e.col)).not.toContain("status");
  });

  it("listRadarSetupTouches is [] on null admin, blank email or a read error", async () => {
    expect(await listRadarSetupTouches("  ")).toEqual([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.results["email_drips:select"] = { data: null, error: { message: "boom" } };
    expect(await listRadarSetupTouches("f@x.co")).toEqual([]);
    state.adminNull = true;
    expect(await listRadarSetupTouches("f@x.co")).toEqual([]);
  });
});
