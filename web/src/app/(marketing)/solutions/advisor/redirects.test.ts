// Pins the two 301s T0274 / T0275 added to next.config.ts and the one they
// removed. Reads the real config so a future edit to `redirects()` cannot
// quietly re-introduce the `/solutions/advisor → /for/advisor` alias (which
// sold advisory firms the founder Growth plan) or resurrect `/privacy` as a
// second policy.

import { describe, expect, it } from "vitest";

import nextConfig from "../../../../../next.config";

type Redirect = { source: string; destination: string; statusCode?: number; permanent?: boolean };

async function redirects(): Promise<Redirect[]> {
  const fn = nextConfig.redirects;
  if (!fn) throw new Error("next.config.ts has no redirects()");
  return (await fn()) as Redirect[];
}

describe("next.config.ts redirects — T0274 / T0275", () => {
  it("/for/advisor is a 301 to /solutions/advisor", async () => {
    const r = (await redirects()).find((x) => x.source === "/for/advisor");
    expect(r).toBeDefined();
    expect(r?.destination).toBe("/solutions/advisor");
    expect(r?.statusCode).toBe(301);
  });

  it("/solutions/advisor is no longer redirected anywhere — it is a real page", async () => {
    const r = (await redirects()).find((x) => x.source === "/solutions/advisor");
    expect(r).toBeUndefined();
  });

  it("/privacy is a 301 to /legal/privacy — one privacy policy", async () => {
    const r = (await redirects()).find((x) => x.source === "/privacy");
    expect(r).toBeDefined();
    expect(r?.destination).toBe("/legal/privacy");
    expect(r?.statusCode).toBe(301);
  });

  it("every /for/* persona 301s to its /solutions/* twin (no chains, no orphans)", async () => {
    const all = await redirects();
    for (const slug of ["founder", "investor", "advisor", "accelerator"]) {
      const r = all.find((x) => x.source === `/for/${slug}`);
      expect(r?.destination, slug).toBe(`/solutions/${slug}`);
      // The destination must not itself be a redirect source.
      expect(all.find((x) => x.source === r?.destination), `${slug} chain`).toBeUndefined();
    }
  });

  it("/legal/privacy is never a redirect source", async () => {
    const r = (await redirects()).find((x) => x.source === "/legal/privacy");
    expect(r).toBeUndefined();
  });
});
