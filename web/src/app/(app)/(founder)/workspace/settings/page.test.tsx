// Colocated tests for /workspace/settings — Account settings (S24-B).
// Static render (renderToStaticMarkup — no @testing-library here). Pins the
// "Delete account" section states: idle (password vs passwordless), pending
// (Keep my account), admin (refused), the grace explanation, the query-flag
// messages, and the page's pure helpers.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("@/components/workspace/workspace-layout", () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => children }));

import { DeleteAccountSection, type DeletionStatusView } from "./delete-account-section";
import { readFlags, toDeletionView } from "./page";

const base: DeletionStatusView = { pending: false, requestedAt: null, scheduledFor: null, hasPassword: true, erased: false, graceDays: 7, isAdmin: false };

function html(props: Partial<React.ComponentProps<typeof DeleteAccountSection>> & { initial?: Partial<DeletionStatusView> }) {
  const { initial, ...rest } = props;
  return renderToStaticMarkup(<DeleteAccountSection initial={{ ...base, ...initial }} {...rest} />);
}

describe("DeleteAccountSection", () => {
  it("idle: explains the 7-day grace + what is kept, offers the Delete button only", () => {
    const out = html({});
    expect(out).toContain("Delete account");
    expect(out).toContain("7-day grace period");
    expect(out).toContain("7-year period");
    expect(out).toContain("cancels any Stripe subscription");
    expect(out).toContain("Delete my account…");
    expect(out).not.toContain("Schedule deletion");
    expect(out).not.toContain("Keep my account");
  });

  it("pending: shows the scheduled date and the Keep my account button", () => {
    const out = html({ initial: { pending: true, scheduledFor: "2026-09-19T10:00:00.000Z", requestedAt: "2026-09-12T10:00:00.000Z" } });
    expect(out).toContain("Deletion scheduled for");
    expect(out).toContain("Keep my account");
    expect(out).not.toContain("Delete my account…");
  });

  it("admin: refused with pointer to the admin console", () => {
    const out = html({ initial: { isAdmin: true } });
    expect(out).toContain("Admin accounts cannot be deleted from here");
    expect(out).not.toContain("Delete my account…");
  });

  it("re-auth link opens the form pre-confirmed; passwordless users see the email step", () => {
    const withToken = html({ reauthToken: "t".repeat(32), initial: { hasPassword: false } });
    expect(withToken).toContain("Email confirmed");
    expect(withToken).toContain("Schedule deletion");
    expect(withToken).toContain("Type <strong>DELETE</strong>");
    expect(withToken).not.toContain("Your password");
    expect(withToken).not.toContain("Email me a confirmation link");
  });

  it("query flags render the cancel outcome", () => {
    expect(html({ flag: "cancelled" })).toContain("Deletion cancelled");
    expect(html({ flag: "invalid" })).toContain("no longer valid");
    expect(html({ flag: null })).not.toContain("Deletion cancelled");
  });
});

describe("page helpers", () => {
  it("toDeletionView maps a status row (or null) with the grace constant", () => {
    expect(toDeletionView(null, false)).toEqual({ ...base, hasPassword: false });
    expect(toDeletionView({ pending: true, requestedAt: "r", scheduledFor: "s", hasPassword: true, erased: false }, true)).toEqual({
      pending: true,
      requestedAt: "r",
      scheduledFor: "s",
      hasPassword: true,
      erased: false,
      graceDays: 7,
      isAdmin: true,
    });
  });

  it("readFlags accepts only a long token and the two known deletion flags", () => {
    expect(readFlags({})).toEqual({ reauthToken: null, flag: null });
    expect(readFlags({ delete_token: "short", deletion: "weird" })).toEqual({ reauthToken: null, flag: null });
    expect(readFlags({ delete_token: "x".repeat(32), deletion: "cancelled" })).toEqual({ reauthToken: "x".repeat(32), flag: "cancelled" });
    expect(readFlags({ delete_token: ["a"], deletion: "invalid" })).toEqual({ reauthToken: null, flag: "invalid" });
  });
});
