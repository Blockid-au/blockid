import { describe, expect, it } from "vitest";
import { FREE_POLICY_MAX_AGE_MS, applyFreeRoutingPolicy, approvedPaidLadder, emptyRoutingPolicy, parseRoutingPolicy, type RoutingPolicy } from "./routing-policy";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function policy(over: Partial<RoutingPolicy> = {}): RoutingPolicy {
  return { ...emptyRoutingPolicy(new Date(NOW)), ...over } as RoutingPolicy;
}

const freePolicy = (providers: Record<string, { promoted?: string[]; demoted?: string[] }>, at = NOW) =>
  policy({ free: { updated_at: new Date(at).toISOString(), reasons: [], providers: Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, { promoted: v.promoted ?? [], demoted: v.demoted ?? [] }])) } });

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
