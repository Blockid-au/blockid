import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Shield } from "lucide-react";
import { FEATURE_INTEREST_SOURCE, NotAvailableYet } from "./not-available-yet";

// S31-B (2026-09-13): one honest card for every deferred surface. The four
// nav-linked stubs (SSO, White-label, Applications, Weekly Digest) and the
// listing form all render it — pinned below by reading the page sources, so
// a hand-rolled "Coming Soon — Estimated: Q3 2026" cannot creep back.

describe("<NotAvailableYet>", () => {
  it("says not available, gives the reason, the alternatives and a notify button — never a date or an upgrade", () => {
    const html = renderToStaticMarkup(
      <NotAvailableYet
        feature="sso"
        title="Single Sign-On"
        icon={Shield}
        userEmail="founder@example.com"
        reason="Needs a partner integration we have not built."
        alternatives={[{ href: "/workspace/team", label: "Invite team members" }]}
      />,
    );
    expect(html).toContain("Not available yet");
    expect(html).toContain("Needs a partner integration we have not built.");
    expect(html).toContain('href="/workspace/team"');
    expect(html).toContain("Notify me when it");
    expect(html).toContain('data-feature="sso"');
    expect(html).toContain('href="/workspace"');
    expect(html).not.toMatch(/Coming Soon/i);
    expect(html).not.toMatch(/Estimated/i);
    expect(html).not.toMatch(/Upgrade/);
  });

  it("records interest through the existing lead route under a stable source", () => {
    expect(FEATURE_INTEREST_SOURCE).toBe("feature_interest");
  });
});

const WORKSPACE = join(__dirname, "..", "..", "app", "(app)", "(founder)", "workspace");
// S-IA2: SSO and White-label are sections of /workspace/settings/enterprise;
// Applications moved under the accelerator hub; the listing form under score.
const STUB_PAGES = [
  "settings/enterprise/sso-section.tsx",
  "settings/enterprise/white-label-section.tsx",
  "accelerator/applications/page.tsx",
  "weekly-digest/page.tsx",
  "score/listing/page.tsx",
];

describe("deferred workspace pages use the shared card", () => {
  for (const rel of STUB_PAGES) {
    it(`${rel} renders <NotAvailableYet> and no hand-rolled promise`, () => {
      // Comments may describe what the page used to say; only code counts.
      const src = readFileSync(join(WORKSPACE, rel), "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n");
      expect(src).toContain("<NotAvailableYet");
      expect(src).toContain('from "@/components/workspace/not-available-yet"');
      expect(src).not.toMatch(/Estimated: Q/);
      expect(src).not.toMatch(/ships in the next scaffold/);
      expect(src).not.toMatch(/href="\/workspace\/billing"/);
      // The retired rung must not be sold anywhere on these pages.
      expect(src).not.toMatch(/Scale (&|and|&amp;) Enterprise/);
    });
  }
});
