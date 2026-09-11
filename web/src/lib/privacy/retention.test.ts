// Colocated vitest for the privacy retention sweep (S15-A).
//
// Pins: RETENTION_RULES ↔ privacy-v2.mdx clause 4 parity (parsed from the
// MDX table, both directions), per-rule dry-run counts from fixtures,
// guest-only scoping for funding_reports, active-subscriber protection for
// funding_matches and the radar_setup drips, anonymise keeps the row, batch
// limit + paging past protected rows, fail-closed when the audience cannot
// be computed, and the audit line shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));
// The default audience resolver dynamic-imports @/lib/funding/radar-sweep;
// stub its side-effecting deps so the import stays pure in this suite.
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/notifications", () => ({ insertNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/funding/data", () => ({ listGrants: vi.fn(async () => []), listPrograms: vi.fn(async () => []) }));
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: vi.fn(async () => true),
  getEmailPreferences: vi.fn(async () => ({})),
}));
vi.mock("@/lib/email-drip", () => ({
  RADAR_SETUP_FOLLOWUP_DAYS: 14,
  enqueueRadarSetupDrip: vi.fn(async () => "queued" as const),
  listRadarSetupTouches: vi.fn(async () => []),
}));

import {
  MAX_BATCH_ROWS,
  MAX_PAGES_PER_RULE,
  NON_SWEEP_POLICY_ROWS,
  RETENTION_RULES,
  clampBatch,
  cutoffIso,
  hasApplier,
  pageColumn,
  runRetentionSweep,
  type RetentionRule,
} from "./retention";

const NOW = new Date("2026-09-14T03:15:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// ─── Policy parsing ──────────────────────────────────────────────────────────

const MDX = path.resolve(__dirname, "../../../content/legal/privacy-v2.mdx");

interface PolicyRow {
  dataClass: string;
  retention: string;
  days: number | null;
}

/** Parse the clause-4 pipe table into rows; `days` from the first `**N unit**`. */
function parsePolicyTable(): PolicyRow[] {
  const src = fs.readFileSync(MDX, "utf8");
  const start = src.indexOf("## 4. Retention");
  const end = src.indexOf("\n## ", start + 1);
  const section = src.slice(start, end);
  const rows = section
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .filter((l) => !/^\|\s*:?-{2,}/.test(l))
    .map((l) =>
      l
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    )
    .filter((cells) => cells.length >= 2 && cells[0] !== "Data class");
  return rows.map(([dataClass, retention]) => ({ dataClass, retention, days: periodDays(retention) }));
}

function periodDays(cell: string): number | null {
  const m = cell.match(/\*\*(\d+)\s+(day|days|month|months|year|years)\*\*/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith("day")) return n;
  if (unit.startsWith("month")) return Math.round((n * 365) / 12);
  return n * 365;
}

describe("RETENTION_RULES ↔ privacy-v2.mdx clause 4 parity", () => {
  const policy = parsePolicyTable();

  it("parses the policy table (sanity: the guest-report and radar rows are there)", () => {
    expect(policy.length).toBeGreaterThanOrEqual(14);
    expect(policy.find((r) => r.dataClass.includes("Money Finder reports (guest, A$3)"))?.days).toBe(365);
    expect(policy.find((r) => r.dataClass.includes("Founder Radar matches"))?.days).toBe(90);
  });

  it("every rule maps to exactly one policy row and its days equal the policy period", () => {
    for (const rule of RETENTION_RULES) {
      const hits = policy.filter((r) => r.dataClass.includes(rule.policyRow));
      expect(hits, `${rule.id} → "${rule.policyRow}" must match exactly one policy row`).toHaveLength(1);
      expect(hits[0].days, `${rule.id}: policy says "${hits[0].retention}"`).toBe(rule.days);
    }
  });

  it("every policy row with a fixed period is either a rule or a documented non-DB row (no silent drift)", () => {
    const fixed = policy.filter((r) => r.days !== null);
    const covered = fixed.filter(
      (r) =>
        RETENTION_RULES.some((rule) => r.dataClass.includes(rule.policyRow)) ||
        NON_SWEEP_POLICY_ROWS.some((n) => r.dataClass.includes(n.policyRow)),
    );
    const missing = fixed.filter((r) => !covered.includes(r)).map((r) => r.dataClass);
    expect(missing, "policy rows with a period but no rule / no documented exemption").toEqual([]);
    // And the exemptions really exist in the policy.
    for (const n of NON_SWEEP_POLICY_ROWS) {
      expect(policy.some((r) => r.dataClass.includes(n.policyRow) && r.days !== null), n.policyRow).toBe(true);
    }
  });

  it("policy rows without a fixed period (life of account / on request) have no rule", () => {
    const open = policy.filter((r) => r.days === null);
    for (const r of open) {
      expect(RETENTION_RULES.some((rule) => r.dataClass.includes(rule.policyRow)), r.dataClass).toBe(false);
    }
  });

  it("rule table is well-formed: unique ids, applier per rule, known modes, 0311–0327 tables/columns", () => {
    const ids = RETENTION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const columns: Record<string, string[]> = {
      funding_reports: ["created_at", "guest_email", "access_token", "user_id"],
      funding_matches: ["last_seen_at", "user_id"],
      email_drips: ["sent_at", "scheduled_for", "status", "campaign"],
      evaluations: ["invited_at", "invite_token", "claimed_at"],
    };
    for (const rule of RETENTION_RULES) {
      expect(hasApplier(rule.id), rule.id).toBe(true);
      expect(["delete", "anonymise", "expire"]).toContain(rule.mode);
      expect(rule.days).toBeGreaterThan(0);
      expect(Object.keys(columns), rule.table).toContain(rule.table);
      expect(columns[rule.table]).toContain(rule.column);
      expect(rule.note.length).toBeGreaterThan(20);
    }
    expect(RETENTION_RULES.map((r) => [r.id, r.table, r.days, r.mode])).toEqual([
      ["guest_funding_reports", "funding_reports", 365, "anonymise"],
      ["radar_matches", "funding_matches", 90, "delete"],
      ["email_drips", "email_drips", 90, "delete"],
      ["evaluator_claim_tokens", "evaluations", 90, "expire"],
    ]);
  });

  it("the policy states the sweep runs weekly", () => {
    const src = fs.readFileSync(MDX, "utf8");
    expect(src).toMatch(/retention sweep runs\s+\*\*weekly\*\*/);
  });
});

// ─── Fake Supabase ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = [op: string, col: string, value: unknown];

function fakeDb(fixture: Record<string, Row[]>, opts: { errorOn?: string } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(fixture)) tables[t] = rows.map((r) => ({ ...r }));
  const ops: string[] = [];
  const matches = (r: Row, filters: Filter[]) =>
    filters.every(([op, col, v]) => {
      const cell = r[col];
      switch (op) {
        case "is":
          return cell === v;
        case "not.is":
          return cell !== v;
        case "eq":
          return cell === v;
        case "neq":
          return cell !== v;
        case "lt":
          return typeof cell === "string" && cell < String(v);
        case "gt":
          return typeof cell === "string" && cell > String(v);
        case "gte":
          return typeof cell === "string" && cell >= String(v);
        case "lte":
          return typeof cell === "string" && cell <= String(v);
        case "in":
          return (v as unknown[]).includes(cell);
        default:
          throw new Error(`fakeDb: unsupported filter ${op}`);
      }
    });
  const db = {
    ops,
    tables,
    from(table: string) {
      const filters: Filter[] = [];
      let mode: "select" | "delete" | "update" = "select";
      let patch: Row = {};
      let orderCol: string | null = null;
      let limit: number | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => ((mode = "select"), q);
      q.delete = () => ((mode = "delete"), ops.push(`${table}.delete`), q);
      q.update = (p: Row) => ((mode = "update"), (patch = p), ops.push(`${table}.update(${JSON.stringify(p)})`), q);
      q.is = (c: string, v: unknown) => (filters.push(["is", c, v]), q);
      q.not = (c: string, op: string, v: unknown) => (filters.push([`not.${op}`, c, v]), q);
      q.eq = (c: string, v: unknown) => (filters.push(["eq", c, v]), q);
      q.neq = (c: string, v: unknown) => (filters.push(["neq", c, v]), q);
      q.lt = (c: string, v: unknown) => (filters.push(["lt", c, v]), q);
      q.gt = (c: string, v: unknown) => (filters.push(["gt", c, v]), q);
      q.gte = (c: string, v: unknown) => (filters.push(["gte", c, v]), q);
      q.lte = (c: string, v: unknown) => (filters.push(["lte", c, v]), q);
      q.in = (c: string, v: unknown[]) => (filters.push(["in", c, v]), q);
      q.order = (c: string) => ((orderCol = c), q);
      q.limit = (n: number) => ((limit = n), q);
      q.then = (resolve: (v: unknown) => unknown) => {
        if (opts.errorOn === table) return resolve({ data: null, error: { message: `boom:${table}` } });
        const rows = tables[table] ?? [];
        if (mode === "select") {
          let out = rows.filter((r) => matches(r, filters));
          if (orderCol) out = [...out].sort((a, b) => String(a[orderCol as string]).localeCompare(String(b[orderCol as string])));
          if (limit !== null) out = out.slice(0, limit);
          ops.push(`${table}.select[${out.length}]`);
          return resolve({ data: out.map((r) => ({ ...r })), error: null });
        }
        if (mode === "delete") {
          tables[table] = rows.filter((r) => !matches(r, filters));
          return resolve({ error: null });
        }
        for (const r of rows) if (matches(r, filters)) Object.assign(r, patch);
        return resolve({ error: null });
      };
      return q;
    },
  };
  return db;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTIVE = "u-active"; // Founder Radar live (plan / grant / timed / recent buyer)
const LAPSED = "u-lapsed"; // Radar ended more than 90 days ago

function fixture(): Record<string, Row[]> {
  return {
    funding_reports: [
      // guest, 400 d old → anonymise
      { id: "fr-guest-old", user_id: null, guest_email: "old@example.com", access_token: "tok-old", stripe_session_id: "cs_old", meta: { paid_at: daysAgo(400) }, created_at: daysAgo(400) },
      // guest, 30 d old → keep
      { id: "fr-guest-new", user_id: null, guest_email: "new@example.com", access_token: "tok-new", stripe_session_id: "cs_new", meta: {}, created_at: daysAgo(30) },
      // guest, already anonymised → not a candidate
      { id: "fr-guest-done", user_id: null, guest_email: null, access_token: null, stripe_session_id: "cs_done", meta: {}, created_at: daysAgo(800) },
      // member, 900 d old → never
      { id: "fr-member-old", user_id: LAPSED, guest_email: null, access_token: "tok-m", stripe_session_id: null, meta: {}, created_at: daysAgo(900) },
      // guest row later attached to an account (user_id set) → never
      { id: "fr-attached", user_id: ACTIVE, guest_email: "attached@example.com", access_token: "tok-a", stripe_session_id: "cs_a", meta: {}, created_at: daysAgo(500) },
    ],
    funding_matches: [
      { id: "fm-active-stale", user_id: ACTIVE, last_seen_at: daysAgo(200) }, // protected
      { id: "fm-active-fresh", user_id: ACTIVE, last_seen_at: daysAgo(3) },
      { id: "fm-lapsed-old", user_id: LAPSED, last_seen_at: daysAgo(120) }, // delete
      { id: "fm-lapsed-old2", user_id: LAPSED, last_seen_at: daysAgo(91) }, // delete
      { id: "fm-lapsed-recent", user_id: LAPSED, last_seen_at: daysAgo(60) }, // keep (inside 90 d)
    ],
    email_drips: [
      { id: "ed-sent-old", user_id: LAPSED, email: "l@x", campaign: "radar_t30", status: "sent", sent_at: daysAgo(100), scheduled_for: daysAgo(101) }, // delete
      { id: "ed-sent-new", user_id: LAPSED, email: "l@x", campaign: "radar_t14", status: "sent", sent_at: daysAgo(10), scheduled_for: daysAgo(11) },
      { id: "ed-pending-old", user_id: LAPSED, email: "l@x", campaign: "onboarding_d7", status: "pending", sent_at: null, scheduled_for: daysAgo(200) }, // never
      { id: "ed-cancelled-old", user_id: LAPSED, email: "l@x", campaign: "onboarding_d14", status: "cancelled", sent_at: null, scheduled_for: daysAgo(150) }, // delete (send date = scheduled_for)
      { id: "ed-late-send", user_id: LAPSED, email: "l@x", campaign: "nps_d30", status: "sent", sent_at: daysAgo(5), scheduled_for: daysAgo(120) }, // keep: sent 5 d ago
      { id: "ed-setup-active", user_id: ACTIVE, email: "a@x", campaign: "radar_setup", status: "sent", sent_at: daysAgo(100), scheduled_for: daysAgo(100) }, // protected (cap)
      { id: "ed-setup2-active", user_id: ACTIVE, email: "a@x", campaign: "radar_setup_2", status: "sent", sent_at: daysAgo(95), scheduled_for: daysAgo(95) }, // protected (cap)
      { id: "ed-setup-lapsed", user_id: LAPSED, email: "l@x", campaign: "radar_setup", status: "sent", sent_at: daysAgo(100), scheduled_for: daysAgo(100) }, // delete
      { id: "ed-t3-active-old", user_id: ACTIVE, email: "a@x", campaign: "radar_t3", status: "sent", sent_at: daysAgo(100), scheduled_for: daysAgo(100) }, // delete (not cap-bearing)
    ],
    evaluations: [
      { id: "ev-old-unclaimed", invite_token: "tok-1", invited_at: daysAgo(120), claimed_at: null, founder_email: "f@x" }, // expire
      { id: "ev-old-claimed", invite_token: "tok-2", invited_at: daysAgo(100), claimed_at: daysAgo(99), founder_email: "g@x" }, // expire (token only)
      { id: "ev-recent", invite_token: "tok-3", invited_at: daysAgo(10), claimed_at: null, founder_email: "h@x" },
      { id: "ev-no-token", invite_token: null, invited_at: daysAgo(300), claimed_at: null, founder_email: null },
    ],
  };
}

const activeIds = async () => new Set([ACTIVE]);

function byRule(summary: Awaited<ReturnType<typeof runRetentionSweep>>, id: string) {
  const r = summary.rules.find((x) => x.rule === id);
  if (!r) throw new Error(`no result for ${id}`);
  return r;
}

// ─── Sweep ───────────────────────────────────────────────────────────────────

describe("runRetentionSweep", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retention-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("supabase_unavailable when there is no service-role client", async () => {
    const s = await runRetentionSweep({ db: null, now: NOW, historyFile: null });
    expect(s).toMatchObject({ ok: false, error: "supabase_unavailable", rules: [] });
  });

  it("dry-run: per-rule counts from the fixtures, no DB change, no audit line", async () => {
    const db = fakeDb(fixture());
    const before = JSON.stringify(db.tables);
    const file = path.join(tmp, "retention-history.jsonl");
    const s = await runRetentionSweep({ db, now: NOW, dryRun: true, activeRadarUserIds: activeIds, historyFile: file });
    expect(s.ok).toBe(true);
    expect(s.dryRun).toBe(true);
    expect(byRule(s, "guest_funding_reports")).toMatchObject({ candidates: 1, protected: 0, would_affect: 1, affected: 0, dry_run: true });
    expect(byRule(s, "radar_matches")).toMatchObject({ candidates: 3, protected: 1, would_affect: 2, affected: 0 });
    expect(byRule(s, "email_drips")).toMatchObject({ candidates: 7, protected: 3, would_affect: 4, affected: 0 });
    expect(byRule(s, "evaluator_claim_tokens")).toMatchObject({ candidates: 2, protected: 0, would_affect: 2, affected: 0 });
    expect(s.affected_total).toBe(0);
    expect(s.protected_total).toBe(4);
    expect(JSON.stringify(db.tables)).toBe(before);
    expect(db.ops.some((o) => o.includes(".delete") || o.includes(".update"))).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("funding_reports: only GUEST rows age out; anonymise nulls email + access_token and keeps the revenue row", async () => {
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "guest_funding_reports")).toMatchObject({ affected: 1, mode: "anonymise", cutoff: cutoffIso(NOW, 365) });
    const rows = db.tables.funding_reports;
    const old = rows.find((r) => r.id === "fr-guest-old")!;
    expect(old).toMatchObject({ guest_email: null, access_token: null, stripe_session_id: "cs_old" });
    expect((old.meta as Row).paid_at).toBeTruthy();
    expect(rows).toHaveLength(5); // nothing deleted
    expect(rows.find((r) => r.id === "fr-guest-new")).toMatchObject({ guest_email: "new@example.com", access_token: "tok-new" });
    expect(rows.find((r) => r.id === "fr-member-old")).toMatchObject({ access_token: "tok-m" });
    expect(rows.find((r) => r.id === "fr-attached")).toMatchObject({ guest_email: "attached@example.com", access_token: "tok-a" });
    expect(db.ops).toContain('funding_reports.update({"guest_email":null,"access_token":null})');
  });

  it("funding_matches: rows of an active Radar subscriber are protected; lapsed rows older than 90 d are deleted", async () => {
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "radar_matches")).toMatchObject({ candidates: 3, protected: 1, affected: 2, mode: "delete" });
    expect(db.tables.funding_matches.map((r) => r.id).sort()).toEqual(["fm-active-fresh", "fm-active-stale", "fm-lapsed-recent"]);
  });

  it("email_drips: pending never touched, send date = coalesce(sent_at, scheduled_for), radar_setup* of active subscribers kept", async () => {
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "email_drips")).toMatchObject({ affected: 4, protected: 3 });
    expect(db.tables.email_drips.map((r) => r.id).sort()).toEqual(
      ["ed-late-send", "ed-pending-old", "ed-sent-new", "ed-setup-active", "ed-setup2-active"].sort(),
    );
  });

  it("evaluations: invite_token expires 90 d after issue, the row and its claim state stay", async () => {
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "evaluator_claim_tokens")).toMatchObject({ affected: 2, mode: "expire" });
    const rows = db.tables.evaluations;
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === "ev-old-unclaimed")).toMatchObject({ invite_token: null, founder_email: "f@x" });
    expect(rows.find((r) => r.id === "ev-old-claimed")).toMatchObject({ invite_token: null, claimed_at: daysAgo(99) });
    expect(rows.find((r) => r.id === "ev-recent")).toMatchObject({ invite_token: "tok-3" });
  });

  it("batch limit: at most `limit` rows per rule per tick, `more` flags the remainder, clamp caps at 500", async () => {
    const fx = fixture();
    fx.funding_matches = Array.from({ length: 12 }, (_, i) => ({ id: `fm-${i}`, user_id: LAPSED, last_seen_at: daysAgo(100 + i) }));
    const db = fakeDb(fx);
    const s = await runRetentionSweep({ db, now: NOW, limit: 5, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "radar_matches")).toMatchObject({ affected: 5, more: true, batch_limit: 5 });
    expect(db.tables.funding_matches).toHaveLength(7);
    // Oldest first.
    expect(db.tables.funding_matches.map((r) => r.id)).toEqual(["fm-0", "fm-1", "fm-2", "fm-3", "fm-4", "fm-5", "fm-6"]);
    expect(clampBatch(undefined)).toBe(500);
    expect(clampBatch(0)).toBe(500);
    expect(clampBatch(-3)).toBe(500);
    expect(clampBatch(1000)).toBe(MAX_BATCH_ROWS);
    expect(clampBatch(7.9)).toBe(7);
  });

  it("protected rows do not starve the batch: pages past them (up to MAX_PAGES_PER_RULE)", async () => {
    const fx = fixture();
    fx.funding_matches = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `fm-p-${i}`, user_id: ACTIVE, last_seen_at: daysAgo(300 + i) })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `fm-l-${i}`, user_id: LAPSED, last_seen_at: daysAgo(100 + i) })),
    ];
    const db = fakeDb(fx);
    const s = await runRetentionSweep({ db, now: NOW, limit: 5, activeRadarUserIds: activeIds, historyFile: null });
    expect(byRule(s, "radar_matches")).toMatchObject({ protected: 12, affected: 3, more: false });
    expect(db.tables.funding_matches.filter((r) => r.user_id === ACTIVE)).toHaveLength(12);
    expect(db.tables.funding_matches.filter((r) => r.user_id === LAPSED)).toHaveLength(0);
    expect(MAX_PAGES_PER_RULE).toBeGreaterThanOrEqual(3);
  });

  it("fails closed: if the active-subscriber set cannot be computed, the subscription-scoped rules are skipped", async () => {
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({
      db,
      now: NOW,
      activeRadarUserIds: async () => {
        throw new Error("plans table down");
      },
      historyFile: null,
    });
    expect(s.ok).toBe(false);
    expect(s.error).toBe("retention_rule_failed");
    expect(byRule(s, "radar_matches").error).toMatch(/active_subscribers_unavailable: plans table down/);
    expect(byRule(s, "email_drips").error).toMatch(/active_subscribers_unavailable/);
    expect(db.tables.funding_matches).toHaveLength(5);
    expect(db.tables.email_drips).toHaveLength(9);
    // Rules that need no audience still run.
    expect(byRule(s, "guest_funding_reports")).toMatchObject({ affected: 1 });
    expect(byRule(s, "guest_funding_reports").error).toBeUndefined();
    expect(byRule(s, "evaluator_claim_tokens")).toMatchObject({ affected: 2 });
  });

  it("a DB error on one rule is isolated: recorded on that rule, other rules still run", async () => {
    const db = fakeDb(fixture(), { errorOn: "evaluations" });
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: null });
    expect(s.ok).toBe(false);
    expect(byRule(s, "evaluator_claim_tokens")).toMatchObject({ error: "boom:evaluations", affected: 0 });
    expect(byRule(s, "radar_matches")).toMatchObject({ affected: 2 });
  });

  it("writes one audit line per rule (wet run only) with the documented shape", async () => {
    const file = path.join(tmp, "retention-history.jsonl");
    const db = fakeDb(fixture());
    const s = await runRetentionSweep({ db, now: NOW, activeRadarUserIds: activeIds, historyFile: file });
    expect(s.ok).toBe(true);
    const lines = fs
      .readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(RETENTION_RULES.length);
    expect(lines.map((l) => l.rule)).toEqual(RETENTION_RULES.map((r) => r.id));
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(
        ["affected", "batch_limit", "candidates", "column", "cutoff", "days", "dry_run", "mode", "more", "protected", "rule", "table", "ts", "would_affect"].sort(),
      );
      expect(line.ts).toBe(NOW.toISOString());
      expect(line.dry_run).toBe(false);
    }
    expect(lines.find((l) => l.rule === "guest_funding_reports")).toMatchObject({ table: "funding_reports", days: 365, mode: "anonymise", affected: 1 });
    // Missing directory → the audit is skipped, the sweep still succeeds.
    const s2 = await runRetentionSweep({ db: fakeDb(fixture()), now: NOW, activeRadarUserIds: activeIds, historyFile: path.join(tmp, "nope", "x.jsonl") });
    expect(s2.ok).toBe(true);
  });

  it("pages email_drips on scheduled_for (sent_at may be null) and every other rule on its own column", () => {
    for (const rule of RETENTION_RULES) {
      expect(pageColumn(rule)).toBe(rule.id === "email_drips" ? "scheduled_for" : rule.column);
    }
  });

  it("uses the money-radar-sweep audience by default (plan flag / grant / timed grant / recent buyer)", async () => {
    // Fake enough of the tables `createSupabaseRadarStore().listSubscribers` reads.
    const fx = fixture();
    fx.plans = [{ id: "founder_starter", feature_flags: ["money_radar"] }];
    fx.app_users = [
      { id: ACTIVE, email: "a@x", plan: "founder_starter", startup_name: "Acme", money_radar_until: null },
      { id: LAPSED, email: "l@x", plan: "founder_free", startup_name: null, money_radar_until: daysAgo(100) },
    ];
    fx.entitlements = [];
    const db = fakeDb(fx);
    const s = await runRetentionSweep({ db, now: NOW, dryRun: true, historyFile: null });
    expect(byRule(s, "radar_matches")).toMatchObject({ candidates: 3, protected: 1, would_affect: 2 });
  });

  it("rules option narrows the run (operator replay of one rule)", async () => {
    const db = fakeDb(fixture());
    const only: RetentionRule[] = RETENTION_RULES.filter((r) => r.id === "evaluator_claim_tokens");
    const s = await runRetentionSweep({ db, now: NOW, rules: only, historyFile: null });
    expect(s.rules.map((r) => r.rule)).toEqual(["evaluator_claim_tokens"]);
    expect(db.tables.funding_matches).toHaveLength(5);
  });
});
