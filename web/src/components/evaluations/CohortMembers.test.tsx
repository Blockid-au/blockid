// CohortMembers — pure `initialsOf` tests + static render tests (G21
// P2-B). The invite form only opens on a click, which a static render
// cannot simulate, so the render tests assert its ABSENCE and that the
// toggle button starts aria-expanded=false — the open state itself is a
// plain useState the component owns, nothing left to pin without jsdom.

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }) }));

import { CohortMembers, initialsOf, type CohortMemberView } from "./CohortMembers";

describe("initialsOf", () => {
  it("two-word display name → the first letter of each", () => {
    expect(initialsOf({ displayName: "Pat Nguyen", email: null })).toBe("PN");
  });

  it("single-word display name → its first two letters", () => {
    expect(initialsOf({ displayName: "Pat", email: "pat@example.com" })).toBe("PA");
  });

  it("falls back to the e-mail local part when there is no display name (a '.' splits into two words)", () => {
    expect(initialsOf({ displayName: null, email: "sam.reviewer@fund.vc" })).toBe("SR");
  });

  it("a single-word e-mail local part uses its first two letters", () => {
    expect(initialsOf({ displayName: null, email: "samreviewer@fund.vc" })).toBe("SA");
  });

  it("falls back to a question mark when there is nothing to go on", () => {
    expect(initialsOf({ displayName: null, email: null })).toBe("?");
    expect(initialsOf({ displayName: "   ", email: "" })).toBe("?");
  });
});

const MEMBERS: CohortMemberView[] = [
  { userId: "u-owner", role: "owner", email: "prog@accel.au", displayName: "Pat Nguyen", isCreator: true },
  { userId: "u-rev", role: "reviewer", email: "sam@fund.vc", displayName: "Sam Reviewer", isCreator: false },
];

describe("CohortMembers — render", () => {
  it("renders a member chip per seat with data-role, and the creator has no remove button", () => {
    const out = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage available />);
    expect((out.match(/data-testid="cohort-member"/g) ?? []).length).toBe(2);
    expect(out).toContain('data-role="owner"');
    expect(out).toContain('data-role="reviewer"');
    // Creator (owner) chip has no aria-label remove button for Pat Nguyen.
    expect(out).not.toMatch(/aria-label="Remove Pat Nguyen from the cohort"/);
  });

  it("a non-creator gets an aria-label remove button when canManage", () => {
    const out = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage available />);
    expect(out).toContain('aria-label="Remove Sam Reviewer from the cohort"');
  });

  it("no remove buttons at all when canManage is false", () => {
    const out = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage={false} available />);
    expect(out).not.toContain("Remove ");
  });

  it("invite-reviewer-toggle only renders when canManage", () => {
    const owner = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage available />);
    expect(owner).toContain('data-testid="invite-reviewer-toggle"');

    const viewer = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage={false} available />);
    expect(viewer).not.toContain('data-testid="invite-reviewer-toggle"');
  });

  it("the invite form is not rendered until opened, and the toggle starts collapsed", () => {
    const out = renderToStaticMarkup(<CohortMembers batchId="b-1" members={MEMBERS} canManage available />);
    expect(out).not.toContain('data-testid="invite-reviewer-form"');
    expect(out).not.toContain('data-testid="invite-email"');
    const toggle = out.match(/<button[^>]*data-testid="invite-reviewer-toggle"[^>]*>/)?.[0] ?? "";
    expect(toggle).toContain('aria-expanded="false"');
  });
});
