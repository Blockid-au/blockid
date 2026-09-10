// Colocated test for /legal/[doc] — pins what T0275 made true of the ONE
// privacy policy: it renders from content/legal/privacy-v2.mdx, lists the
// AI provider chain the platform actually runs, carries the founder-approved
// data principle verbatim, says nothing about model training, and exposes
// the `#security` anchor the site footer deep-links.
//
// The marketing shell mounts NavV2 → LocaleSwitcher → useRouter(), which
// throws outside an app-router context, so it is mocked to a pass-through.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LegalDocPage, { generateMetadata } from "./page";

async function render(doc: string): Promise<string> {
  const el = await LegalDocPage({ params: Promise.resolve({ doc }) });
  return renderToStaticMarkup(el);
}

const DATA_PRINCIPLE =
  "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.";

describe("/legal/privacy — the one privacy policy (T0275)", () => {
  it("renders version 2.1, effective 10 September 2026", async () => {
    const html = await render("privacy");
    expect(html).toContain("This version 2.1 takes effect on");
    expect(html).toContain("10 September 2026");
  });

  it("lists the AI provider chain in the order ai-client.ts tries it", async () => {
    const html = await render("privacy");
    const order = ["Groq", "Cerebras", "SambaNova", "DeepInfra", "Anthropic", "Ollama", "OpenRouter"];
    const idx = order.map((name) => html.indexOf(name));
    for (const i of idx) expect(i).toBeGreaterThan(-1);
    for (let i = 1; i < idx.length; i += 1) {
      expect(idx[i]!, `${order[i]} after ${order[i - 1]}`).toBeGreaterThan(idx[i - 1]!);
    }
  });

  it("says prompts and relevant input data may be transmitted to those providers under their business terms", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/prompts and the relevant input\s+data/);
    expect(html).toMatch(/under their business\s+terms/);
  });

  it("carries the founder-approved data principle verbatim", async () => {
    const html = await render("privacy");
    // The renderer escapes `'` as &#39;.
    expect(html).toContain(DATA_PRINCIPLE.replace(/'/g, "&#39;"));
  });

  it("says nothing about model training either way", async () => {
    const html = await render("privacy");
    expect(html).not.toMatch(/\btrain(ing|ed|s)?\b/i);
  });

  it("no longer lists Vercel (the site is self-hosted) and keeps Supabase in Sydney", async () => {
    const html = await render("privacy");
    expect(html).not.toContain("Vercel");
    expect(html).toContain("ap-southeast-2");
  });

  it("exposes the #security anchor the site footer links to, and the other named anchors", async () => {
    const html = await render("privacy");
    expect(html).toContain('id="security"');
    expect(html).toContain('id="ai-providers"');
    expect(html).toContain('id="your-data"');
    // The `{#anchor}` suffix never leaks into visible text.
    expect(html).not.toContain("{#");
  });

  it("is canonical at /legal/privacy", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ doc: "privacy" }) });
    expect(meta.alternates?.canonical).toBe("https://blockid.au/legal/privacy");
  });
});
