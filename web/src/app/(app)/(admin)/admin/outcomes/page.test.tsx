// Colocated test for /admin/outcomes (G21 P3-A): the client view renders the
// queue (startup, kind + summary, source + confidence, status), confirm /
// reject buttons on PROPOSED rows only (any source — admin resolves all),
// the status filter (defaults to proposed) and the empty state; the page
// gate redirects anon → login and non-admin → /admin. AdminLayout mounts
// usePathname → mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/outcomes",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listOutcomesQueue: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/outcomes/service", () => ({ listOutcomesQueue: (...a: unknown[]) => mocks.listOutcomesQueue(...a) }));
vi.mock("server-only", () => ({}));

import type { QueueOutcomeRow } from "@/lib/outcomes/service";
import { OutcomesQueueClient, OutcomesTable } from "./outcomes-client";
import AdminOutcomesPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const PROPOSED: QueueOutcomeRow = {
  id: "o-open",
  project_id: "11111111-2222-4333-8444-555555555555",
  project_name: "Acme",
  kind: "grant_success",
  observed_at: "2026-03-04T00:00:00.000Z",
  value: { program: "AEA Ignite", agency: "DISR", amount_aud: 250000, source_url: "https://grants.gov.au/x" },
  source: "external_signal",
  confidence: 90,
  recorded_by: null,
  status: "proposed",
  confirmed_by: null,
  confirmed_at: null,
  note: "Proposed from the GrantConnect register entry matched on ABN.",
  created_at: "2026-09-20T01:00:00.000Z",
  updated_at: "2026-09-20T01:00:00.000Z",
};
const DONE: QueueOutcomeRow = { ...PROPOSED, id: "o-done", kind: "funding_raised", value: { amount_aud: 500000, round: "seed" }, source: "founder", confidence: 60, status: "confirmed", confirmed_by: "u-1", confirmed_at: "2026-09-20T02:00:00.000Z", note: null };
const ADMIN = { email: "admin@blockid.au", displayName: "Admin" };

describe("<OutcomesTable>", () => {
  it("renders startup, kind + summary, source + confidence, status, source link; confirm / reject on proposed rows only", async () => {
    const out = await html(<OutcomesTable rows={[PROPOSED, DONE]} onResolve={() => {}} />);
    expect(out).toContain('data-testid="outcomes-queue"');
    expect(out).toContain("Acme");
    expect(out).toContain("Grant awarded");
    expect(out).toContain("AEA Ignite · DISR · A$250,000");
    expect(out).toMatch(/Public register(<!-- -->)? · (<!-- -->)?<span/);
    expect(out).toContain('href="https://grants.gov.au/x"');
    expect(out).toContain("A$500,000 · seed");
    expect(out.match(/data-testid="outcome-queue-confirm"/g)).toHaveLength(1);
    expect(out.match(/data-testid="outcome-queue-reject"/g)).toHaveLength(1);
    expect(out).toContain('data-outcome-status="confirmed"');
  });

  it("empty state", async () => {
    expect(await html(<OutcomesTable rows={[]} />)).toContain('data-testid="outcomes-queue-empty"');
  });
});

describe("<OutcomesQueueClient>", () => {
  it("h1, proposed count, the filter defaults to proposed (only proposed rows visible), no forecasting words", async () => {
    const out = await html(<OutcomesQueueClient user={ADMIN} initial={[PROPOSED, DONE]} />);
    expect(out).toMatch(/<h1[^>]*>[\s\S]*Outcomes[\s\S]*<\/h1>/);
    expect(out).toContain('data-testid="outcomes-proposed-count">1<');
    expect(out).toMatch(/aria-pressed="true"[^>]*data-testid="outcomes-filter-proposed"|data-testid="outcomes-filter-proposed"[^>]*aria-pressed="true"/);
    expect(out).toContain('data-outcome-id="o-open"');
    expect(out).not.toContain('data-outcome-id="o-done"');
    expect(out).not.toMatch(/predict|accuracy/i);
  });
});

describe("/admin/outcomes page gate", () => {
  it("anon → login redirect; non-admin → /admin; admin renders the queue", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AdminOutcomesPage()).rejects.toThrow("REDIRECT:/auth/login?next=/admin/outcomes");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "u", email: "f@x.io", role: "user" });
    await expect(AdminOutcomesPage()).rejects.toThrow("REDIRECT:/admin");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "a", email: "admin@blockid.au", role: "user", displayName: "Admin" });
    mocks.listOutcomesQueue.mockResolvedValueOnce([PROPOSED]);
    const out = await html(await AdminOutcomesPage());
    expect(out).toContain('data-outcome-id="o-open"');
    expect(mocks.listOutcomesQueue).toHaveBeenCalledWith(expect.anything(), { status: "all", limit: 300 });
  });
});
