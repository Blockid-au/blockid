// Colocated spec for the publish control.
//
// There is no DOM in this suite (no jsdom in the vitest config), so what is
// pinned here is the first paint — which is exactly where the consent
// guarantee lives. On first render, before any effect has run and before the
// founder has done anything at all, the panel must:
//
//   * not be showing a live URL;
//   * not be offering a publish button that could be reached by a stray
//     Enter key on a form the founder has not filled in;
//   * tell an anonymous visitor that publishing needs an account, rather than
//     letting an anon cookie claim a company's name.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PublishPanel } from "./publish-panel";

const ANALYSED_AT = "2026-09-08T04:00:00.000Z";
const ID = "aaaaaaaa-1111-1111-1111-111111111111";

describe("first paint — an owned run", () => {
  const html = renderToStaticMarkup(
    <PublishPanel analysisId={ID} svi={null} analysedAt={ANALYSED_AT} owned />,
  );

  it("never claims the profile is public before it has checked", () => {
    expect(html).not.toContain("This profile is public");
    expect(html).not.toContain("blockid.au/listings/");
  });

  it("offers no way to publish on the very first frame", () => {
    expect(html).not.toContain('data-testid="publish-confirm"');
    expect(html).not.toContain('data-testid="publish-consent"');
  });

  it("says what it is doing rather than rendering an empty box", () => {
    expect(html).toMatch(/checking whether this profile is public/i);
  });
});

describe("an anonymous run", () => {
  const html = renderToStaticMarkup(
    <PublishPanel
      analysisId={ID}
      svi={null}
      analysedAt={ANALYSED_AT}
      owned={false}
    />,
  );

  // Publishing puts a company name on the open web. A cookie a browser can
  // clear is not a strong enough claim on one, so the panel routes to signup
  // instead of offering the control.
  it("routes to an account rather than offering the control", () => {
    expect(html).toContain("/signup");
    expect(html).not.toContain('data-testid="publish-open"');
    expect(html).not.toContain('data-testid="publish-confirm"');
  });

  it("explains why, in plain words", () => {
    expect(html).toMatch(/needs an account/i);
  });
});
