/**
 * The walkthrough must disclose exactly what `/id/sprocketbay-demo`
 * discloses — same module, same keys, same catalogue copy.
 *
 * The failure this guards against is subtle: someone "tidies up" the
 * walkthrough by inlining the banner text, the i18n catalogue later
 * changes, and the two surfaces start saying different things about
 * whether the company is real.
 */

import { describe, expect, it } from "vitest";

import {
  badgeChrome,
  profileChromeKeys,
  SAMPLE_DATA_JSONLD_NOTICE,
} from "@/lib/business-id/profile-disclosure";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";

import {
  SPROCKETBAY_PROFILE_KIND,
  walkthroughDisclosure,
  walkthroughLevelChrome,
} from "./disclosure";

const EN = en as Messages;
const VI = vi as Messages;

describe("walkthroughDisclosure", () => {
  it("treats the walkthrough subject as a demo profile", () => {
    expect(SPROCKETBAY_PROFILE_KIND).toBe("demo");
  });

  it("returns the banner rather than null for the demo kind", () => {
    const d = walkthroughDisclosure(EN);
    expect(d).not.toBeNull();
    expect(d?.isSample).toBe(true);
    expect(d?.claimsVerified).toBe(false);
  });

  it("resolves the same keys /id/[slug] resolves — not inlined copy", () => {
    const keys = profileChromeKeys("demo").disclosure;
    expect(keys).not.toBeNull();
    const d = walkthroughDisclosure(EN);
    expect(d?.chip).toBe(EN[keys!.chipKey]);
    expect(d?.title).toBe(EN[keys!.titleKey]);
    expect(d?.body).toBe(EN[keys!.bodyKey]);
  });

  it("resolves real catalogue copy, never a bare key token", () => {
    for (const catalogue of [EN, VI]) {
      const d = walkthroughDisclosure(catalogue);
      expect(d).not.toBeNull();
      for (const text of [d!.chip, d!.title, d!.body]) {
        expect(text.length).toBeGreaterThan(3);
        expect(text.startsWith("businessIdPublic.")).toBe(false);
      }
    }
  });

  it("says the company is not real, in both catalogues", () => {
    expect(walkthroughDisclosure(EN)?.title.toLowerCase()).toContain(
      "not a real business",
    );
    // The VI catalogue phrases it differently; assert it is a real
    // translation rather than the EN string leaking through.
    expect(walkthroughDisclosure(VI)?.title).not.toBe(
      walkthroughDisclosure(EN)?.title,
    );
  });

  it("carries the machine-readable notice for crawlers", () => {
    expect(walkthroughDisclosure(EN)?.jsonLdNotice).toBe(
      SAMPLE_DATA_JSONLD_NOTICE,
    );
    expect(SAMPLE_DATA_JSONLD_NOTICE).toContain("SAMPLE DATA");
  });

  it("returns null — no sample banner — for a real customer profile", () => {
    expect(walkthroughDisclosure(EN, "customer")).toBeNull();
  });
});

describe("walkthroughLevelChrome", () => {
  it("delegates to badgeChrome so it cannot drift from the embed badge", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      const chrome = walkthroughLevelChrome(level);
      const { levelLabel: _levelLabel, ...rest } = chrome;
      expect(rest).toEqual(badgeChrome({ kind: "demo", level }));
    }
  });

  it("never claims verification for the demo profile", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      const chrome = walkthroughLevelChrome(level);
      expect(chrome.claimsVerified).toBe(false);
      expect(chrome.headline).toBe("Sample data");
      expect(chrome.chipText).toBe("DEMO");
    }
  });

  it("still names the ladder rung so the walkthrough can explain it", () => {
    expect(walkthroughLevelChrome(4).levelLabel).toBe("Attested");
    expect(walkthroughLevelChrome(5).levelLabel).toBe("Continuously monitored");
  });
});
