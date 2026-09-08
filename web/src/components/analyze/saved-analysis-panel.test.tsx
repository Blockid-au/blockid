// Colocated spec for SavedAnalysisPanel.
//
// Two things must never regress here:
//   1. a null analysisId renders nothing at all — the save failed, so any
//      "saved" wording would be a lie and any permalink would 404;
//   2. the anonymous copy says "this browser", never "your account". The
//      run is pinned to one httpOnly cookie and a founder who believes
//      otherwise loses it the first time they open a different device.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SavedAnalysisPanel, savedCopyFor } from "./saved-analysis-panel";

describe("savedCopyFor", () => {
  it("claims the account only for a signed-in run", () => {
    const signedIn = savedCopyFor(true);
    expect(signedIn.heading).toBe("Saved to your account");
    expect(signedIn.body).toContain("any device");
  });

  it("is honest about browser-scoped storage for a guest", () => {
    const guest = savedCopyFor(false);
    expect(guest.heading).toBe("Saved to this browser");
    expect(guest.body).toContain("only works here");
    expect(guest.heading).not.toContain("account");
  });

  it("treats unknown session state as a guest, not as an account", () => {
    expect(savedCopyFor(undefined).heading).toBe("Saved to this browser");
  });
});

describe("SavedAnalysisPanel", () => {
  it("renders nothing when the save failed", () => {
    const html = renderToStaticMarkup(
      <SavedAnalysisPanel analysisId={null} authenticated={false} />,
    );
    expect(html).toBe("");
  });

  it("shows the permalink and a sign-up prompt for a guest", () => {
    const html = renderToStaticMarkup(
      <SavedAnalysisPanel analysisId="abc-123" authenticated={false} />,
    );
    expect(html).toContain("/analyze/abc-123");
    expect(html).toContain("Create a free account");
    expect(html).not.toContain("See all your analyses");
  });

  it("points a signed-in founder at their list instead of signup", () => {
    const html = renderToStaticMarkup(
      <SavedAnalysisPanel analysisId="abc-123" authenticated />,
    );
    expect(html).toContain("See all your analyses");
    expect(html).not.toContain("Create a free account");
  });
});
