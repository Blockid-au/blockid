// Colocated test for /admin/validation (G22-D): the client view renders the
// h1 outside any gate, the five-rung ladder with actual / target, the
// objections list, the entries table (edit / delete per row, empty state),
// the source-labelled auto rows, the North Star card and the 14-question
// script card; copy says "target" / "actual", never a claim; the page gate
// redirects anon → login and non-admin → /admin. AdminLayout mounts
// usePathname → mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/validation",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), readValidationDashboard: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/validation/auto", () => ({ readValidationDashboard: (...a: unknown[]) => mocks.readValidationDashboard(...a) }));
vi.mock("@/lib/validation/ledger", () => ({ resolveValidationRoot: async () => "/tmp/validation-page-test" }));
vi.mock("server-only", () => ({}));

import { buildDashboard, deriveAutoRows, newEntry, type ValidationDashboard, type ValidationEntry } from "@/lib/validation/model";
import { AutoRowsTable, EntriesTable, ScriptCard, ValidationClient, ValidationLadder } from "./validation-client";
import AdminValidationPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const NOW = new Date("2026-09-21T10:00:00.000Z");
const DONE: ValidationEntry = newEntry({ organisation: "Demo Accelerator", contact_role: "Program manager", date: "2026-09-20", level: 1, outcome: "done", objection: "No budget until July", objection_answered: false, next_step: "Send proposal", note: "Q13: not now" }, "e-done", NOW);
const BOOKED: ValidationEntry = newEntry({ organisation: "Uni Program", contact_role: "", date: "2026-09-25", level: 2, outcome: "booked", objection: "", objection_answered: false, next_step: "", note: "" }, "e-booked", NOW);
const AUTO = deriveAutoRows({
  pilotOrders: [{ id: "o-1", user_id: "u-1", buyer_email: "ops@program.org", sku: "cohort_pilot_25", amount_cents: 150_000, currency: "aud", status: "paid", created_at: "2026-09-10T00:00:00.000Z", metrics: null }],
  applications: [{ id: "a-1", program_name: "Uni Program", cohort_size: 40, intake_month: "2026-11", received_at: "2026-09-18T00:00:00.000Z" }],
  feedbackLetters: [],
  batches: [],
});
const DASHBOARD: ValidationDashboard = buildDashboard({ version: 1, updated_at: "2026-09-21T00:00:00.000Z", entries: [BOOKED, DONE] }, AUTO, {
  north_star: { month: "2026-09", assessed: 3, assessed_all: 5, paying_batches: 1, paying_orgs: 1, partial: null },
  window: { days: 28, from: "2026-08-24", to: "2026-09-21", metrics: [{ key: "revenue.mrr", label: "Revenue · MRR", value: 150_000, unit: "aud_cents" }, { key: "acquisition.leads", label: "Acquisition · leads", value: 4, unit: "count" }] },
  warnings: ["founder_feedback_letters: relation does not exist"],
});
const ADMIN = { email: "admin@blockid.au", displayName: "Admin" };

describe("<ValidationLadder>", () => {
  it("five rungs, actual / target per level, met state from actual ≥ target, progress bars with aria values", async () => {
    const out = await html(<ValidationLadder ladder={DASHBOARD.ladder} />);
    expect(out.match(/data-testid="validation-rung"/g)).toHaveLength(5);
    expect(out).toContain('data-level="1" data-met="0"');
    expect(out).toContain('data-level="4" data-met="1"');
    // React SSR separates adjacent text nodes with <!-- --> comments.
    const strip = (h: string) => h.replace(/<!-- -->/g, "");
    expect(strip(out)).toMatch(/data-testid="validation-actual">1<\/span><span[^>]*> \/ 5</);
    expect(strip(out)).toMatch(/data-testid="validation-actual">1<\/span><span[^>]*> \/ 1</);
    expect(out.match(/role="progressbar"/g)).toHaveLength(5);
    expect(out).toContain("actual / target");
    expect(out).toContain("1 from data");
    expect(out).toContain("1 booked");
  });
});

describe("<EntriesTable> + <AutoRowsTable> + <ScriptCard>", () => {
  it("entries: date, organisation + role, level, outcome chip, objection + next step, edit / delete per row; empty state", async () => {
    const out = await html(<EntriesTable entries={[BOOKED, DONE]} onEdit={() => {}} onDelete={() => {}} />);
    expect(out).toContain('data-testid="validation-entries"');
    expect(out).toContain('data-entry-id="e-done"');
    expect(out).toContain("Demo Accelerator");
    expect(out).toContain("Program manager");
    expect(out).toContain("No budget until July");
    expect(out.replace(/<!-- -->/g, "")).toContain("Next: Send proposal");
    expect(out).toContain('data-entry-outcome="booked"');
    expect(out.match(/data-testid="validation-entry-edit"/g)).toHaveLength(2);
    expect(out.match(/data-testid="validation-entry-delete"/g)).toHaveLength(2);
    expect(await html(<EntriesTable entries={[]} />)).toContain('data-testid="validation-entries-empty"');
  });

  it("auto rows are source-labelled, counted vs signal, never show a full e-mail; empty state", async () => {
    const out = await html(<AutoRowsTable rows={AUTO} />);
    expect(out).toContain('data-auto-source="pilot_orders" data-auto-counts="1"');
    expect(out).toContain('data-auto-source="pilot-applications.jsonl" data-auto-counts="0"');
    expect(out).toContain("program.org");
    expect(out).not.toContain("ops@program.org");
    expect(out).toContain("read-only");
    expect(await html(<AutoRowsTable rows={[]} />)).toContain('data-testid="validation-auto-empty"');
  });

  it("script card: 14 checkboxes, first + last question, ticks not saved", async () => {
    const out = await html(<ScriptCard />);
    expect(out.match(/data-testid="validation-script-q"/g)).toHaveLength(14);
    expect(out).toContain("Walk me through your current intake process");
    expect(out).toContain("Will you pay for the next cohort now?");
    expect(out).toContain("not saved");
    expect(out).toContain('data-testid="validation-script-ticked">0<');
  });
});

describe("<ValidationClient>", () => {
  it("h1 outside any gate, ladder, North Star + window, objections, form, entries, auto rows, script, warnings; honest copy", async () => {
    const out = await html(<ValidationClient user={ADMIN} initial={DASHBOARD} />);
    expect(out).toMatch(/<h1[^>]*>[\s\S]*Validation tracker[\s\S]*<\/h1>/);
    expect(out).toContain('data-testid="validation-ladder"');
    expect(out).toContain('data-testid="validation-north-star-value">3<');
    expect(out.replace(/<!-- -->/g, "")).toContain("Last 28 d");
    expect(out).toContain("A$1,500");
    expect(out).toContain('data-testid="validation-objection"');
    expect(out).toContain("No budget until July");
    expect(out).toContain('data-testid="validation-entry-form"');
    expect(out).toContain('data-testid="validation-entries"');
    expect(out).toContain('data-testid="validation-auto"');
    expect(out).toContain('data-testid="validation-script"');
    expect(out).toContain('data-testid="validation-warnings"');
    expect(out.replace(/<!-- -->/g, "")).toContain("Last edit 2026-09-21");
    expect(out).toContain("target versus actual");
    expect(out).not.toMatch(/guarantee|we have \d+ customers|validated by/i);
    expect(out).not.toMatch(/coming soon|not available yet/i);
  });

  it("empty dashboard: every empty state renders and the h1 is still there", async () => {
    const empty = buildDashboard({ version: 1, updated_at: null, entries: [] }, [], { north_star: null, window: null, warnings: [] });
    const out = await html(<ValidationClient user={ADMIN} initial={empty} />);
    expect(out).toMatch(/<h1[^>]*>[\s\S]*Validation tracker[\s\S]*<\/h1>/);
    expect(out).toContain('data-testid="validation-entries-empty"');
    expect(out).toContain('data-testid="validation-objections-empty"');
    expect(out).toContain('data-testid="validation-auto-empty"');
    expect(out).toContain('data-testid="validation-north-star-value">n/a<');
    expect(out).not.toContain('data-testid="validation-warnings"');
  });
});

describe("/admin/validation page gate", () => {
  it("anon → login redirect; non-admin → /admin; admin renders the dashboard read through lib/validation/auto", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    await expect(AdminValidationPage()).rejects.toThrow("REDIRECT:/auth/login?next=/admin/validation");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "u", email: "f@x.io", role: "user" });
    await expect(AdminValidationPage()).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.readValidationDashboard).not.toHaveBeenCalled();
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "a", email: "admin@blockid.au", role: "user", displayName: "Admin" });
    mocks.readValidationDashboard.mockResolvedValueOnce(DASHBOARD);
    const out = await html(await AdminValidationPage());
    expect(out).toContain('data-entry-id="e-done"');
    expect(mocks.readValidationDashboard).toHaveBeenCalledWith(null, "/tmp/validation-page-test");
  });
});
