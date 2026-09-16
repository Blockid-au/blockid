/**
 * Local database steps for the live-QA run — `docker exec supabase-db psql`
 * on the production host, the same path scripts/db/erase-account.mjs uses.
 *
 * Every statement here is scoped to ONE QA account that must match
 * `^qa-live-\d{8}-\d{4}@blockid\.au$`; any other email is refused before a
 * connection is opened. Nothing runs unless LIVE_QA_ALLOW_DB=1.
 */
import { execFileSync } from "node:child_process";
import { QA_EMAIL_RE, QA_MEMBER_EMAIL_RE, env } from "./env";

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
/** `psql -At` prints the RETURNING row, then the command tag ("UPDATE 1") — keep the row. */
const firstLine = (out: string) => out.trim().split("\n")[0] ?? "";

function assertQaEmail(email: string): void {
  if (!QA_EMAIL_RE.test(email)) {
    throw new Error(`live-qa db step refused: "${email}" is not a live-QA account address`);
  }
}

export function dbAllowed(): boolean {
  return env.allowDb;
}

export function psql(sql: string): string {
  if (!env.allowDb) throw new Error("live-qa db step refused: LIVE_QA_ALLOW_DB is not set");
  const common = { input: sql, encoding: "utf8" as const, maxBuffer: 8 * 1024 * 1024 };
  if (process.env.PSQL) return execFileSync("sh", ["-c", `${process.env.PSQL} -At -v ON_ERROR_STOP=1`], common);
  if (process.env.PGURL) return execFileSync("psql", [process.env.PGURL, "-At", "-v", "ON_ERROR_STOP=1"], common);
  const container = process.env.SUPABASE_DB_CONTAINER || "supabase-db";
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
    common,
  );
}

/** app_users.plan → 'growth' for the QA account. Returns the plan read back. */
export function elevatePlan(email: string, plan = "growth"): string {
  assertQaEmail(email);
  if (!/^[a-z_]+$/.test(plan)) throw new Error("bad plan token");
  const out = firstLine(psql(
    `update public.app_users set plan = ${q(plan)} where email = ${q(email)} and email ~ '^qa-live-[0-9]{8}-[0-9]{4}@blockid\\.au$' returning plan;`,
  ));
  if (out !== plan) throw new Error(`elevatePlan: expected '${plan}' back, got '${out || "<no row>"}'`);
  return out;
}

/**
 * projects.growth_phase_current → the given phase for the QA account's
 * project, so the phase-gated nav leaves (nav v4: Valuation band 2, Documents 3,
 * Finance 4, Exit 5) render. Lane 1 (2026-09-13) did the
 * same by hand; there is no founder-facing API for it.
 */
export function setGrowthPhase(email: string, projectId: string, phase = "funding"): string {
  assertQaEmail(email);
  if (!/^[a-z_]+$/.test(phase)) throw new Error("bad phase token");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("bad project id");
  const out = firstLine(psql(
    `update public.projects p set growth_phase_current = ${q(phase)} from public.app_users u where p.id = ${q(projectId)}::uuid and p.user_id = u.id and u.email = ${q(email)} returning p.growth_phase_current;`,
  ));
  if (out !== phase) throw new Error(`setGrowthPhase: expected '${phase}' back, got '${out || "<no row>"}'`);
  return out;
}

/**
 * project_members.role / status for the QA MEMBER address on the QA
 * founder's project. There is no role-change endpoint and a revoked address
 * cannot be re-invited (UNIQUE (project_id, user_email) — product finding,
 * 26-member-lane), so the viewer downgrade is a local SQL step, scoped to
 * both QA addresses. Returns "role:status" read back.
 */
export function setMemberRole(founderEmail: string, memberEmail: string, projectId: string, role: "viewer" | "editor" | "admin"): string {
  assertQaEmail(founderEmail);
  if (!QA_MEMBER_EMAIL_RE.test(memberEmail)) throw new Error(`live-qa db step refused: "${memberEmail}" is not a live-QA member address`);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("bad project id");
  const out = firstLine(psql(
    `update public.project_members m set role = ${q(role)}, status = 'accepted', revoked_at = null from public.projects p, public.app_users u where m.project_id = p.id and p.id = ${q(projectId)}::uuid and p.user_id = u.id and u.email = ${q(founderEmail)} and m.user_email = ${q(memberEmail)} returning m.role || ':' || m.status;`,
  ));
  if (out !== `${role}:accepted`) throw new Error(`setMemberRole: expected '${role}:accepted' back, got '${out || "<no row>"}'`);
  return out;
}

/**
 * app_users.account_type (+ segment) for the QA account — S-IA4 evaluator
 * landing lane. Restore to 'founder' in a `finally`: every other lane runs
 * as a founder. Only the five wizard personas + 'founder' are accepted.
 */
export function setAccountType(email: string, accountType: "founder" | "investor_angel" | "investor_vc" | "advisor" | "accelerator"): string {
  assertQaEmail(email);
  const out = firstLine(psql(
    `update public.app_users set account_type = ${q(accountType)}, segment = ${q(accountType)} where email = ${q(email)} and email ~ '^qa-live-[0-9]{8}-[0-9]{4}@blockid\\.au$' returning account_type;`,
  ));
  if (out !== accountType) throw new Error(`setAccountType: expected '${accountType}' back, got '${out || "<no row>"}'`);
  return out;
}

/** Rows left for the QA email after erasure — must be 0 (tombstones carry a different address). */
export function countAppUsersByEmail(email: string): number {
  assertQaEmail(email);
  return Number(firstLine(psql(`select count(*) from public.app_users where email = ${q(email)};`)) || "0");
}
