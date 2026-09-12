// S20-B review P2-5 — /docs must render the webhook verifier from the
// shared reference string (lib/webhooks/sign.ts WEBHOOK_VERIFY_SNIPPET),
// which sign.test.ts executes against verifySignature. A hand-written copy
// in the page is what drifted before (it could throw on a non-hex v1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEBHOOK_VERIFY_SNIPPET } from "@/lib/webhooks/sign";

const page = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/docs webhook verifier snippet", () => {
  it("is rendered from WEBHOOK_VERIFY_SNIPPET + WEBHOOK_VERIFY_EXPRESS_EXAMPLE, not a hand-written copy", () => {
    expect(page).toMatch(/import \{[^}]*WEBHOOK_VERIFY_SNIPPET[^}]*\} from "@\/lib\/webhooks\/sign"/);
    expect(page).toContain("${WEBHOOK_VERIFY_SNIPPET}");
    expect(page).toContain("${WEBHOOK_VERIFY_EXPRESS_EXAMPLE}");
    // No second implementation lingering in the page source.
    expect(page).not.toContain("timingSafeEqual(");
    expect(page).not.toContain("createHmac(");
  });

  it("the shared snippet validates hex before comparing (the bug the review found)", () => {
    expect(WEBHOOK_VERIFY_SNIPPET).toContain('/^[0-9a-f]{64}$/i.test(value)');
    expect(WEBHOOK_VERIFY_SNIPPET.indexOf("/^[0-9a-f]{64}$/i")).toBeLessThan(WEBHOOK_VERIFY_SNIPPET.indexOf("timingSafeEqual(got, expected)"));
  });
});
