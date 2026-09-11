// Colocated tests for AcceptInviteClient — S17-A review P2-5.
//
// Static render (renderToStaticMarkup — this workspace does not install
// @testing-library/react). Pins the invitee-facing half of the email
// binding: when the signed-in email differs from the invited email the
// Accept button is NOT offered and the page says exactly which address to
// sign in with; when they match the Accept button renders as before.

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { AcceptInviteClient } from "./accept-invite-client";

function html(props: { token: string; expectedEmail: string; currentEmail: string }): string {
  return renderToStaticMarkup(<AcceptInviteClient {...props} />);
}

describe("AcceptInviteClient — P2-5 email binding", () => {
  it("email mismatch: no Accept button; clear message naming both addresses + a switch-account action", () => {
    const out = html({ token: "tok", expectedEmail: "carol@corp.io", currentEmail: "me@other.io" });
    expect(out).not.toContain("Accept invitation");
    expect(out).toContain('role="alert"');
    expect(out).toContain("me@other.io");
    expect(out).toContain("carol@corp.io");
    expect(out).toContain("Invites can only be accepted by the email address they were sent to");
    expect(out).toContain("Sign in as carol@corp.io");
  });

  it("matching email (case-insensitive, whitespace-insensitive): Accept button renders, no mismatch alert", () => {
    const out = html({ token: "tok", expectedEmail: "Carol@Corp.io", currentEmail: " carol@corp.io " });
    expect(out).toContain("Accept invitation");
    expect(out).not.toContain("Invites can only be accepted");
    expect(out).not.toContain('role="alert"');
  });
});
