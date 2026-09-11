// S18-A — shared `@/lib/projects` mock for colocated route tests.
//
// Usage (the state object must come from `vi.hoisted` so the hoisted
// `vi.mock` factory can see it):
//
//   const scopeState = vi.hoisted(() => makeScopeState());
//   vi.mock("@/lib/projects", async () => {
//     const { projectsMock } = await import("@/test/project-scope-mock");
//     return projectsMock(scopeState);
//   });
//
// Then in a test: `scopeState.role = "viewer"` / `scopeState.projectId = null`
// / `scopeState.nonMember = true` and assert on `scopeState.calls`.
//
// The mock mirrors the real contract of `getProjectScope(minRole)`:
//   - no project (projectId null)      → resolves `null`
//   - nonMember                        → throws ProjectAccessError(not_found)
//   - role below minRole               → throws ProjectAccessError(forbidden)
//   - otherwise                        → ProjectScope with `dataEmail` =
//                                        OWNER email for members, caller
//                                        email for the owner.
// The data-key readers record the email/project they were called with so a
// test can pin "member reads the OWNER's record".

export type ScopeRole = "owner" | "admin" | "editor" | "viewer";

export interface ScopeState {
  projectId: string | null;
  role: ScopeRole;
  nonMember: boolean;
  callerEmail: string;
  callerId: string;
  ownerEmail: string;
  ownerId: string;
  /** every data-key helper call, in order */
  calls: Array<{ fn: string; email?: string; projectId: string | null; opts?: unknown }>;
  /** what `findOrCreateSVIAccount` resolves to */
  accountId: string | null;
  /** what `findSVIAccountWithFallback` resolves to */
  account: Record<string, unknown> | null;
  /** what `findLatestAnalysisWithFallback` resolves to */
  analysis: Record<string, unknown> | null;
  /** last minRole passed to getProjectScope / assertProjectScope */
  lastMinRole: string | undefined;
}

export function makeScopeState(overrides: Partial<ScopeState> = {}): ScopeState {
  return {
    projectId: "proj-1",
    role: "owner",
    nonMember: false,
    callerEmail: "caller@x.test",
    callerId: "user-caller",
    ownerEmail: "owner@x.test",
    ownerId: "user-owner",
    calls: [],
    accountId: "acct-1",
    account: { id: "acct-1", email: "owner@x.test", startup_name: "P" },
    analysis: null,
    lastMinRole: undefined,
    ...overrides,
  };
}

const RANK: Record<ScopeRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

function accessError(code: "not_found" | "forbidden") {
  const err = new Error(code) as Error & { code: string; status: number };
  err.name = "ProjectAccessError";
  err.code = code;
  err.status = code === "not_found" ? 404 : 403;
  return err;
}

export function buildScope(state: ScopeState, minRole?: string) {
  state.lastMinRole = minRole;
  if (!state.projectId) return null;
  if (state.nonMember) throw accessError("not_found");
  if (minRole && RANK[state.role] < RANK[minRole as ScopeRole]) {
    throw accessError("forbidden");
  }
  const isOwner = state.role === "owner";
  const ownerId = isOwner ? state.callerId : state.ownerId;
  return {
    projectId: state.projectId,
    project: {
      id: state.projectId,
      slug: "p",
      name: "P",
      userId: ownerId,
      role: state.role,
      isShared: !isOwner,
    },
    role: state.role,
    isOwner,
    userId: state.callerId,
    email: state.callerEmail,
    dataEmail: isOwner ? state.callerEmail : state.ownerEmail,
    ownerUserId: ownerId,
  };
}

export function projectsMock(state: ScopeState) {
  return {
    getProjectScope: async (minRole?: string) => buildScope(state, minRole),
    assertProjectScope: async (
      _user: { id: string; email: string },
      projectId: string,
      minRole?: string,
    ) => {
      const scope = buildScope({ ...state, projectId }, minRole);
      if (!scope) throw accessError("not_found");
      return scope;
    },
    assertProjectAccess: async (_userId: string, projectId: string, minRole?: string) => {
      const scope = buildScope({ ...state, projectId }, minRole);
      if (!scope) throw accessError("not_found");
      return {
        project: scope.project,
        role: scope.role,
        isOwner: scope.isOwner,
        ownerUserId: scope.ownerUserId,
      };
    },
    // Legacy reader — must NOT be used by converted routes; kept so an
    // accidental call is visible in `calls` rather than crashing the mock.
    getProjectIdFromRequest: async () => {
      state.calls.push({ fn: "getProjectIdFromRequest", projectId: state.projectId });
      return state.projectId;
    },
    getProjectById: async (id: string) => ({ id, slug: "p", name: "P", userId: state.ownerId }),
    findOrCreateSVIAccount: async (email: string, projectId: string | null = null) => {
      state.calls.push({ fn: "findOrCreateSVIAccount", email, projectId });
      return state.accountId;
    },
    findSVIAccountWithFallback: async (
      email: string,
      projectId: string | null,
      _cols?: string,
      opts?: unknown,
    ) => {
      state.calls.push({ fn: "findSVIAccountWithFallback", email, projectId, opts });
      return state.account;
    },
    findLatestAnalysisWithFallback: async (
      email: string,
      projectId: string | null,
      _cols?: string,
      opts?: unknown,
    ) => {
      state.calls.push({ fn: "findLatestAnalysisWithFallback", email, projectId, opts });
      return state.analysis;
    },
    creditChargeNote: (scope: { isOwner: boolean } | null | undefined) =>
      !scope || scope.isOwner
        ? "Charged to your credits."
        : "Charged to your own credits — not the project owner's.",
    roleAtLeast: (role: ScopeRole, min: ScopeRole) => RANK[role] >= RANK[min],
    roleCanWrite: (role: ScopeRole | null) => Boolean(role) && RANK[role as ScopeRole] >= 2,
    roleCanAdmin: (role: ScopeRole | null) => Boolean(role) && RANK[role as ScopeRole] >= 3,
    ProjectAccessError: class ProjectAccessError extends Error {
      code: string;
      constructor(msg: string, code: string) {
        super(msg);
        this.name = "ProjectAccessError";
        this.code = code;
      }
      get status() {
        return this.code === "not_found" ? 404 : this.code === "forbidden" ? 403 : 503;
      }
    },
  };
}

/**
 * Adapter for OLDER colocated tests that already mock `@/lib/projects`
 * with their own `getProjectIdFromRequest` / data-key spies: builds the
 * `getProjectScope` + `creditChargeNote` exports on top of those spies.
 *
 *   const scopeRole = vi.hoisted(() => ({ value: "owner" as ScopeRole }));
 *   vi.mock("@/lib/projects", async () => {
 *     const { scopeAdapter } = await import("@/test/project-scope-mock");
 *     return {
 *       ...scopeAdapter(() => mocks.getProjectIdFromRequest(), scopeRole, {
 *         callerEmail: "founder@example.com", callerId: "user-1",
 *       }),
 *       findSVIAccountWithFallback: ...,   // the test's own spies
 *     };
 *   });
 *
 * Owner → `dataEmail` = the caller's own email; member → `ownerEmail`
 * (default owner@x.test) so the shared record is used.
 */
export function scopeAdapter(
  projectIdSource: () => Promise<string | null> | string | null,
  role: { value: ScopeRole },
  ids: { callerEmail: string; callerId: string; ownerEmail?: string; ownerId?: string },
) {
  const ownerEmail = ids.ownerEmail ?? "owner@x.test";
  const ownerId = ids.ownerId ?? "owner-1";
  const build = (projectId: string | null, minRole?: string) => {
    if (!projectId) return null;
    if (minRole && RANK[role.value] < RANK[minRole as ScopeRole]) {
      throw accessError("forbidden");
    }
    const isOwner = role.value === "owner";
    return {
      projectId,
      project: {
        id: projectId,
        slug: "p",
        name: "P",
        userId: isOwner ? ids.callerId : ownerId,
        role: role.value,
        isShared: !isOwner,
      },
      role: role.value,
      isOwner,
      userId: ids.callerId,
      email: ids.callerEmail,
      dataEmail: isOwner ? ids.callerEmail : ownerEmail,
      ownerUserId: isOwner ? ids.callerId : ownerId,
    };
  };
  return {
    getProjectScope: async (minRole?: string) => build(await projectIdSource(), minRole),
    assertProjectScope: async (
      _user: { id: string; email: string },
      projectId: string,
      minRole?: string,
    ) => {
      const scope = build(projectId, minRole);
      if (!scope) throw accessError("not_found");
      return scope;
    },
    creditChargeNote: (scope: { isOwner: boolean } | null | undefined) =>
      !scope || scope.isOwner
        ? "Charged to your credits."
        : "Charged to your own credits — not the project owner's.",
  };
}

/** Data-key calls made with the given helper name. */
export function keyCalls(state: ScopeState, fn: string) {
  return state.calls.filter((c) => c.fn === fn);
}
