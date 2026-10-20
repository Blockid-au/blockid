// G35 A2 — admin Approve / Dismiss / Rollback of the paid report-ladder proposal.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));

import { POST } from "./route";
import { resetRuntimeWebDirCache } from "@/lib/runtime-paths";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin" };
const USER = { id: "user-2", email: "user@example.com", role: "user" };
const V32 = "deepseek-ai/DeepSeek-V3.2";
const V4F = "deepseek-ai/DeepSeek-V4-Flash";

let dir = "";
const saved = process.env.BLOCKID_WEB_DIR;
const file = (f: string) => path.join(dir, "content", "reports", f);

function seed() {
  mkdirSync(path.join(dir, "content", "reports"), { recursive: true });
  writeFileSync(file("ai-routing-policy.json"), JSON.stringify({
    version: 1, updated_at: "2026-10-25T06:00:00Z", free: null,
    paid: { active: null, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: { id: "prop-1", proposed_at: "2026-10-25T06:00:00Z", ladders: { report: [V4F, V32] }, reasons: ["promote V4-Flash"], needs_admission: [], evidence_runs: ["full-1"] } },
  }));
  rmSync(file("ai-routing-policy-history.jsonl"), { force: true });
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "routing-policy-route-"));
  process.env.BLOCKID_WEB_DIR = dir;
  resetRuntimeWebDirCache();
});
afterAll(() => {
  if (saved === undefined) delete process.env.BLOCKID_WEB_DIR;
  else process.env.BLOCKID_WEB_DIR = saved;
  resetRuntimeWebDirCache();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  seed();
  mocks.getCurrentUser.mockReset().mockResolvedValue(ADMIN);
});

const post = (body: unknown) => POST(new Request("https://blockid.au/api/admin/ai-health/routing-policy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const policy = () => JSON.parse(readFileSync(file("ai-routing-policy.json"), "utf-8"));
const history = () => (existsSync(file("ai-routing-policy-history.jsonl")) ? readFileSync(file("ai-routing-policy-history.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l)) : []);

describe("POST /api/admin/ai-health/routing-policy", () => {
  it("401 signed out, 403 non-admin — the file is untouched", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await post({ action: "approve", proposal_id: "prop-1" })).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await post({ action: "approve", proposal_id: "prop-1" })).status).toBe(403);
    expect(policy().paid.active).toBeNull();
    expect(history()).toEqual([]);
  });

  it("400 on a bad action or a missing proposal id", async () => {
    expect((await post({ action: "deploy" })).status).toBe(400);
    expect((await post({ action: "approve" })).status).toBe(400);
  });

  it("approve: proposal → active ladder, history line with the admin's id (no e-mail)", async () => {
    const res = await post({ action: "approve", proposal_id: "prop-1" });
    expect(res.status).toBe(200);
    expect(policy().paid).toMatchObject({ active: { report: [V4F, V32] }, proposal: null, approved_by: "admin-1" });
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ action: "approve", actor: "admin-1", proposal_id: "prop-1" });
    expect(JSON.stringify(h)).not.toContain("@");
  });

  it("409 when the proposal changed since the page loaded", async () => {
    const res = await post({ action: "approve", proposal_id: "prop-0" });
    expect(res.status).toBe(409);
    expect(policy().paid.active).toBeNull();
  });

  it("rollback restores the dispatcher defaults after an approve; again → 409", async () => {
    await post({ action: "approve", proposal_id: "prop-1" });
    const rb = await post({ action: "rollback" });
    expect(rb.status).toBe(200);
    expect(policy().paid.active).toBeNull();
    expect((await post({ action: "rollback" })).status).toBe(409);
    expect(history().map((x) => x.action)).toEqual(["approve", "rollback"]);
  });

  it("dismiss drops the proposal without changing routing", async () => {
    expect((await post({ action: "dismiss", proposal_id: "prop-1" })).status).toBe(200);
    expect(policy().paid).toMatchObject({ active: null, proposal: null });
  });
});
