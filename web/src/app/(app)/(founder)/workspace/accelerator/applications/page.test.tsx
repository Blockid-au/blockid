import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/accelerator/applications — the Intake inbox
// (G14 S35) with the data layer mocked. Pins: login redirect, the locked
// card for a founder-track user (no data read), the empty states, and the
// scored table (SVI, coverage heat, status chip, dossier link, "Score now"
// only for an unscored row with an evaluation, CSV export href). The
// NotAvailableYet stub is gone (not-available-yet.test.tsx no longer lists
// this page). Pure helpers of the client are pinned below.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("@/components/legal/evaluator-report-disclaimer", () => ({
  EvaluatorReportDisclaimer: () => <p data-disclaimer />,
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error("REDIRECT:" + url);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/accelerator/applications",
}));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
const canManageMock = vi.fn();
vi.mock("@/lib/intake/access", () => ({ canManageIntake: (u: unknown) => canManageMock(u) }));
const listIntakesMock = vi.fn();
const listRowsMock = vi.fn();
vi.mock("@/lib/intake/program-intakes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intake/program-intakes")>("@/lib/intake/program-intakes");
  return { ...actual, listMyIntakes: (u: string) => listIntakesMock(u), listInboxRows: (u: string) => listRowsMock(u) };
});

import { coverageCells, sortInboxRows } from "./intake-inbox-client";
import type { InboxRow, IntakeWithCounts } from "@/lib/intake/program-intakes";

const USER = { id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "accelerator_intake" };
const INTAKE: IntakeWithCounts = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "u-1",
  orgId: null,
  slug: "cohort-5-abcdefgh",
  name: "Cohort 5",
  blurb: null,
  opensAt: null,
  closesAt: null,
  maxSubmissions: 200,
  autoReport: false,
  status: "open",
  createdAt: "2026-09-16T00:00:00Z",
  updatedAt: "2026-09-16T00:00:00Z",
  submissionCount: 2,
  publicUrl: "https://blockid.au/apply/cohort-5-abcdefgh",
};
const row = (over: Partial<InboxRow>): InboxRow => ({
  id: "s-1",
  intakeId: INTAKE.id,
  evaluationId: "ev-1",
  projectId: "p-1",
  founderEmail: "ann@alpha.io",
  founderName: "Ann",
  startupName: "Alpha",
  website: "https://alpha.io",
  deckStoragePath: null,
  pitchdeckAnalysisId: null,
  status: "received",
  sviTotal: null,
  coverage: { ftv: { level: "strong" }, mpc: { level: "partial" }, tre: { level: "missing" } },
  warnings: [],
  submittedAt: "2026-09-16T10:00:00Z",
  intakeName: "Cohort 5",
  intakeSlug: INTAKE.slug,
  latestSvi: null,
  dossierUrl: "/workspace/evaluations/ev-1",
  ...over,
});

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  canManageMock.mockReset().mockResolvedValue(true);
  listIntakesMock.mockReset().mockResolvedValue([INTAKE]);
  listRowsMock.mockReset().mockResolvedValue([]);
});

describe("/workspace/accelerator/applications — intake inbox", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/accelerator/applications");
  });

  it("founder-track user: locked card with evaluator pricing, no data read, no NotAvailableYet", async () => {
    canManageMock.mockResolvedValue(false);
    const out = await html();
    expect(out).toContain('data-testid="intake-locked"');
    expect(out).toContain("/pricing?segment=evaluator");
    expect(out).not.toContain("not-available-yet");
    expect(listIntakesMock).not.toHaveBeenCalled();
    expect(listRowsMock).not.toHaveBeenCalled();
  });

  it("evaluator with a link but no applications: link card with URL + copy, both empty states", async () => {
    const out = await html();
    expect(out).toContain('data-testid="intake-inbox"');
    expect(out).toContain('data-testid="intake-link-card"');
    expect(out).toContain("https://blockid.au/apply/cohort-5-abcdefgh");
    expect(out.replace(/<!-- -->/g, "")).toContain("2 / 200 applications");
    expect(out).toContain('data-testid="intake-rows-empty"');
    expect(out).toContain('data-testid="intake-create-open"');
    expect(out).toContain('href="/api/intake/links/all/export.csv"');
    expect(listIntakesMock).toHaveBeenCalledWith("u-1");
  });

  it("scored table: SVI, heat, chip, dossier link, Score now only for an unscored row with an evaluation", async () => {
    listRowsMock.mockResolvedValue([
      row({ id: "s-1" }),
      row({ id: "s-2", startupName: "Beta", status: "scored", latestSvi: 71.4, evaluationId: "ev-2", dossierUrl: "/workspace/evaluations/ev-2" }),
      row({ id: "s-3", startupName: "Gamma", evaluationId: null, dossierUrl: null, coverage: null, warnings: ["evaluation_not_created: evaluation_limit_reached"] }),
      row({ id: "s-4", startupName: "Delta", evaluationId: null, dossierUrl: null, coverage: null, warnings: ["evaluation_threw: boom"] }),
    ]);
    const out = await html();
    expect(out).toContain('data-testid="intake-table"');
    expect((out.match(/data-testid="intake-row"/g) ?? []).length).toBe(4);
    expect(out).toContain('href="/workspace/evaluations/ev-2"');
    expect(out).toContain(">71<");
    expect(out).toContain("Scored");
    expect((out.match(/data-testid="intake-score-now"/g) ?? []).length).toBe(1);
    // Quota-limited row → upgrade link (G14-S35 review); any other failure → "No dossier".
    expect((out.match(/data-testid="intake-limit-upgrade"/g) ?? []).length).toBe(1);
    expect(out).toContain('href="/pricing?segment=evaluator&amp;feature=evaluations"');
    expect(out).toContain("Plan limit — upgrade");
    expect(out).toContain("No dossier");
    expect(out).toContain('aria-label="Deck not classified yet"');
    expect(out).toContain('aria-label="Coverage: 1 strong, 1 partial, 6 missing"');
  });
});

describe("intake-inbox-client — pure helpers", () => {
  it("sortInboxRows: SVI desc puts unscored last; startup asc; submitted desc default", () => {
    const rows = [row({ id: "a", startupName: "Zed", latestSvi: null, submittedAt: "2026-09-16T10:00:00Z" }), row({ id: "b", startupName: "Amy", latestSvi: 50, submittedAt: "2026-09-15T10:00:00Z" }), row({ id: "c", startupName: "Mia", latestSvi: 80, submittedAt: "2026-09-17T10:00:00Z" })];
    expect(sortInboxRows(rows, "svi", "desc").map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortInboxRows(rows, "svi", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortInboxRows(rows, "startup", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortInboxRows(rows, "submitted", "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("coverageCells: 8 cells in DIM order, unknown → none", () => {
    const cells = coverageCells({ ftv: { level: "strong" }, svm: { level: "weird" } });
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({ dim: "ftv", level: "strong" });
    expect(cells[7]).toEqual({ dim: "svm", level: "none" });
    expect(coverageCells(null).every((c) => c.level === "none")).toBe(true);
  });
});
