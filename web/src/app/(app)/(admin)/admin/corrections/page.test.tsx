// Colocated test for /admin/corrections (G21 P1-C): the client view renders
// the queue (startup, founder e-mail, kind + target, proposed value, status,
// resolution), accept / reject buttons on OPEN rows only, the status filter
// (defaults to open), and the empty state. The page gate redirects anon →
// login and non-admin → /admin. AdminLayout mounts usePathname → mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/corrections",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listCorrections: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/corrections/service", () => ({ listCorrections: (...a: unknown[]) => mocks.listCorrections(...a) }));

import type { AdminCorrectionRow } from "@/lib/corrections/service";
import { CorrectionsQueueClient, CorrectionsTable } from "./corrections-client";
import AdminCorrectionsPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const OPEN: AdminCorrectionRow = {
  id: "c-open",
  project_id: "p-1",
  project_name: "Acme",
  founder_email: "f@acme.io",
  kind: "wrong_sector_stage",
  target_ref: "profile:sector",
  message: "We are fintech, not saas.",
  proposed: { industry: "fintech" },
  status: "open",
  submitted_by: "u-1",
  resolved_by: null,
  resolution: null,
  resolved_at: null,
  created_at: "2026-09-20T01:00:00.000Z",
  updated_at: "2026-09-20T01:00:00.000Z",
};
const DONE: AdminCorrectionRow = { ...OPEN, id: "c-done", kind: "stale_data", target_ref: "dimension:tre", proposed: {}, status: "accepted", resolution: "Accepted — recorded against the record.", resolved_at: "2026-09-20T02:00:00.000Z" };
const ADMIN = { email: "admin@blockid.au", displayName: "Admin" };

describe("CorrectionsTable", () => {
  it("renders startup, founder e-mail, kind + target, proposed value, status and resolution; accept / reject only on open rows", async () => {
    const out = await html(<CorrectionsTable rows={[OPEN, DONE]} onResolve={() => {}} />);
    expect(out).toContain('data-testid="corrections-queue"');
    expect(out).toContain("Acme");
    expect(out).toContain("f@acme.io");
    expect(out).toContain("Wrong sector / stage");
    expect(out).toContain("Sector (industry) on the startup record");
    expect(out).toContain("sector → fintech");
    expect(out).toContain("Traction &amp; Revenue Evidence");
    expect(out).toContain("Accepted — recorded against the record.");
    expect((out.match(/data-testid="correction-accept"/g) ?? []).length).toBe(1);
    expect((out.match(/data-testid="correction-reject"/g) ?? []).length).toBe(1);
    expect(out).toContain('data-status="open"');
    expect(out).toContain('data-status="accepted"');
  });

  it("empty state", async () => {
    const out = await html(<CorrectionsTable rows={[]} />);
    expect(out).toContain('data-testid="corrections-queue-empty"');
  });
});

describe("CorrectionsQueueClient", () => {
  it("h1, open count, the four filters with counts, default filter = open (accepted row hidden)", async () => {
    const out = await html(<CorrectionsQueueClient user={ADMIN} initial={[OPEN, DONE]} />);
    expect(out).toMatch(/<h1[^>]*>[\s\S]*Corrections[\s\S]*<\/h1>/);
    expect(out).toContain('data-testid="corrections-open-count">1<');
    for (const f of ["open", "accepted", "rejected", "all"]) expect(out).toContain(`data-testid="corrections-filter-${f}"`);
    expect(out).toContain('data-correction-id="c-open"');
    expect(out).not.toContain('data-correction-id="c-done"');
    expect(out).toContain("only a sector / stage correction with a proposed value writes anything");
  });
});

describe("/admin/corrections page gate", () => {
  it("anon → login; founder → /admin; admin → the queue", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AdminCorrectionsPage()).rejects.toThrow("REDIRECT:/auth/login?next=/admin/corrections");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "u", email: "f@x.io", role: "user" });
    await expect(AdminCorrectionsPage()).rejects.toThrow("REDIRECT:/admin");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "a", email: "admin@blockid.au", role: "admin", displayName: "Admin" });
    mocks.listCorrections.mockResolvedValueOnce([OPEN]);
    const out = await html(await AdminCorrectionsPage());
    expect(out).toContain('data-correction-id="c-open"');
    expect(mocks.listCorrections).toHaveBeenCalledWith(expect.anything(), { status: "all", limit: 300 });
  });
});
