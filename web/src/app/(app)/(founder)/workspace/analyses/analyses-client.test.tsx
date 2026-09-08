// Colocated spec for the "Your analyses" list.
//
// The rule this pins: GET /api/analyses always answers 200, and an empty
// array means "no runs yet" — never "sign in". A regression that turned the
// empty list into a sign-in wall would tell a founder who is demonstrably
// signed in (the page is behind the workspace redirect) that they are not.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AnalysesClient, resolveListState } from "./analyses-client";

describe("resolveListState", () => {
  it("treats an empty array as a real, successful, empty list", () => {
    expect(resolveListState({ ok: true, body: { ok: true, analyses: [] } })).toEqual({
      status: "ready",
      rows: [],
    });
  });

  it("keeps the rows on a populated list", () => {
    const state = resolveListState({
      ok: true,
      body: { ok: true, analyses: [{ id: "a" }] },
    });
    expect(state.status).toBe("ready");
    expect(state.status === "ready" && state.rows).toHaveLength(1);
  });

  it("errors only on a genuine transport or shape failure", () => {
    expect(resolveListState({ ok: false })).toEqual({ status: "error" });
    expect(resolveListState({ ok: true, body: null })).toEqual({ status: "error" });
    expect(resolveListState({ ok: true, body: { ok: true } })).toEqual({
      status: "error",
    });
  });
});

describe("AnalysesClient", () => {
  it("opens on a loading state, not an empty state", () => {
    const html = renderToStaticMarkup(<AnalysesClient />);
    expect(html).toContain("Loading your analyses");
    expect(html).not.toContain("No analyses yet");
  });

  it("never offers a sign-in prompt", () => {
    const html = renderToStaticMarkup(<AnalysesClient claimed={2} />);
    expect(html.toLowerCase()).not.toContain("sign in");
    expect(html.toLowerCase()).not.toContain("log in");
  });

  it("uses the real claim count when one is passed through", () => {
    const html = renderToStaticMarkup(<AnalysesClient claimed={2} />);
    expect(html).toContain("2 analyses you ran before signing up");
  });
});
