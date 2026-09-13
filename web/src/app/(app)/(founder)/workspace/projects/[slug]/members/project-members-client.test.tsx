// S30-B live QA (P2) — the roster offers a role select on live rows and a
// Re-invite button on revoked rows (a revoked address used to be a dead end:
// no role change, and the re-invite hit 422 duplicate).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectMember } from "@/lib/project-members/scope";
import { ProjectMembersClient } from "./project-members-client";

const base: ProjectMember = {
  id: "m1",
  projectId: "p1",
  userEmail: "sam@example.com",
  userId: "u2",
  role: "editor",
  status: "accepted",
  invitedBy: "u1",
  invitedAt: "2026-09-01T00:00:00Z",
  acceptedAt: "2026-09-02T00:00:00Z",
  revokedAt: null,
  token: "tok",
};

describe("ProjectMembersClient roster actions (S30-B)", () => {
  it("accepted member: role select pre-set to the current role + Revoke; no Re-invite", () => {
    const html = renderToStaticMarkup(<ProjectMembersClient projectId="p1" initialMembers={[base]} />);
    expect(html).toContain("data-testid=\"member-role-select\"");
    expect(html).toMatch(/<option[^>]*value="editor"[^>]*selected=""/);
    expect(html).toContain(">Revoke<");
    expect(html).not.toContain("data-testid=\"member-reinvite\"");
  });

  it("revoked member: Re-invite button, no role select, no Revoke", () => {
    const revoked: ProjectMember = { ...base, status: "revoked", revokedAt: "2026-09-10T00:00:00Z" };
    const html = renderToStaticMarkup(<ProjectMembersClient projectId="p1" initialMembers={[revoked]} />);
    expect(html).toContain("data-testid=\"member-reinvite\"");
    expect(html).toContain(">Re-invite<");
    expect(html).not.toContain("data-testid=\"member-role-select\"");
    expect(html).not.toContain(">Revoke<");
    expect(html).toContain("Revoked");
  });
});
