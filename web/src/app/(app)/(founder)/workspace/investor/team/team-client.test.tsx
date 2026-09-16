// Render test for the seats page client (G13-W5-D3 E4.5 / F4). Pins: the
// members + open invites list with the owner chip and the seat usage line,
// the invite form for the owner only, the submit disabled + plan-limit
// message when every seat is in use (F4 — upgrade link, no Stripe), the
// "not available" line before 0393 / 0403, and the accept banner state
// when a token is present.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamClient, type TeamClientProps } from "./team-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }) }));

function props(over: Partial<TeamClientProps> = {}): TeamClientProps {
  return {
    inviteToken: null,
    evaluator: true,
    available: true,
    org: { id: "org-1", name: "Blue Fund", kind: "vc", isPersonal: true },
    isOwner: true,
    members: [
      { id: "m-1", userId: "u-me", role: "investment_partner", displayName: "Mia", email: "me@fund.vc", isOwner: true, joinedAt: "x" },
      { id: "m-2", userId: "u-b", role: "ic_member", displayName: "Ben", email: "ben@fund.vc", isOwner: false, joinedAt: "x" },
    ],
    invites: [{ id: "i-1", email: "cara@fund.vc", role: "investor_analyst", expiresAt: "2099-01-01T00:00:00Z" }],
    seats: { limit: 3, used: 3 },
    upgradeHint: "Program (A$349/mo) includes 5 seats.",
    viewerEmail: "me@fund.vc",
    ...over,
  };
}

describe("TeamClient", () => {
  it("lists seats + invites with roles, marks the owner and 'you', shows the usage line and the remove / revoke buttons for the owner", () => {
    const out = renderToStaticMarkup(<TeamClient {...props()} />);
    expect(out).toContain("Blue Fund");
    expect(out).toContain("3 of 3 seats in use");
    expect((out.match(/data-testid="seat-member"/g) ?? []).length).toBe(2);
    expect((out.match(/data-testid="seat-invite"/g) ?? []).length).toBe(1);
    expect(out).toContain(">Owner<");
    expect(out).toContain(">IC member<");
    expect(out).toContain(">you<");
    expect(out).toContain("Invited · Analyst");
    expect(out).toContain("Remove seat");
    expect(out).toContain("Revoke");
  });

  it("F4: with every seat in use the submit is disabled and the plan-limit message links to the evaluator pricing (no Stripe)", () => {
    const out = renderToStaticMarkup(<TeamClient {...props()} />);
    expect(out).toContain('data-testid="team-invite"');
    expect(out).toMatch(/<button type="submit" disabled=""[^>]*data-testid="invite-submit"/);
    expect(out).toContain('data-testid="seat-limit"');
    expect(out).toContain("Program (A$349/mo) includes 5 seats.");
    expect(out).toContain('href="/pricing?segment=evaluator"');
    const free = renderToStaticMarkup(<TeamClient {...props({ seats: { limit: 3, used: 2 } })} />);
    expect(free).not.toMatch(/<button type="submit" disabled=""/);
    expect(free).not.toContain('data-testid="seat-limit"');
  });

  it("a non-owner seat sees the list but no invite form; unlimited plans print 'unlimited seats'", () => {
    const out = renderToStaticMarkup(<TeamClient {...props({ isOwner: false, seats: { limit: null, used: 7 } })} />);
    expect(out).not.toContain('data-testid="team-invite"');
    expect(out).toContain("Only the organisation owner can invite or remove seats.");
    expect(out).toContain("unlimited seats");
    expect(out).not.toContain("Remove seat");
  });

  it("pre-migration → the honest 'not available' line; an invite token → the accepting banner", () => {
    const na = renderToStaticMarkup(<TeamClient {...props({ available: false, org: null })} />);
    expect(na).toContain('data-testid="team-unavailable"');
    expect(na).not.toContain('data-testid="team-members"');
    const accepting = renderToStaticMarkup(<TeamClient {...props({ inviteToken: "a".repeat(24), evaluator: false, available: false, org: null })} />);
    expect(accepting).toContain('data-testid="accept-banner"');
    expect(accepting).toContain("Accepting your seat");
  });
});
