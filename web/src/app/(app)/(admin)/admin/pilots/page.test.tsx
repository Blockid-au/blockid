// Colocated test for /admin/pilots (G16-C; a read-only ledger since G25):
// the client view renders the table (program, MASKED e-mail only, tier, days
// left, counts, status), the "End early" button on active rows only, the
// "No new pilots" notice instead of a start form (no /pilot link, no
// checkout), the tier / price caption from props, the inbox link, the last
// applications of the retired form, and the empty states. The page gate
// redirects anon → login and non-admin → /admin. AdminLayout mounts
// usePathname → mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/pilots",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listPilots: vi.fn(), readApplications: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/pilots/service", () => ({ listPilots: () => mocks.listPilots() }));
vi.mock("@/lib/pilots/applications", () => ({ readApplications: () => mocks.readApplications() }));
vi.mock("@/lib/pilots/ledger", () => ({ resolvePilotsRoot: async () => "/tmp/x" }));

import type { PilotListRow } from "@/lib/pilots/service";
import type { PilotApplication } from "@/lib/pilots/applications";
import { PilotsClient, PilotsTable } from "./pilots-client";
import AdminPilotsPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const ROW: PilotListRow = {
  id: "p-1",
  user_id: "u-1",
  email: "evaluator@program.org",
  email_masked: "e***@program.org",
  program_name: "Demo Accelerator",
  tier: "investor_vc_small",
  previous_plan: "investor_angel",
  started_at: "2026-09-19T04:20:00.000Z",
  expires_at: "2026-10-19T04:20:00.000Z",
  credits_granted: 180,
  intake_id: "i-1",
  intake_slug: "demo-abcdefgh",
  intake_url: "https://blockid.au/apply/demo-abcdefgh",
  status: "active",
  ended_at: null,
  ended_reason: null,
  reminder_sent_at: null,
  plan_reverted: null,
  updated_at: "2026-09-19T04:20:00.000Z",
  started_by: "admin@blockid.au",
  note: null,
  days_left: 12,
  submissions: 7,
  reports_run: 4,
  assessments: 2,
};
const ENDED: PilotListRow = { ...ROW, id: "p-2", email_masked: "o***@x.io", program_name: "Old Cohort", status: "ended", ended_reason: "converted", plan_reverted: false, days_left: -3, intake_url: null, intake_slug: null };
const APP: PilotApplication = { id: "a-1", received_at: "2026-09-18T10:00:00.000Z", ip_hash: "abc", program_name: "Uni Program", contact_name: "Pat Lee", email: "pat@uni.edu", cohort_size: 40, intake_month: "2026-11", message: "Cohort 7" };
const DEFAULTS = { programPrice: "A$349", tier: "investor_vc_small" };
const USER = { email: "admin@blockid.au", displayName: null };

describe("PilotsClient", () => {
  it("renders the table with masked e-mails only, tier, days left, counts, status, intake link, End early on active rows only", async () => {
    const out = await html(<PilotsClient user={USER} initial={{ pilots: [ROW, ENDED], active: 1, cap: 5 }} applications={[]} defaults={DEFAULTS} />);
    expect(out).toContain("<h1");
    expect(out).toContain('data-testid="pilots-table"');
    expect((out.match(/data-testid="pilot-row"/g) ?? []).length).toBe(2);
    expect(out).toContain("e***@program.org");
    expect(out).not.toContain("evaluator@program.org");
    expect(out).toContain("investor_vc_small");
    expect(out).toContain("was investor_angel");
    expect(out).toContain('data-testid="pilot-days-left">12<');
    expect(out).toContain(">7<");
    expect(out).toContain(">4<");
    expect(out).toContain(">2<");
    expect(out).toContain('data-status="active"');
    expect(out).toContain('data-status="ended"');
    expect(out).toContain("converted · plan kept");
    expect(out).toContain('href="https://blockid.au/apply/demo-abcdefgh"');
    expect((out.match(/data-testid="pilot-end-early"/g) ?? []).length).toBe(1);
    expect(out).toContain('data-testid="pilots-active">1<');
  });

  it("G25: no start form — the retired notice, tier / price caption from props, links to the inbox and /admin/validation (never /pilot); applications listed", async () => {
    const out = await html(<PilotsClient user={USER} initial={{ pilots: [], active: 0, cap: 5 }} applications={[APP]} defaults={DEFAULTS} />);
    expect(out).not.toContain('data-testid="pilot-start-form"');
    expect(out).not.toContain('name="program_name"');
    expect(out).toContain('data-testid="pilots-retired"');
    expect(out).toContain("No new pilots");
    expect(out).toContain("A$349/mo list");
    expect(out).toContain("never a Stripe coupon");
    expect(out).toContain('href="/workspace/accelerator/applications"');
    expect(out).toContain('href="/admin/validation"');
    expect(out).not.toContain('href="/pilot"');
    expect(out).toContain('data-testid="pilots-empty"');
    expect(out).toContain('data-testid="pilot-applications"');
    expect(out).toContain("Uni Program");
    expect(out).toContain("pat@uni.edu");
    expect(out).toContain("2026-11");
    expect(out).not.toContain("<script");
  });

  it("empty applications state; PilotsTable without onEnd renders no buttons", async () => {
    const out = await html(<PilotsClient user={USER} initial={{ pilots: [], active: 0, cap: 5 }} applications={[]} defaults={DEFAULTS} />);
    expect(out).toContain('data-testid="pilot-applications-empty"');
    const table = await html(<PilotsTable pilots={[ROW]} />);
    expect(table).not.toContain('data-testid="pilot-end-early"');
  });
});

describe("AdminPilotsPage gate", () => {
  it("anon → login redirect; non-admin → /admin; admin renders with the loaded data", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AdminPilotsPage()).rejects.toThrow("REDIRECT:/auth/login?next=/admin/pilots");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "u", email: "f@x.io", role: "user", displayName: null });
    await expect(AdminPilotsPage()).rejects.toThrow("REDIRECT:/admin");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "a", email: "admin@blockid.au", role: "admin", displayName: "Admin" });
    mocks.listPilots.mockResolvedValueOnce({ pilots: [ROW], active: 1, cap: 5 });
    mocks.readApplications.mockResolvedValueOnce([APP]);
    const out = await html(await AdminPilotsPage());
    expect(out).toContain("Demo Accelerator");
    expect(out).toContain("Uni Program");
    expect(out).toContain('data-testid="pilots-retired"');
    expect(out).not.toContain('data-testid="pilot-start-form"');
  });
});
