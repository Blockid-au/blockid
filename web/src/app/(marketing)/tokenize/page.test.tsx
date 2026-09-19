// Colocated test for /tokenize (G17 P2-A): one h1, the three feature cards,
// the SVG workflow figure, the section ids, the CTA hrefs, pageMetadata.
// The marketing shell is mocked (NavV2 needs an app-router context).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import TokenizePage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/tokenize — template (G17 P2-A)", () => {
  it("one h1, #parts / #workflow / #optional, the diagram, the CTA hrefs, the entity line", async () => {
    const out = await html(<TokenizePage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["parts", "workflow", "optional", "cta"]) expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    expect(out).toContain('id="tokenize-workflow-title"');
    expect(out).toContain("Private EVM (Anvil chainId 420)");
    expect(out).toContain("ESOP + vesting smart contract");
    for (const href of ["/pricing", "/tools/cap-table", "/analyze"]) expect(out).toContain(`href="${href}"`);
    expect(out).toContain("Auschain PTY LTD");
  });

  it("pageMetadata: canonical, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/tokenize");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
