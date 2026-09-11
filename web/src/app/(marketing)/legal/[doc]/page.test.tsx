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
  it("renders version 2.2, effective 11 September 2026", async () => {
    const html = await render("privacy");
    expect(html).toContain("This version 2.2 takes effect on");
    expect(html).toContain("11 September 2026");
    expect(html).not.toContain("This version 2.1 takes effect on");
  });

  it("keeps the Auschain entity line (legal/billing entity — not the marketing brand)", async () => {
    const html = await render("privacy");
    expect(html).toContain("Auschain PTY LTD");
    expect(html).toContain("ACN 659 615 111");
    expect(html).toContain("ABN 79 659 615 111");
    expect(html).not.toContain("PhD");
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

describe("/legal/privacy v2.2 — Money Finder + Evaluator data (S14-A)", () => {
  it("exposes the three new clause anchors and the changelog", async () => {
    const html = await render("privacy");
    for (const id of ["money-finder", "evaluator-data", "investor-discoverability", "changelog"]) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain("2B. Money Finder");
    expect(html).toContain("2C. Startups entered by evaluators");
    expect(html).toContain("2D. Investor discoverability");
  });

  it("says demographic flags are optional and used only for eligibility", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/Demographic flags are optional and are used only for\s+eligibility/);
    expect(html).toMatch(/women-led, First Nations-owned, regional/);
    expect(html).toMatch(/never shown to an investor or\s+evaluator/);
  });

  it("covers guest A$3 purchases: email + Stripe, no card number, tokenised link", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/report for A\$3 without an\s+account/);
    expect(html).toMatch(/do <strong[^>]*>not<\/strong> store your card number/);
    expect(html).toMatch(/random access token/);
  });

  it("names the Money Radar email category and both opt-out routes", async () => {
    const html = await render("privacy");
    expect(html).toContain('<strong class="font-semibold text-primary">Money Radar</strong>');
    expect(html).toMatch(/Workspace → Notifications → Preferences/);
    expect(html).toMatch(/unsubscribe link in any Radar email/);
    expect(html).toMatch(/30, 14, or 3 days away/);
  });

  it("explains the calendar-feed token and how to rotate it", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/feed URL contains a secret token/);
    expect(html).toMatch(/mint a new token/);
  });

  it("covers evaluator-entered startups: indirect collection, claim, consent tiers, removal route", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/APP 3\.6, APP 5\.2/);
    expect(html).toMatch(/one-time claim link/);
    expect(html).toContain("<em>attributed only</em>");
    expect(html).toContain("<em>reports shared</em>");
    expect(html).toContain("<em>full mentor</em>");
    expect(html).toMatch(/whether or not you have a BlockID\s+account/);
    expect(html).toContain("privacy&#64;blockid.au");
    expect(html).toContain("/contact?topic=legal");
    expect(html).toMatch(/tell the evaluator that\s+we have done so/);
  });

  it("covers investor discoverability: opt-in, off by default, email never shown", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/<strong[^>]*>off by default<\/strong>/);
    expect(html).toMatch(/Your email address is never shown to founders/);
  });

  it("adds a retention row for every new table, each with an 'or on request' fallback", async () => {
    const html = await render("privacy");
    for (const cell of [
      "project_grant_profiles",
      "funding_matches",
      "email_drips",
      "Startups entered by evaluators, evaluation reports, and batches",
      "Evaluator invitation and claim tokens",
      "Investor preferences and discoverability flag",
      "Calendar-feed token",
      "Dashboard layout and notification preferences",
      "Money Finder reports (guest, A$3)",
    ]) {
      expect(html, cell).toContain(cell);
    }
    expect((html.match(/or on request/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("keeps the provider chain untouched and names the new inputs that may reach it", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/including any demographic flag you have ticked/);
    expect(html).toMatch(/notes the\s+evaluator entered together with public information/);
    expect(html).toMatch(/sends no personal information anywhere/);
  });

  it("changelog lists the v2.2 changes and keeps v2.1 / v2.0 history", async () => {
    const html = await render("privacy");
    expect(html).toMatch(/v2\.2 — effective 11 September 2026/);
    expect(html).toMatch(/v2\.1 — effective 10 September 2026/);
    expect(html).toMatch(/v2\.0 — effective 30 July 2026/);
  });

  it("renders the retention table as a real <table>, not a run-on paragraph", async () => {
    const html = await render("privacy");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("<td");
    expect(html).not.toContain("|---|");
    expect(html).not.toMatch(/<p[^>]*>\| Data class/);
  });

  it("joins wrapped list items so bold spans that cross a line break still close", async () => {
    const html = await render("privacy");
    expect(html).toMatch(
      /<li[^>]*>Export a machine-readable copy of your account data from <strong[^>]*>Account → Export<\/strong>;<\/li>/,
    );
    // No raw markdown survives into visible text.
    const visible = html.replace(/<[^>]+>/g, " ");
    expect(visible).not.toMatch(/\*\*|\|/);
  });
});
