// S20-A — request-scoped audit context (AsyncLocalStorage).
//
// `apiRoute()` (./api-route.ts) opens one store per handler invocation. The
// auth + project-scope helpers then annotate it as they run:
//
//   * `getCurrentUser()` / `createSessionRow()` (lib/auth)  → actor
//   * `authenticateRequest()` / `authenticateApiKey()` (lib/api-auth) → actor
//   * `getProjectScope()` / `assertProjectScope()` (lib/projects) → project + role
//   * any handler may call `auditNote()` to attach an entity id / summary
//
// so the wrapper can record WHO did WHAT on WHICH project without every
// route having to call the logger by hand. Outside a store (a page render,
// a cron, a unit test) every setter is a no-op — nothing here can throw
// into business code.
//
// No `server-only` import on purpose (same reasoning as lib/security/
// cron-auth.ts): colocated route tests import the wrapped handlers and must
// not need one more mock. `node:async_hooks` is Node-only — never import
// this module from an edge route (`runtime = "edge"`).

import { AsyncLocalStorage } from "node:async_hooks";
import { isIdLike } from "./redact";

export type AuditActorKind = "user" | "api_key" | "cron" | "anonymous";

export interface AuditContext {
  actorUserId: string | null;
  actorKind: AuditActorKind;
  /** owner | admin | editor | viewer (project role) or the platform role. */
  actorRole: string | null;
  projectId: string | null;
  entityId: string | null;
  /** Redacted, id-only summary a handler may attach via `auditNote()`. */
  note: Record<string, unknown> | null;
}

const storage = new AsyncLocalStorage<AuditContext>();

export function newAuditContext(): AuditContext {
  return {
    actorUserId: null,
    actorKind: "anonymous",
    actorRole: null,
    projectId: null,
    entityId: null,
    note: null,
  };
}

/** Run `fn` inside a fresh audit store. */
export function runWithAuditContext<T>(fn: () => T, seed?: AuditContext): T {
  return storage.run(seed ?? newAuditContext(), fn);
}

/** The current store, or `undefined` when called outside `apiRoute()`. */
export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

export interface SetAuditActorInput {
  userId: string | null;
  kind?: AuditActorKind;
  role?: string | null;
}

/**
 * Record the authenticated principal. A null user id (failed lookup) never
 * erases an actor an earlier successful lookup already set.
 */
export function setAuditActor(input: SetAuditActorInput): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (!input.userId && ctx.actorUserId) return;
  ctx.actorUserId = input.userId ?? null;
  ctx.actorKind = input.kind ?? (input.userId ? "user" : "anonymous");
  if (input.role !== undefined && !ctx.projectId) ctx.actorRole = input.role;
}

export interface SetAuditProjectInput {
  projectId: string;
  role: string | null;
  userId?: string | null;
}

/** Record the project the request resolved to and the caller's role on it. */
export function setAuditProject(input: SetAuditProjectInput): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.projectId = input.projectId;
  ctx.actorRole = input.role ?? ctx.actorRole;
  if (input.userId && !ctx.actorUserId) {
    ctx.actorUserId = input.userId;
    ctx.actorKind = "user";
  }
}

/**
 * Attach an entity id and/or a small id-only summary to the row the
 * wrapper will write. `extra` is redacted at write time; `entityId` is
 * stored verbatim as `resource_id`, so it must pass the same `isIdLike`
 * gate (no emails, tokens, 64+ hex hashes, free text — S20-A review P2-6).
 * A value that fails the gate is dropped, never stored redacted, and an
 * earlier id-like value is kept.
 */
export function auditNote(
  entityId: string | null | undefined,
  extra?: Record<string, unknown>,
): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (entityId) {
    const id = String(entityId);
    if (isIdLike(id)) ctx.entityId = id;
  }
  if (extra) ctx.note = { ...(ctx.note ?? {}), ...extra };
}
