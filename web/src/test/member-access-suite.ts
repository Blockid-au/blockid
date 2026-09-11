// S18-A — parametrised member-access suite for project-scoped API routes.
//
// Every converted route pins the same four facts:
//   owner      → allowed, data key = the owner's (caller's) own email
//   editor     → allowed on writes, data key = the OWNER's email (shared record)
//   viewer     → 403 on writes / allowed on reads — never a data-key call
//                after a refusal
//   no project → falls back to the caller's OWN data (never another user's)
//   non-member → 404 when the route resolves an explicit project id
//
// The route test supplies `run()` (calls the handler) and the hoisted
// `ScopeState` shared with `projectsMock`. `kind` is the minimum role the
// route is expected to enforce.

import { describe, it, expect } from "vitest";
import type { ScopeState, ScopeRole } from "./project-scope-mock";

export type AccessKind = "read" | "write" | "admin" | "owner";

export interface MemberAccessOptions {
  state: ScopeState;
  run: () => Promise<Response>;
  kind: AccessKind;
  /** Reset per-test mocks (supabase recorders etc.) before each case. */
  reset?: () => void;
  /** Status the happy path answers with (default: any < 400). */
  okStatus?: number;
  /** Which data-key helpers the route is expected to call on success. */
  expectKeyFns?: string[];
  /**
   * How a NON-member is modelled. Cookie routes never see a foreign project
   * (`getProjectScope` resolves `null`) → "own-data". Routes that accept an
   * explicit `?project_id` go through `assertProjectScope` → "404".
   */
  nonMember?: "own-data" | "404";
  /** Skip the no-project fallback case (routes that 4xx without a project). */
  skipNoProject?: boolean;
  /** Extra assertions on the happy-path response for a member. */
  onMemberOk?: (res: Response, body: unknown) => void | Promise<void>;
}

const RANK: Record<ScopeRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const MIN_ROLE: Record<AccessKind, ScopeRole> = {
  read: "viewer",
  write: "editor",
  admin: "admin",
  owner: "owner",
};

function isOk(res: Response, okStatus?: number) {
  return okStatus !== undefined ? res.status === okStatus : res.status < 400;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}

function keyCalls(state: ScopeState) {
  return state.calls.filter((c) => c.fn !== "getProjectIdFromRequest");
}

export function describeMemberAccess(name: string, opts: MemberAccessOptions) {
  const { state, run, kind, okStatus } = opts;
  const minRole = MIN_ROLE[kind];
  const lowestAllowed: ScopeRole = minRole;
  const highestDenied: ScopeRole | null =
    minRole === "viewer" ? null : minRole === "editor" ? "viewer" : minRole === "admin" ? "editor" : "admin";

  const prime = (role: ScopeRole) => {
    opts.reset?.();
    state.calls = [];
    state.nonMember = false;
    state.projectId = "proj-1";
    state.role = role;
  };

  describe(`${name} — member access (min role: ${minRole})`, () => {
    it("owner: allowed; data keyed on the owner's own email", async () => {
      prime("owner");
      const res = await run();
      expect(isOk(res, okStatus), `status ${res.status}: ${JSON.stringify(await safeJson(res))}`).toBe(true);
      // owner-only routes gate at "admin" then check scope.isOwner (the
      // ProjectMemberRole type has no "owner" rank to pass to the helper).
      expect(state.lastMinRole).toBe(kind === "owner" ? "admin" : minRole);
      for (const c of keyCalls(state)) {
        if (c.email !== undefined) expect(c.email).toBe(state.callerEmail);
        expect(c.projectId).toBe("proj-1");
      }
      if (opts.expectKeyFns) {
        for (const fn of opts.expectKeyFns) {
          expect(state.calls.some((c) => c.fn === fn), `expected ${fn} call`).toBe(true);
        }
      }
      expect(state.calls.some((c) => c.fn === "getProjectIdFromRequest")).toBe(false);
    });

    if (lowestAllowed !== "owner") {
      it(`${lowestAllowed}: allowed; data keyed on the OWNER's email, legacy fallback bound to the caller`, async () => {
        prime(lowestAllowed);
        const res = await run();
        expect(isOk(res, okStatus), `status ${res.status}: ${JSON.stringify(await safeJson(res))}`).toBe(true);
        for (const c of keyCalls(state)) {
          if (c.email !== undefined) expect(c.email).toBe(state.ownerEmail);
          expect(c.projectId).toBe("proj-1");
          if (c.fn.endsWith("WithFallback")) {
            expect((c.opts as { callerEmail?: string } | undefined)?.callerEmail).toBe(state.callerEmail);
          }
        }
        if (opts.onMemberOk) await opts.onMemberOk(res, await safeJson(res));
      });
    }

    if (highestDenied) {
      it(`${highestDenied}: 403 before any data-key call`, async () => {
        prime(highestDenied);
        const res = await run();
        expect(res.status).toBe(403);
        expect(keyCalls(state)).toEqual([]);
        const body = (await safeJson(res)) as { code?: string } | null;
        expect(body?.code).toBe("forbidden");
      });
    }

    if (kind === "read") {
      it("viewer: allowed on reads; data keyed on the OWNER's email", async () => {
        prime("viewer");
        const res = await run();
        expect(isOk(res, okStatus), `status ${res.status}: ${JSON.stringify(await safeJson(res))}`).toBe(true);
        for (const c of keyCalls(state)) {
          if (c.email !== undefined) expect(c.email).toBe(state.ownerEmail);
        }
      });
    }

    if (!opts.skipNoProject) {
      it("no active project: falls back to the caller's OWN legacy data", async () => {
        prime("owner");
        state.projectId = null;
        const res = await run();
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(404);
        for (const c of keyCalls(state)) {
          if (c.email !== undefined) expect(c.email).toBe(state.callerEmail);
          expect(c.projectId).toBeNull();
        }
      });
    }

    if (opts.nonMember === "404") {
      it("non-member: 404 (project existence is not revealed)", async () => {
        prime("viewer");
        state.nonMember = true;
        const res = await run();
        expect(res.status).toBe(404);
        expect(keyCalls(state)).toEqual([]);
      });
    }
  });

  return { minRole, rank: RANK[minRole] };
}
