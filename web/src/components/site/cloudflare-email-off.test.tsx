// Release QA-2 F9 — the Cloudflare email_off markers must reach the wire
// as real HTML comments, first and last inside <body>.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CloudflareEmailOffEnd,
  CloudflareEmailOffStart,
  EMAIL_OFF_CLOSE,
  EMAIL_OFF_OPEN,
} from "./cloudflare-email-off";

describe("CloudflareEmailOff markers", () => {
  it("render the documented <!--email_off--> / <!--/email_off--> comments verbatim", () => {
    const start = renderToStaticMarkup(<CloudflareEmailOffStart />);
    const end = renderToStaticMarkup(<CloudflareEmailOffEnd />);
    expect(start).toContain("<!--email_off-->");
    expect(end).toContain("<!--/email_off-->");
    expect(EMAIL_OFF_OPEN).toBe("<!--email_off-->");
    expect(EMAIL_OFF_CLOSE).toBe("<!--/email_off-->");
    // Hidden, inert wrappers — nothing visible, nothing for a11y.
    expect(start).toMatch(/<span hidden="" aria-hidden="true"/);
    expect(end).toMatch(/<span hidden="" aria-hidden="true"/);
  });

  it("are the first and last children of <body> in the root layout (static source pin)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "app", "layout.tsx"), "utf8");
    const bodyOpen = src.indexOf("<body");
    const bodyClose = src.indexOf("</body>");
    expect(bodyOpen).toBeGreaterThan(0);
    expect(bodyClose).toBeGreaterThan(bodyOpen);
    const body = src.slice(bodyOpen, bodyClose);
    // First JSX child after the opening tag (comments allowed in between).
    const afterOpen = body.slice(body.indexOf(">") + 1).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim();
    expect(afterOpen.startsWith("<CloudflareEmailOffStart />")).toBe(true);
    expect(body.trimEnd().endsWith("<CloudflareEmailOffEnd />")).toBe(true);
  });
});
