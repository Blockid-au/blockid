// Colocated spec for the fundraise round page client (S26-A).
//
// Pins the two things a founder must not be surprised by: the Open button
// states the 3-credit compile BEFORE the click (and only when the project
// has no room), and the post-activation toast says exactly what happened to
// the data room. The initial render is a loading state — no fetch fires
// under renderToStaticMarkup, so nothing leaves the box.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoundClient, activateButtonCopy, activationToast } from "./round-client";

describe("activateButtonCopy — transparent pricing", () => {
  it("names the credit cost only when a room will be generated", () => {
    expect(activateButtonCopy(false)).toBe("Open round — generates your data room (3 credits)");
    expect(activateButtonCopy(true)).toBe("Open round — links your data room");
  });
});

describe("activationToast", () => {
  it("says what happened to the room, never claims a room that was not attached", () => {
    expect(activationToast({ id: "r", attached: "generated", creditsUsed: 3 })).toContain("generated and attached (3 credits)");
    expect(activationToast({ id: "r", attached: "existing" })).toContain("existing data room is attached");
    expect(activationToast({ id: null, attached: "none", reason: "insufficient_credits", cost: 3 })).toContain("No data room yet");
    expect(activationToast({ id: null, attached: "none", reason: "feature_locked" })).toContain("not on your plan");
    expect(activationToast({ id: null, attached: "none", reason: "generate_failed" })).toContain("could not be generated");
    // S26 review: a failed compile refunds — the toast says so; a refund that did not land says that instead.
    expect(activationToast({ id: null, attached: "none", reason: "generate_failed", cost: 3, refunded: true })).toContain("nothing was charged");
    expect(activationToast({ id: null, attached: "none", reason: "generate_failed", cost: 3, refunded: false })).toContain("contact support");
  });
});

describe("RoundClient", () => {
  it("renders a polite loading state on the server pass", () => {
    const html = renderToStaticMarkup(<RoundClient roundId="round-1" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading the round");
  });
});
