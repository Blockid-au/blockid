// S31-E: the dashboard tiles no longer show raw API slugs / err.message.
// No DOM environment in this workspace, so the mount-time fetch cannot run;
// the initial markup is asserted here and the copy the tile derives from the
// nudge route's real failure bodies is pinned through the same helper call
// the component makes.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";
import { NextStepTile } from "./next-step-tile";

const FALLBACK = "Could not load your next step right now.";

describe("NextStepTile", () => {
  it("renders the loading state without an alert", () => {
    const html = renderToStaticMarkup(<NextStepTile />);
    expect(html).not.toContain("unknown_error");
    expect(html).not.toContain("fetch_failed");
  });

  it("maps the nudge route's failure bodies to user copy, never the slug", () => {
    expect(userErrorMessage(ApiError.fromBody(401, { ok: false, error: "unauthorized" }), FALLBACK)).toBe("Please sign in again.");
    expect(userErrorMessage(ApiError.fromBody(500, { ok: false, error: "no_readiness_payload" }), FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage(ApiError.fromBody(200, { ok: false, error: "unknown_error" }), FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage(new TypeError("Failed to fetch"), FALLBACK)).toContain("Connection problem");
  });
});
