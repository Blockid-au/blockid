/**
 * 26 — Member lane (release-qa2 rows 13–16, S20-A RBAC): a SECOND account
 * `qa-live-member-<stamp>@blockid.au` is registered by this spec (the run's
 * second and last register call — the bucket is 3 / 15 min per IP), invited
 * as EDITOR through `POST /api/projects/[id]/members` (invite_url must be the
 * public origin — F3 regression), accepts on `/invites/<token>`, can read
 * `/workspace/finance/revenue` + `/workspace/investors` with the "Shared · Editor"
 * chip, is 403 on the owner-only exports and on close-round, and — as a
 * VIEWER — is 403 on the commitments / CRM POSTs. The founder's deletion
 * request is 409 shared_projects while the member is accepted. The member
 * account is recorded in the run state (`member`) and erased by the global
 * teardown.
 *
 * Product finding (run 1, 2026-09-13), fixed the same day: a revoked address
 * could not be re-invited (`project_members` UNIQUE (project_id, user_email)
 * kept the revoked row → 422 duplicate) and there was no role-change
 * endpoint. POST now re-activates the revoked row (status invited, fresh
 * token) and PATCH /api/projects/[id]/members/[memberId] changes the role;
 * the re-invite test is a normal test. The viewer downgrade below is still
 * a local SQL step scoped to the two QA addresses (needs LIVE_QA_ALLOW_DB=1)
 * — follow-up: drive it through the PATCH endpoint instead.
 */
import { randomBytes } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { anonRequest, del, evidence, get, patch, post } from "./lib/api";
import { env, memberEmailFor, QA_MEMBER_EMAIL_RE } from "./lib/env";
import { setMemberRole } from "./lib/db";
import { getScratch, patchRunState, readRunState, setScratch } from "./lib/run-state";
import { LIVE_QA_OUT } from "../../playwright.live-qa.config";
import path from "node:path";
import { existsSync, writeFileSync } from "node:fs";

const MEMBER_STATE = path.join(LIVE_QA_OUT, "member-storage-state.json");

interface Member {
  id: string;
  userEmail: string;
  role: string;
  status: "invited" | "accepted" | "revoked";
  token: string;
}
interface ProjectRow {
  id: string;
  role: string;
  isShared: boolean;
}

function requireMember(): { token: string } {
  const token = getScratch<string>("member.token");
  test.skip(!token || !existsSync(MEMBER_STATE), getScratch<string>("member.skipReason") ?? "the member account was not provisioned earlier in this run");
  return { token: token! };
}

async function memberBrowser(browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: MEMBER_STATE });
  return { ctx, page: await ctx.newPage() };
}

test.describe("Member lane — provision + invite", () => {
  test("register the member account (second register of the run) and record it for the teardown", async ({ qa }, testInfo) => {
    const email = memberEmailFor(qa.email);
    expect(QA_MEMBER_EMAIL_RE.test(email)).toBe(true);
    const existing = readRunState().member;
    if (existing && existsSync(MEMBER_STATE)) {
      await evidence(testInfo, "member already provisioned (re-run)", { email: existing.email });
      return;
    }
    const password = `Qa!${randomBytes(18).toString("base64url")}`;
    const anon = await anonRequest(qa.baseURL);
    try {
      const reg = await post<{ ok?: boolean; pending?: boolean; user?: { id: string }; error?: string }>(anon, "/api/auth/register", { email, password, displayName: "QA Live Member" });
      await evidence(testInfo, "POST /api/auth/register (member)", { status: reg.status, ok: reg.body.ok, userId: reg.body.user?.id, error: reg.body.error, retryAfter: reg.headers["retry-after"] ?? null });
      if (reg.status === 429) {
        setScratch("member.skipReason", `member register rate-limited (429, Retry-After ${reg.headers["retry-after"] ?? "?"}s) — the register bucket is 3 / 15 min per IP`);
        throw new Error(`member register rate-limited (429) — Retry-After ${reg.headers["retry-after"] ?? "?"}s`);
      }
      expect(reg.status).toBe(200);
      expect(reg.body.user?.id).toBeTruthy();
      // Record FIRST — from here on the teardown must erase this account.
      patchRunState({ member: { email, userId: reg.body.user!.id, memberId: null } });
      const me = await get<{ ok: boolean; user: { id: string; email: string } | null }>(anon, "/api/auth/me");
      expect(me.body.user?.email).toBe(email);
      writeFileSync(MEMBER_STATE, JSON.stringify(await anon.storageState(), null, 2));
    } finally {
      await anon.dispose();
    }
  });

  test("founder invites the member as EDITOR — invite_url is on the public origin (F3), roster lists the invite", async ({ api, qa }, testInfo) => {
    const member = readRunState().member;
    test.skip(!member, getScratch<string>("member.skipReason") ?? "no member account");
    const invite = await post<{ ok: boolean; member?: Member; invite_url?: string; error?: string }>(api, `/api/projects/${qa.projectId}/members`, { email: member!.email, role: "editor" });
    await evidence(testInfo, "POST /api/projects/[id]/members", { status: invite.status, member: invite.body.member ? { id: invite.body.member.id, role: invite.body.member.role, status: invite.body.member.status } : null, invite_url: invite.body.invite_url, error: invite.body.error });
    expect(invite.status).toBe(200);
    expect(invite.body.member?.role).toBe("editor");
    expect(invite.body.member?.status).toBe("invited");
    expect(invite.body.invite_url ?? "", "release-qa2 F3: the invite link must be the public origin, never the upstream bind address").toMatch(/^https:\/\/blockid\.au\/invites\/[A-Za-z0-9_-]+$/);
    setScratch("member.token", invite.body.member!.token);
    patchRunState({ member: { ...member!, memberId: invite.body.member!.id } });
    const roster = await get<{ ok: boolean; members: Member[] }>(api, `/api/projects/${qa.projectId}/members`);
    expect(roster.body.members.some((m) => m.id === invite.body.member!.id && m.userEmail === member!.email)).toBe(true);

    // Validation shapes — nothing created.
    const badRole = await post(api, `/api/projects/${qa.projectId}/members`, { email: "someone@example.com", role: "superuser" });
    const badEmail = await post(api, `/api/projects/${qa.projectId}/members`, { email: "nope", role: "viewer" });
    await evidence(testInfo, "validation", { badRole: badRole.body, badEmail: badEmail.body });
    expect([400, 422]).toContain(badRole.status);
    expect(badEmail.status).toBe(400);
  });

  test("anonymous /invites/<token> shows the invite and asks to sign in; the member accepts and lands in the workspace", async ({ browser, qa }, testInfo) => {
    const { token } = requireMember();
    const anon = await anonRequest(qa.baseURL);
    try {
      const res = await anon.get(`/invites/${token}`, { headers: { accept: "text/html" }, maxRedirects: 0 });
      const html = await res.text();
      expect(res.status()).toBe(200);
      expect(html).toMatch(/Sign in to accept/);
    } finally {
      await anon.dispose();
    }
    const { ctx, page } = await memberBrowser(browser);
    try {
      await page.goto(`${qa.baseURL}/invites/${token}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(new RegExp(`invited to ${qa.projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), { timeout: 30_000 });
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/projects/members/accept") && r.request().method() === "POST", { timeout: 45_000 }),
        page.getByRole("button", { name: /Accept invitation/ }).click(),
      ]);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; project?: { id: string; role: string }; redirect?: string; error?: string; code?: string };
      await evidence(testInfo, "POST /api/projects/members/accept", { status: res.status(), body });
      expect(res.status()).toBe(200);
      expect(body.project?.id).toBe(qa.projectId);
      expect(body.project?.role).toBe("editor");
      await page.waitForURL(/\/workspace/, { timeout: 30_000 });
      const cookie = (await ctx.cookies()).find((c) => c.name === "blockid_project");
      expect(cookie?.value, "accept pins the shared project (by id) in the project cookie").toBe(qa.projectId);
      // Persist the accepted session (+ project cookie) for the later tests.
      await ctx.storageState({ path: MEMBER_STATE });
      const projects = await get<{ ok: boolean; projects: ProjectRow[] }>(page.request, "/api/projects");
      const shared = projects.body.projects.find((p) => p.id === qa.projectId);
      await evidence(testInfo, "member /api/projects", shared);
      expect(shared?.role).toBe("editor");
      expect(shared?.isShared).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Member lane — editor", () => {
  test("editor can read /workspace/finance/revenue and /workspace/investors with the 'Shared · Editor' chip", async ({ browser, qa }, testInfo) => {
    requireMember();
    const { ctx, page } = await memberBrowser(browser);
    try {
      for (const path of ["/workspace/finance/revenue", "/workspace/investors/pipeline"]) {
        const res = await page.goto(`${qa.baseURL}${path}`, { waitUntil: "domcontentloaded" });
        expect(res?.status(), `${path} status`).toBeLessThan(400);
        expect(new URL(page.url()).pathname, `${path} stays (no owner-only redirect)`).toBe(path);
        await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible({ timeout: 30_000 });
        const chip = page.getByTestId("shared-role-chip").first();
        await expect(chip).toBeVisible({ timeout: 30_000 });
        await expect(chip).toContainText(/Shared · Editor/);
        if (path === "/workspace/investors/pipeline") await expect(page.getByTestId("investor-crm")).toBeVisible({ timeout: 30_000 });
      }
      await evidence(testInfo, "editor pages", { chip: await page.getByTestId("shared-role-chip").first().innerText() });
    } finally {
      await ctx.close();
    }
  });

  test("editor is 403 on the owner-only exports (CRM CSV, audit-log CSV) and on close-round; can read the round", async ({ browser, qa }, testInfo) => {
    requireMember();
    const ctx = await browser.newContext({ storageState: MEMBER_STATE });
    try {
      const m = ctx.request;
      const crm = await m.get("/api/investors/crm/export.csv");
      const audit = await m.get("/api/audit-log/export");
      const crmBody = (await crm.json().catch(() => ({}))) as { code?: string };
      const auditBody = (await audit.json().catch(() => ({}))) as { code?: string };
      const roundId = qa.scratch["fundraise.roundId"] as string | undefined;
      const round = roundId ? await get<{ ok: boolean; round?: { status: string }; canClose?: boolean; canEdit?: boolean }>(m, `/api/fundraise/${roundId}`) : null;
      const close = roundId ? await patch(m, `/api/fundraise/${roundId}`, { status: "closed" }) : null;
      const commitments = roundId ? await get(m, `/api/fundraise/${roundId}/commitments`) : null;
      await evidence(testInfo, "editor RBAC", { crm: { status: crm.status(), code: crmBody.code }, audit: { status: audit.status(), code: auditBody.code }, roundId: roundId ?? null, round: round ? { status: round.status, canClose: round.body.canClose, canEdit: round.body.canEdit } : null, close: close ? { status: close.status, body: close.body } : null, commitments: commitments?.status ?? null });
      expect(crm.status()).toBe(403);
      expect(crmBody.code).toBe("forbidden");
      expect(audit.status()).toBe(403);
      expect(auditBody.code).toBe("forbidden");
      if (!roundId) {
        testInfo.annotations.push({ type: "not-exercised", description: "no fundraise round in this run (Growth-gated 06 did not run) — close-round 403 skipped" });
        return;
      }
      expect(round!.status).toBe(200);
      expect(round!.body.canClose).toBe(false);
      expect(round!.body.canEdit).toBe(true);
      expect(close!.status, "closing is admin+ — an editor must be refused").toBe(403);
      expect(commitments!.status).toBe(200);
      const still = await get<{ ok: boolean; round?: { status: string } }>(m, `/api/fundraise/${roundId}`);
      expect(still.body.round?.status).not.toBe("closed");
    } finally {
      await ctx.close();
    }
  });

  test("founder's deletion request is 409 shared_projects while the member is accepted", async ({ api, qa }, testInfo) => {
    requireMember();
    test.skip(!qa.password, "run state has no founder password — cannot re-authenticate");
    const r = await post<{ ok: boolean; reason?: string; projects?: Array<{ id: string; members: number }> }>(api, "/api/account/delete", { action: "request", confirmation: "DELETE", password: qa.password });
    const status = await get<{ pending: boolean }>(api, "/api/account/delete");
    await evidence(testInfo, "POST /api/account/delete with a shared project", { status: r.status, body: r.body, pendingAfter: status.body.pending });
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe("shared_projects");
    expect(r.body.projects?.some((p) => p.id === qa.projectId && p.members >= 1)).toBe(true);
    expect(status.body.pending).toBe(false);
  });
});


test.describe("Member lane — viewer", () => {
  test("revoke then re-invite the same address as VIEWER (S30-B fix: the revoked row is re-activated in place with a fresh token)", async ({ api, qa }, testInfo) => {
    requireMember();
    const member = readRunState().member!;
    const revoke = await del<{ ok: boolean; member?: Member }>(api, `/api/projects/${qa.projectId}/members?memberId=${member.memberId}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.member?.status).toBe("revoked");
    const reinvite = await post<{ ok: boolean; member?: Member; error?: string; code?: string }>(api, `/api/projects/${qa.projectId}/members`, { email: member.email, role: "viewer" });
    await evidence(testInfo, "revoke + re-invite", { revoke: revoke.body.member?.status, reinvite: { status: reinvite.status, body: reinvite.body } });
    expect(reinvite.status, "re-inviting a revoked address").toBe(200);
    expect(reinvite.body.member?.role).toBe("viewer");
    setScratch("member.token", reinvite.body.member!.token);
    patchRunState({ member: { ...member, memberId: reinvite.body.member!.id } });
  });

  test("viewer (downgraded by the scoped SQL step) is read-only: commitments + CRM POST are 403, /api/projects says viewer, reads still work", async ({ browser, api, qa }, testInfo) => {
    requireMember();
    test.skip(!env.allowDb, "the viewer downgrade is a local SQL step on the QA member row — needs LIVE_QA_ALLOW_DB=1 (no product path exists, see the pinned finding above)");
    const member = readRunState().member!;
    const readBack = setMemberRole(qa.email, member.email, qa.projectId!, "viewer");
    const roster = await get<{ ok: boolean; members: Member[] }>(api, `/api/projects/${qa.projectId}/members`);
    const row = roster.body.members.find((m) => m.userEmail === member.email);
    await evidence(testInfo, "downgrade", { readBack, roster: row ? { role: row.role, status: row.status } : null });
    expect(row?.role).toBe("viewer");
    expect(row?.status).toBe("accepted");

    const ctx = await browser.newContext({ storageState: MEMBER_STATE });
    try {
      const m = ctx.request;
      const projects = await get<{ ok: boolean; projects: ProjectRow[] }>(m, "/api/projects");
      expect(projects.body.projects.find((p) => p.id === qa.projectId)?.role).toBe("viewer");
      const roundId = qa.scratch["fundraise.roundId"] as string | undefined;
      const commit = roundId ? await post(m, `/api/fundraise/${roundId}/commitments`, { investorName: "Viewer Should Not", amountAud: 1000 }) : null;
      const contact = await post(m, "/api/investors/crm/contacts", { name: "Viewer Should Not", email: "viewer-should-not@example.com" });
      const revenue = await m.get("/api/revenue");
      const contacts = await get(m, "/api/investors/crm/contacts");
      await evidence(testInfo, "viewer RBAC", { commit: commit ? { status: commit.status, body: commit.body } : "no round", contact: { status: contact.status, body: contact.body }, revenueRead: revenue.status(), contactsRead: contacts.status });
      if (commit) {
        expect(commit.status).toBe(403);
        expect(commit.body.code).toBe("forbidden");
      } else {
        testInfo.annotations.push({ type: "not-exercised", description: "no fundraise round in this run — commitments POST 403 skipped" });
      }
      expect(contact.status).toBe(403);
      expect(revenue.status()).toBeLessThan(400);
      expect(contacts.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });
});
