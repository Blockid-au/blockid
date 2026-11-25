// RewriteAwareLink (G36 tick 3): plain <a> (full page load) for the query
// URLs the proxy serves from another route; next/link for everything else.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a data-next-link="" href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RewriteAwareLink } from "./rewrite-aware-link";

describe("RewriteAwareLink", () => {
  it("renders a plain anchor for a rewritten URL, keeping every attribute", () => {
    const html = renderToStaticMarkup(
      <RewriteAwareLink href="/funding/grants?state=NSW" className="chip" aria-current="true" data-tbr-demo-band="A">
        NSW
      </RewriteAwareLink>,
    );
    expect(html).toBe('<a class="chip" aria-current="true" data-tbr-demo-band="A" href="/funding/grants?state=NSW">NSW</a>');
  });

  it("covers chip combinations and demo bands", () => {
    for (const href of ["/funding/grants?type=grant&stage=idea", "/tbr/demo?band=C"]) {
      expect(renderToStaticMarkup(<RewriteAwareLink href={href}>x</RewriteAwareLink>)).not.toContain("data-next-link");
    }
  });

  it("keeps next/link for URLs served by their own path", () => {
    for (const href of ["/funding/grants", "/funding/grants/abc", "/tbr/demo", "/funding/programs?state=NSW"]) {
      const html = renderToStaticMarkup(
        <RewriteAwareLink href={href} className="x">
          y
        </RewriteAwareLink>,
      );
      expect(html, href).toContain("data-next-link");
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain('class="x"');
    }
  });
});
