// G14-S33 — scripts/investor-update.mjs: renders the §5 investor-update
// template from the traction snapshot + AI spend + live-QA files; every
// unmeasurable figure is "n/a" (never invented), highlights are the last 30
// days of dated CHANGELOG headings, Challenges / Ask stay [[fill]], and
// --write lands docs/marketing/investor-updates/YYYY-MM.md under --root.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changelogHighlights, main, outputPath, parseArgs, priorSnapshotFromHistory, render } from "./investor-update.mjs";

const NOW = new Date("2026-09-16T10:00:00Z");

const CHANGELOG = `# BlockID.au Changelog

## Unreleased — 2026-09-10: Money Finder + Evaluator ladder

### 2026-09-12 — release QA-4: API contract & security sweep fixes
- stuff

### 2026-09-11 — post-launch hardening & conversion (S6–S15)

## 2026-09-09 — v3.10.0 (continued): persistence, the investor data room, and one visual system

## 2026-08-01 — v3.8.0: too old to be a highlight
`;

function snapshot(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: "2026-09-16T03:20:00.000Z",
    git_sha: "deadbeefcafe",
    users: { total: 40, founders: 31, evaluators_by_plan: { investor_angel: 6, investor_vc_small: 3 }, excluded_count: 7 },
    analyses: { svi_analyses: 210, analyses: 55, guest_analyses_paid: 5 },
    tbr: { purchased: 4, shared: 9, views: 120 },
    evaluators: { trials: 4, paying_by_plan: { investor_angel: 2 }, reports_per_evaluator_p50: 3 },
    assessments: { submitted: 0, shared_with_founder: 0 },
    share_links: 12,
    api_keys_active: 2,
    webhooks_active: 1,
    mrr_aud_cents: { from_subscriptions: 15800, from_revenue_events: 7900, stripe_reconciled: true },
    funnel_7d: { hero_variant_shown: 900 },
    warnings: [],
    ...overrides,
  };
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
}

describe("parseArgs", () => {
  it("defaults, --write, --month, --root, --help; rejects unknown args and bad months", () => {
    expect(parseArgs([])).toEqual({ write: false, month: null, root: null, help: false });
    expect(parseArgs(["--write", "--month=2026-08", "--root=/x"])).toEqual({ write: true, month: "2026-08", root: "/x", help: false });
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--month=Sept"])).toThrow(/YYYY-MM/);
  });
});

describe("changelogHighlights", () => {
  it("keeps dated ## / ### headings from the last 30 days, newest first, text after the dash", () => {
    const h = changelogHighlights(CHANGELOG, NOW);
    expect(h.map((x) => x.date)).toEqual(["2026-09-12", "2026-09-11", "2026-09-10", "2026-09-09"]);
    expect(h[0].text).toBe("release QA-4: API contract & security sweep fixes");
    expect(h[2].text).toBe("Money Finder + Evaluator ladder");
    expect(h.find((x) => x.date === "2026-08-01")).toBeUndefined();
  });
  it("is empty for a missing changelog", () => {
    expect(changelogHighlights(null, NOW)).toEqual([]);
  });
});

describe("priorSnapshotFromHistory", () => {
  it("picks the newest history line generated before the 1st of the month", () => {
    const lines = [
      { generated_at: "2026-08-20T03:20:00Z", users: { total: 10 } },
      { generated_at: "2026-08-31T03:20:00Z", users: { total: 12 } },
      { generated_at: "2026-09-02T03:20:00Z", users: { total: 30 } },
      "not json",
    ]
      .map((l) => (typeof l === "string" ? l : JSON.stringify(l)))
      .join("\n");
    expect(priorSnapshotFromHistory(lines, "2026-09")?.users.total).toBe(12);
    expect(priorSnapshotFromHistory(lines, "2026-08")).toBeNull();
    expect(priorSnapshotFromHistory(null, "2026-09")).toBeNull();
  });
});

describe("render", () => {
  it("EMPTY snapshot: every figure is n/a, placeholders stay [[fill]], month + date come from now", () => {
    const r = render({ snapshot: null, history: null, aiSpend: null, liveQa: null, changelog: null }, { now: NOW });
    expect(r.month).toBe("2026-09");
    expect(r.hasSnapshot).toBe(false);
    expect(r.body).toContain("Subject: BlockID.au — September 2026 Update");
    expect(r.body).toContain("MRR: n/a (MoM n/a)");
    expect(r.body).toContain("Users: n/a (new n/a) — n/a founders · n/a evaluator seats · n/a paying · n/a on trial");
    expect(r.body).toContain("SVI Analyses: n/a total (this month n/a)");
    expect(r.body).toContain("AI COGS: n/a");
    expect(r.body).toContain("Live QA: n/a");
    expect(r.body).toContain("Net Promoter Score: n/a");
    expect(r.body).toContain("└── n/a (no dated CHANGELOG.md headings in the last 30 days)");
    expect((r.body.match(/\[\[fill\]\]/g) ?? []).length).toBe(8);
    expect(r.body).toContain("traction-snapshot.json: n/a (run /api/cron/traction-snapshot)");
    // Never a digit where a measurement is missing — no "0" fabricated for MRR / users.
    expect(r.body).not.toMatch(/MRR: A\$0/);
    expect(r.body).not.toMatch(/Users: 0/);
    for (const section of ["Key Metrics:", "Highlights:", "Challenges:", "Ask:", "Next Month Focus:"]) expect(r.body).toContain(section);
  });

  it("FULL inputs: figures, MoM from history, COGS per call, live-QA line, highlights, provenance + excluded QA count", () => {
    const history = [JSON.stringify({ generated_at: "2026-08-31T03:20:00Z", users: { total: 30 }, analyses: { svi_analyses: 200 }, mrr_aud_cents: { from_subscriptions: 7900 } })].join("\n");
    const r = render(
      {
        snapshot: snapshot(),
        history,
        aiSpend: { day: "2026-09-16", spent_usd: 0.038142, calls: 152, by_provider: { deepinfra: 0.038142 } },
        liveQa: { ts: "2026-09-16T13:32:30.356Z", exitCode: 0, passed: 155, failed: 0, skipped: 10 },
        changelog: CHANGELOG,
      },
      { now: NOW },
    );
    expect(r.hasSnapshot).toBe(true);
    expect(r.body).toContain("MRR: A$158 (+100% MoM) — subscriptions; revenue events 30d A$79; Stripe reconciled: yes");
    expect(r.body).toContain("Users: 40 (+10 new) — 31 founders · 9 evaluator seats · 2 paying · 4 on trial");
    expect(r.body).toContain("SVI Analyses: 210 total (+10 this month) · 5 paid A$3 guest reports");
    expect(r.body).toContain("Trust Business Reports: 4 purchased · 9 shared · 120 views · 0 evaluator assessments");
    expect(r.body).toContain("Integrations: 2 active API keys · 1 active webhooks");
    expect(r.body).toContain("AI COGS (2026-09-16): US$0.0381 over 152 calls (US$0.00025 / call)");
    expect(r.body).toContain("Live QA (2026-09-16): 155 passed · 0 failed · 10 skipped · green");
    expect(r.body).toContain("├── 2026-09-12 — release QA-4: API contract & security sweep fixes");
    expect(r.body).toContain("traction-snapshot.json generated 2026-09-16T03:20:00.000Z @ deadbeefca");
    expect(r.body).toContain("QA / seeded / erased accounts excluded from every user figure: 7");
    expect(r.body).toContain("Month-over-month baseline: traction-history.jsonl line generated 2026-08-31T03:20:00Z");
    expect(r.body).toContain("Net Promoter Score: n/a");
  });

  it("a partially-null snapshot prints n/a per figure and lists the warnings in provenance", () => {
    const r = render(
      { snapshot: snapshot({ mrr_aud_cents: { from_subscriptions: null, from_revenue_events: 500, stripe_reconciled: null }, assessments: { submitted: null, shared_with_founder: null }, warnings: ["evaluation_assessments:submitted: 42P01 missing"] }), history: null, aiSpend: null, liveQa: null, changelog: null },
      { now: NOW, month: "2026-09" },
    );
    expect(r.body).toContain("MRR: n/a (MoM n/a) — subscriptions; revenue events 30d A$5; Stripe reconciled: n/a");
    expect(r.body).toContain("· n/a evaluator assessments");
    expect(r.body).toContain("Snapshot warnings (1): evaluation_assessments:submitted: 42P01 missing");
  });
});

describe("main (CLI)", () => {
  it("absent snapshot → prints the n/a draft, warns on stderr, exits 0", async () => {
    const root = mkdtempSync(join(tmpdir(), "inv-update-"));
    const c = capture();
    const code = await main(["--month=2026-09"], { root, stdout: c.stdout, stderr: c.stderr, now: NOW });
    expect(code).toBe(0);
    expect(c.out.join("")).toContain("MRR: n/a");
    expect(c.err.join("\n")).toMatch(/no traction-snapshot\.json/);
    expect(existsSync(outputPath(root, "2026-09"))).toBe(false);
  });

  it("--write lands docs/marketing/investor-updates/YYYY-MM.md under --root with the body fenced", async () => {
    const root = mkdtempSync(join(tmpdir(), "inv-update-"));
    mkdirSync(join(root, "web", "content", "reports"), { recursive: true });
    writeFileSync(join(root, "web", "content", "reports", "traction-snapshot.json"), JSON.stringify(snapshot()));
    writeFileSync(join(root, "web", "CHANGELOG.md"), CHANGELOG);
    const c = capture();
    const code = await main(["--write", `--root=${root}`, "--month=2026-09"], { stdout: c.stdout, stderr: c.stderr, now: NOW });
    expect(code).toBe(0);
    const file = outputPath(root, "2026-09");
    expect(existsSync(file)).toBe(true);
    const md = readFileSync(file, "utf8");
    expect(md.startsWith("# Investor Update — September 2026\n")).toBe(true);
    expect(md).toContain("Users: 40 (new n/a)");
    expect(md).toContain("[[fill]]");
  });

  it("unknown flag → exit 1; --help → exit 0", async () => {
    const c = capture();
    expect(await main(["--bogus"], { stdout: c.stdout, stderr: c.stderr })).toBe(1);
    expect(await main(["--help"], { stdout: c.stdout, stderr: c.stderr })).toBe(0);
    expect(c.out.join("")).toContain("usage:");
  });
});
