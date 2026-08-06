/**
 * Colocated vitest for the pure `partners-types.ts` config loader + shape
 * normaliser consumed by LogoCloud / TrustStrip / PartnerFooterRow.
 *
 * A silent regression in this module is user-visible: the "no-fake-affiliations"
 * rule at the top of partners-types.ts requires every renderer to render
 * NOTHING when the config is missing OR when a group has zero valid entries.
 * If `normaliseEntry` starts accepting `{name: ""}` we ship a nameless logo
 * with a broken alt attribute; if `resolveGroup` stops returning null on an
 * empty group we render an empty <section> that hurts the LCP; if
 * `loadPartnersConfig` returns a `PartnersConfig` when the JSON is malformed
 * we crash the renderer downstream — hence the belt-and-braces pinning below.
 */

import { describe, expect, it } from "vitest";

import {
  loadPartnersConfig,
  normaliseEntry,
  resolveGroup,
  type PartnerEntry,
  type PartnersConfig,
} from "./partners-types";

describe("loadPartnersConfig", () => {
  it("returns the bundled JSON object (non-null)", () => {
    const cfg = loadPartnersConfig();
    expect(cfg).not.toBeNull();
    expect(typeof cfg).toBe("object");
  });

  it("exposes the shipped legacy headlines so old callers keep working", () => {
    const cfg = loadPartnersConfig()!;
    // Both are optional strings — assert defined so a rename in the JSON
    // (e.g. `headline` → `hero_headline`) is caught by the test-gate.
    expect(typeof cfg.headline).toBe("string");
    expect(typeof cfg.investors_headline).toBe("string");
  });

  it("ships a `groups` object with the three curator keys", () => {
    const cfg = loadPartnersConfig()!;
    expect(cfg.groups).toBeDefined();
    expect(cfg.groups?.accepted).toBeDefined();
    expect(cfg.groups?.integrated).toBeDefined();
    expect(cfg.groups?.backed).toBeDefined();
  });

  it("shipped `partners` + `investors` legacy arrays are arrays (may be empty)", () => {
    const cfg = loadPartnersConfig()!;
    // Both are declared optional — the shipped config has them as [] but the
    // schema allows omission. This pins the "arrays when present" contract.
    if (cfg.partners !== undefined) expect(Array.isArray(cfg.partners)).toBe(true);
    if (cfg.investors !== undefined) expect(Array.isArray(cfg.investors)).toBe(true);
  });
});

describe("normaliseEntry — string inputs", () => {
  it("maps a plain name string to {name, alt} with null src+href", () => {
    expect(normaliseEntry("Stripe")).toEqual({
      name: "Stripe",
      src: null,
      href: null,
      alt: "Stripe",
    });
  });

  it("trims whitespace on a string entry", () => {
    expect(normaliseEntry("  Accel  ")).toEqual({
      name: "Accel",
      src: null,
      href: null,
      alt: "Accel",
    });
  });

  it("returns null for an empty string", () => {
    expect(normaliseEntry("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(normaliseEntry("   ")).toBeNull();
  });
});

describe("normaliseEntry — object inputs", () => {
  it("returns null for null (defensive against JSON.parse fallout)", () => {
    // The runtime accepts `null` even though the type is PartnerEntry —
    // this branch protects real production inputs.
    expect(normaliseEntry(null as unknown as PartnerEntry)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(normaliseEntry(undefined as unknown as PartnerEntry)).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(normaliseEntry({} as unknown as PartnerEntry)).toBeNull();
  });

  it("returns null when name is empty string", () => {
    expect(normaliseEntry({ name: "" } as PartnerEntry)).toBeNull();
  });

  it("returns null when name is whitespace only", () => {
    expect(normaliseEntry({ name: "   " } as PartnerEntry)).toBeNull();
  });

  it("returns null when name is a non-string type", () => {
    expect(
      normaliseEntry({ name: 42 } as unknown as PartnerEntry),
    ).toBeNull();
  });

  it("returns null for a non-object, non-string value", () => {
    expect(
      normaliseEntry(42 as unknown as PartnerEntry),
    ).toBeNull();
  });

  it("returns null for a boolean value", () => {
    expect(
      normaliseEntry(true as unknown as PartnerEntry),
    ).toBeNull();
  });

  it("maps a name-only object to name + alt fallback with null src+href", () => {
    expect(normaliseEntry({ name: "Accel" })).toEqual({
      name: "Accel",
      src: null,
      href: null,
      alt: "Accel",
    });
  });

  it("preserves all four canonical fields when supplied", () => {
    expect(
      normaliseEntry({
        name: "Stripe for Startups",
        src: "/partners/stripe.svg",
        href: "https://stripe.com/startups",
        alt: "Stripe for Startups — payments partner",
      }),
    ).toEqual({
      name: "Stripe for Startups",
      src: "/partners/stripe.svg",
      href: "https://stripe.com/startups",
      alt: "Stripe for Startups — payments partner",
    });
  });

  it("trims whitespace on every string field independently", () => {
    expect(
      normaliseEntry({
        name: "  Accel  ",
        src: "  /partners/accel.svg  ",
        href: "  https://accel.com  ",
        alt: "  Accel — VC  ",
      }),
    ).toEqual({
      name: "Accel",
      src: "/partners/accel.svg",
      href: "https://accel.com",
      alt: "Accel — VC",
    });
  });

  it("coerces empty-string src to null", () => {
    expect(normaliseEntry({ name: "Accel", src: "" })).toEqual({
      name: "Accel",
      src: null,
      href: null,
      alt: "Accel",
    });
  });

  it("coerces whitespace-only src to null", () => {
    expect(normaliseEntry({ name: "Accel", src: "   " })).toEqual({
      name: "Accel",
      src: null,
      href: null,
      alt: "Accel",
    });
  });

  it("coerces non-string src to null", () => {
    const out = normaliseEntry({
      name: "Accel",
      src: 42 as unknown as string,
    });
    expect(out?.src).toBeNull();
  });

  it("coerces empty-string href to null", () => {
    expect(normaliseEntry({ name: "Accel", href: "" })).toMatchObject({
      href: null,
    });
  });

  it("coerces whitespace-only href to null", () => {
    expect(normaliseEntry({ name: "Accel", href: "   " })).toMatchObject({
      href: null,
    });
  });

  it("falls back to name when alt is empty string", () => {
    expect(normaliseEntry({ name: "Accel", alt: "" })).toMatchObject({
      alt: "Accel",
    });
  });

  it("falls back to name when alt is whitespace-only", () => {
    expect(normaliseEntry({ name: "Accel", alt: "   " })).toMatchObject({
      alt: "Accel",
    });
  });

  it("falls back to name when alt is missing", () => {
    expect(normaliseEntry({ name: "Accel" })).toMatchObject({ alt: "Accel" });
  });

  it("uses the trimmed alt when both name and alt are set", () => {
    expect(normaliseEntry({ name: "Accel", alt: "Accel Partners" })).toMatchObject({
      alt: "Accel Partners",
    });
  });
});

describe("resolveGroup — null / missing config", () => {
  it("returns null when config is null", () => {
    expect(resolveGroup(null, "accepted", "partners", "Working with")).toBeNull();
  });

  it("returns null when config is null and no group specified", () => {
    expect(resolveGroup(null, undefined, "partners", "Working with")).toBeNull();
  });
});

describe("resolveGroup — grouped path", () => {
  const config: PartnersConfig = {
    groups: {
      accepted: {
        label: "Accepted into",
        entries: [
          { name: "Founder Institute", src: "/fi.svg", href: "https://fi.co" },
          { name: "NVIDIA Inception" },
          "", // dropped by normaliseEntry
        ],
      },
      integrated: {
        label: "Integrated with",
        entries: [{ name: "Stripe" }],
      },
      backed: {
        // No `label` set — resolveGroup should fall back to fallbackLabel.
        entries: [{ name: "Some Investor" }],
      },
    },
  };

  it("returns the group label and normalised entries in source order", () => {
    const out = resolveGroup(config, "accepted", "partners", "Working with");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Accepted into");
    // The trailing empty string is dropped by normaliseEntry, so length is 2 not 3.
    expect(out!.entries).toEqual([
      {
        name: "Founder Institute",
        src: "/fi.svg",
        href: "https://fi.co",
        alt: "Founder Institute",
      },
      {
        name: "NVIDIA Inception",
        src: null,
        href: null,
        alt: "NVIDIA Inception",
      },
    ]);
  });

  it("falls back to fallbackLabel when the group has no `label` field", () => {
    const out = resolveGroup(config, "backed", "investors", "Backed by (fallback)");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Backed by (fallback)");
    expect(out!.entries).toEqual([
      { name: "Some Investor", src: null, href: null, alt: "Some Investor" },
    ]);
  });

  it("returns null when the requested group is missing from config.groups", () => {
    const noGroups: PartnersConfig = { groups: {} };
    expect(resolveGroup(noGroups, "accepted", "partners", "Working with")).toBeNull();
  });

  it("returns null when config has no `groups` object at all", () => {
    const noGroupsField: PartnersConfig = { headline: "x" };
    expect(
      resolveGroup(noGroupsField, "accepted", "partners", "Working with"),
    ).toBeNull();
  });

  it("returns null when entries is not an array", () => {
    const bad: PartnersConfig = {
      groups: {
        accepted: {
          label: "x",
          entries: "not-an-array" as unknown as PartnerEntry[],
        },
      },
    };
    expect(resolveGroup(bad, "accepted", "partners", "Working with")).toBeNull();
  });

  it("returns null when every entry in the group normalises away", () => {
    const empty: PartnersConfig = {
      groups: {
        accepted: {
          label: "x",
          entries: [
            "",
            { name: "" },
            { name: "   " },
            null as unknown as PartnerEntry,
          ],
        },
      },
    };
    expect(resolveGroup(empty, "accepted", "partners", "Working with")).toBeNull();
  });
});

describe("resolveGroup — legacy top-level path (no group specified)", () => {
  const legacyConfig: PartnersConfig = {
    headline: "Working with",
    investors_headline: "Backed by",
    partners: [{ name: "Stripe" }, "Accel"],
    investors: [{ name: "Blackbird" }],
  };

  it("reads config.partners when legacy='partners' and returns config.headline", () => {
    const out = resolveGroup(legacyConfig, undefined, "partners", "Working with (fallback)");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Working with");
    expect(out!.entries).toEqual([
      { name: "Stripe", src: null, href: null, alt: "Stripe" },
      { name: "Accel", src: null, href: null, alt: "Accel" },
    ]);
  });

  it("reads config.investors when legacy='investors' and returns config.investors_headline", () => {
    const out = resolveGroup(legacyConfig, undefined, "investors", "Backed by (fallback)");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Backed by");
    expect(out!.entries).toEqual([
      { name: "Blackbird", src: null, href: null, alt: "Blackbird" },
    ]);
  });

  it("falls back to fallbackLabel when the headline is missing (partners)", () => {
    const noHeadline: PartnersConfig = { partners: [{ name: "Stripe" }] };
    const out = resolveGroup(noHeadline, undefined, "partners", "Fallback headline");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Fallback headline");
  });

  it("falls back to fallbackLabel when the investors_headline is missing", () => {
    const noHeadline: PartnersConfig = { investors: [{ name: "Blackbird" }] };
    const out = resolveGroup(noHeadline, undefined, "investors", "Fallback investors");
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Fallback investors");
  });

  it("returns null when the legacy array is not present", () => {
    expect(
      resolveGroup({} as PartnersConfig, undefined, "partners", "x"),
    ).toBeNull();
  });

  it("returns null when the legacy field is not an array", () => {
    const bad: PartnersConfig = {
      partners: "not-an-array" as unknown as PartnerEntry[],
    };
    expect(resolveGroup(bad, undefined, "partners", "x")).toBeNull();
  });

  it("returns null when every legacy entry normalises to null", () => {
    const empty: PartnersConfig = { partners: ["", { name: "" }] };
    expect(resolveGroup(empty, undefined, "partners", "x")).toBeNull();
  });
});

describe("resolveGroup — group argument takes precedence over legacy fallback", () => {
  it("uses group=accepted even when config.partners is present", () => {
    const config: PartnersConfig = {
      partners: [{ name: "SHOULD_NOT_APPEAR" }],
      groups: {
        accepted: {
          label: "Accepted into",
          entries: [{ name: "Founder Institute" }],
        },
      },
    };
    const out = resolveGroup(config, "accepted", "partners", "x");
    expect(out).not.toBeNull();
    expect(out!.entries).toEqual([
      {
        name: "Founder Institute",
        src: null,
        href: null,
        alt: "Founder Institute",
      },
    ]);
  });

  it("does NOT fall back to legacy when the group is missing (group wins)", () => {
    const config: PartnersConfig = {
      partners: [{ name: "LEGACY_ONLY" }],
      groups: {}, // group=accepted requested below is not defined
    };
    expect(resolveGroup(config, "accepted", "partners", "x")).toBeNull();
  });
});
