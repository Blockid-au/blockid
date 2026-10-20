import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_DEMOTION_TTL_MS, FREE_POLICY_MAX_AGE_MS, activeDemotions, applyFreeRoutingPolicy, approvedPaidLadder, emptyRoutingPolicy, parseRoutingPolicy, readRoutingPolicyFileState, routingPolicyWriteError, type RoutingPolicy } from "./routing-policy";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function policy(over: Partial<RoutingPolicy> = {}): RoutingPolicy {
  return { ...emptyRoutingPolicy(new Date(NOW)), ...over } as RoutingPolicy;
}

const UNTIL = new Date(NOW + FREE_DEMOTION_TTL_MS).toISOString();
const freePolicy = (providers: Record<string, { promoted?: string[]; demoted?: string[]; until?: string }>, at = NOW) =>
  policy({
    free: {
      updated_at: new Date(at).toISOString(),
      reasons: [],
      providers: Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, { promoted: v.promoted ?? [], demoted: v.demoted ?? [], demoted_until: Object.fromEntries((v.demoted ?? []).map((m) => [m, v.until ?? UNTIL])) }])),
    },
  });

const LADDER = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];

describe("parseRoutingPolicy", () => {
  it("missing / malformed / wrong version → null (the dispatcher keeps today's routing)", () => {
    expect(parseRoutingPolicy(null)).toBeNull();
    expect(parseRoutingPolicy("x")).toBeNull();
    expect(parseRoutingPolicy({ version: 2, updated_at: "x" })).toBeNull();
    expect(parseRoutingPolicy({ version: 1 })).toBeNull();
  });
  it("a minimal valid file gets empty sections", () => {
    const p = parseRoutingPolicy({ version: 1, updated_at: "2026-10-20T00:00:00Z" });
    expect(p?.free).toBeNull();
    expect(p?.paid).toMatchObject({ active: null, proposal: null, previous: null });
  });
});

describe("applyFreeRoutingPolicy", () => {
  it("no policy → the ladder unchanged (a copy)", () => {
    const out = applyFreeRoutingPolicy("groq", LADDER, null, NOW);
    expect(out).toEqual(LADDER);
    expect(out).not.toBe(LADDER);
  });
  it("promoted ids move to the head, demoted ids are skipped", () => {
    const p = freePolicy({ groq: { promoted: ["openai/gpt-oss-120b"], demoted: ["openai/gpt-oss-20b"] } });
    expect(applyFreeRoutingPolicy("groq", LADDER, p, NOW)).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  });
  it("never adds a model that is not in the ladder", () => {
    const p = freePolicy({ groq: { promoted: ["evil/new-model", "openai/gpt-oss-20b"] } });
    expect(applyFreeRoutingPolicy("groq", LADDER, p, NOW)).toEqual(["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
  });
  it("never empties a ladder", () => {
    const p = freePolicy({ groq: { demoted: LADDER } });
    expect(applyFreeRoutingPolicy("groq", LADDER, p, NOW)).toEqual(LADDER);
  });
  it("a demotion lapses at its expiry (P1-1); one without an expiry is not honoured", () => {
    const expired = freePolicy({ groq: { demoted: ["openai/gpt-oss-20b"], until: new Date(NOW - 1).toISOString() } });
    expect(applyFreeRoutingPolicy("groq", LADDER, expired, NOW)).toEqual(LADDER);
    const noExpiry = policy({ free: { updated_at: new Date(NOW).toISOString(), reasons: [], providers: { groq: { promoted: [], demoted: ["openai/gpt-oss-20b"], demoted_until: {} } } } });
    expect(applyFreeRoutingPolicy("groq", LADDER, noExpiry, NOW)).toEqual(LADDER);
    expect(activeDemotions({ demoted: ["a", "b"], demoted_until: { a: UNTIL, b: "nonsense" } }, NOW)).toEqual(["a"]);
  });

  it("other providers are untouched", () => {
    const p = freePolicy({ groq: { demoted: ["openai/gpt-oss-20b"] } });
    expect(applyFreeRoutingPolicy("openrouter", ["a:free", "b:free"], p, NOW)).toEqual(["a:free", "b:free"]);
  });
  it("a stale free section (eval cron dead > 15 days) is ignored", () => {
    const p = freePolicy({ groq: { demoted: ["qwen/qwen3.8-27b"] } }, NOW - FREE_POLICY_MAX_AGE_MS - 1);
    expect(applyFreeRoutingPolicy("groq", LADDER, p, NOW)).toEqual(LADDER);
    const fresh = freePolicy({ groq: { demoted: ["qwen/qwen3.8-27b"] } }, NOW - 60_000);
    expect(applyFreeRoutingPolicy("groq", LADDER, fresh, NOW)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });
});

describe("approvedPaidLadder", () => {
  const REPORT = ["deepseek-ai/DeepSeek-V3.2", "Qwen/Qwen3-235B-A22B-Instruct-2507", "deepseek-ai/DeepSeek-V4-Flash"];
  const withActive = (active: RoutingPolicy["paid"]["active"]) => policy({ paid: { active, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: null } });

  it("no approval → null (caller keeps its default)", () => {
    expect(approvedPaidLadder("report", REPORT, null)).toBeNull();
    expect(approvedPaidLadder("report", REPORT, policy())).toBeNull();
  });
  it("a PROPOSAL alone never changes routing", () => {
    const p = policy();
    p.paid.proposal = { id: "prop-1", proposed_at: "x", ladders: { report: ["deepseek-ai/DeepSeek-V4-Flash"] }, reasons: [], needs_admission: [], evidence_runs: [] };
    expect(approvedPaidLadder("report", REPORT, p)).toBeNull();
  });
  it("an approved ladder reorders the allowed rungs; omitted rungs go to the back (never dropped)", () => {
    const p = withActive({ report: ["deepseek-ai/DeepSeek-V4-Flash"] });
    expect(approvedPaidLadder("report", REPORT, p)).toEqual(["deepseek-ai/DeepSeek-V4-Flash", "deepseek-ai/DeepSeek-V3.2", "Qwen/Qwen3-235B-A22B-Instruct-2507"]);
  });
  it("a model outside the allowed (admitted) list is ignored — an approve cannot widen the report scope", () => {
    const p = withActive({ report: ["openai/gpt-oss-120b", "moonshotai/Kimi-K2.6"] });
    expect(approvedPaidLadder("report", REPORT, p)).toBeNull();
    const mixed = withActive({ report: ["openai/gpt-oss-120b", "Qwen/Qwen3-235B-A22B-Instruct-2507"] });
    expect(approvedPaidLadder("report", REPORT, mixed)?.[0]).toBe("Qwen/Qwen3-235B-A22B-Instruct-2507");
  });
  it("classes without an approved ladder and unknown classes → null", () => {
    const p = withActive({ report: ["deepseek-ai/DeepSeek-V4-Flash"] });
    expect(approvedPaidLadder("synthesis", REPORT, p)).toBeNull();
    expect(approvedPaidLadder("vision", REPORT, p)).toBeNull();
  });
});

describe("readRoutingPolicyFileState / routingPolicyWriteError (P2-1)", () => {
  it("missing, valid and invalid files are told apart; an invalid policy is never written", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rp-state-"));
    try {
      const f = path.join(dir, "ai-routing-policy.json");
      expect(readRoutingPolicyFileState(f)).toEqual({ state: "missing" });
      writeFileSync(f, "{ truncated");
      expect(readRoutingPolicyFileState(f)).toMatchObject({ state: "invalid", error: "not JSON" });
      writeFileSync(f, JSON.stringify({ version: 1, updated_at: "x", paid: { active: { report: "not-a-list" } } }));
      expect(readRoutingPolicyFileState(f).state).toBe("invalid");
      writeFileSync(f, JSON.stringify(emptyRoutingPolicy(new Date(NOW))));
      expect(readRoutingPolicyFileState(f).state).toBe("ok");
      expect(routingPolicyWriteError(emptyRoutingPolicy(new Date(NOW)))).toBeNull();
      expect(routingPolicyWriteError({ version: 1 })).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
