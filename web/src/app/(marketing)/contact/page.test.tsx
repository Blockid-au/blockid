// Colocated test for /contact (G17 P2-A): server page on the template (it
// used to be a "use client" page on a raw-hex dark ground with its own nav +
// footer); one h1, the form with its honeypot, the info cards, the two
// audience links, no raw hex anywhere on the page or in the form, metadata
// via layout.tsx. The marketing shell is mocked; the client form renders to
// static HTML.

import { describe, expect, it, vi } from "vitest";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import { metadata } from "./layout";
import ContactPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/contact — template (G17 P2-A)", () => {
  it("one h1, #form / #audiences / #support, the form + honeypot, the cards, the audience links, no raw hex", async () => {
    const out = await html(<ContactPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["form", "audiences", "support", "cta"]) expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    expect(out).toContain("<form");
    expect(out).toContain('name="company_website"');
    expect(out).toContain('id="contact-email"');
    expect(out).toContain('href="mailto:admin@blockid.au"');
    expect(out).toContain(`${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ABN_LABEL})`);
    expect(out).toContain('href="/solutions/investor"');
    expect(out).toContain('href="/solutions/accelerator"');
    expect(out).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    expect(out).not.toContain("Founding 100");
  });

  it("layout metadata: canonical /contact, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/contact");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
