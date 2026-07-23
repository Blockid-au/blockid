// SandboxBanner render tests — CLO D4-CLO-06.
//
// Focus: the banner MUST render only when `isSandbox === true`. A false-flag
// render would spam every workspace with a persistent yellow warning; a
// missed render on a true-flag would defeat the whole PI-safety guarantee.
//
// We render with `react-dom/server`'s `renderToStaticMarkup` — cheap, no
// JSDOM dependency, and enough to inspect the emitted HTML for the marker
// data-testid.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SandboxBanner } from "./sandbox-banner";

const MARKER = 'data-testid="reseller-sandbox-banner"';

describe("SandboxBanner", () => {
  it("renders the persistent warning + AUP link when isSandbox=true", () => {
    const html = renderToStaticMarkup(createElement(SandboxBanner, { isSandbox: true }));
    expect(html).toContain(MARKER);
    // Copy anchors — the EN version is the SSR default (server locale = "en").
    expect(html).toContain("TEST workspace");
    expect(html).toContain('href="/legal/acceptable-use"');
  });

  it("renders nothing when isSandbox=false", () => {
    const html = renderToStaticMarkup(createElement(SandboxBanner, { isSandbox: false }));
    expect(html).toBe("");
  });
});
