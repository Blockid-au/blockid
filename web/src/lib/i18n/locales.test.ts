import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  localeFromPath,
  toLocalePath,
  type Locale,
} from "./locales";

describe("LOCALES registry", () => {
  it("ships exactly the shipped locale set in canonical order", () => {
    // Renaming or reordering the union changes middleware wiring + the
    // locale switcher, so pin the shipped shape bit-for-bit.
    expect(Array.from(LOCALES)).toEqual(["en", "vi"]);
  });

  it("has no duplicate codes", () => {
    expect(new Set(LOCALES).size).toBe(LOCALES.length);
  });

  it("DEFAULT_LOCALE is 'en' and is a member of LOCALES", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect((LOCALES as readonly string[]).includes(DEFAULT_LOCALE)).toBe(true);
  });

  it("cookie + header names are stable", () => {
    // Renaming either breaks the proxy-to-server-component contract.
    expect(LOCALE_COOKIE).toBe("blockid_locale");
    expect(LOCALE_HEADER).toBe("x-blockid-locale");
  });
});

describe("isLocale", () => {
  it("accepts every shipped code", () => {
    for (const code of LOCALES) {
      expect(isLocale(code)).toBe(true);
    }
  });

  it("rejects unknown codes", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("zh")).toBe(false);
    expect(isLocale("en-au")).toBe(false);
  });

  it("is case-sensitive — 'EN' is not accepted", () => {
    // The middleware normalises URL case before calling isLocale, so this
    // guard's job is to refuse casings that leaked through unnormalised.
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("Vi")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isLocale("")).toBe(false);
  });
});

describe("localeFromPath", () => {
  it("root path defaults to EN", () => {
    expect(localeFromPath("/")).toEqual({ locale: "en", rest: "/" });
  });

  it("EN path (no prefix) resolves to EN with pathname unchanged", () => {
    expect(localeFromPath("/pricing")).toEqual({ locale: "en", rest: "/pricing" });
  });

  it("bare '/vi' resolves to VI with rest = '/'", () => {
    expect(localeFromPath("/vi")).toEqual({ locale: "vi", rest: "/" });
  });

  it("'/vi/' trailing slash resolves to VI with rest = '/'", () => {
    expect(localeFromPath("/vi/")).toEqual({ locale: "vi", rest: "/" });
  });

  it("nested VI path strips the /vi prefix to EN-shape rest", () => {
    expect(localeFromPath("/vi/pricing")).toEqual({
      locale: "vi",
      rest: "/pricing",
    });
  });

  it("deeply nested VI path preserves query-free segments", () => {
    expect(localeFromPath("/vi/dashboard/reports")).toEqual({
      locale: "vi",
      rest: "/dashboard/reports",
    });
  });

  it("empty string defaults to EN root", () => {
    expect(localeFromPath("")).toEqual({ locale: "en", rest: "/" });
  });

  it("non-string input defaults to EN root (defensive guard)", () => {
    // The guard exists because `next/navigation` types occasionally leak
    // null in edge middleware. Cast through unknown to hit the branch.
    expect(localeFromPath(null as unknown as string)).toEqual({
      locale: "en",
      rest: "/",
    });
    expect(localeFromPath(undefined as unknown as string)).toEqual({
      locale: "en",
      rest: "/",
    });
  });

  it("a path whose first segment merely starts with the locale code but is not a boundary stays EN", () => {
    // `/viking` is NOT the VI locale — must not be matched by prefix.
    expect(localeFromPath("/viking")).toEqual({
      locale: "en",
      rest: "/viking",
    });
    expect(localeFromPath("/vietnamese")).toEqual({
      locale: "en",
      rest: "/vietnamese",
    });
  });

  it("does not treat '/en' as a locale prefix (EN is the default, no prefix)", () => {
    // A visitor typing `/en/pricing` should NOT get rest='/pricing' — EN
    // has no prefix so the whole path stays intact.
    expect(localeFromPath("/en/pricing")).toEqual({
      locale: "en",
      rest: "/en/pricing",
    });
    expect(localeFromPath("/en")).toEqual({ locale: "en", rest: "/en" });
  });
});

describe("toLocalePath", () => {
  it("EN target with EN-shape rest returns the rest unchanged", () => {
    expect(toLocalePath("/pricing", "en")).toBe("/pricing");
  });

  it("EN target with root rest returns '/'", () => {
    expect(toLocalePath("/", "en")).toBe("/");
  });

  it("VI target with root rest returns '/vi'", () => {
    expect(toLocalePath("/", "vi")).toBe("/vi");
  });

  it("VI target prefixes non-root rest", () => {
    expect(toLocalePath("/pricing", "vi")).toBe("/vi/pricing");
  });

  it("VI target with nested rest preserves the sub-path", () => {
    expect(toLocalePath("/dashboard/reports", "vi")).toBe(
      "/vi/dashboard/reports",
    );
  });

  it("adds leading slash when caller passes a rest without one", () => {
    expect(toLocalePath("pricing", "vi")).toBe("/vi/pricing");
    expect(toLocalePath("pricing", "en")).toBe("/pricing");
  });

  it("round-trips with localeFromPath for every locale × sample path", () => {
    const samples = ["/", "/pricing", "/dashboard/reports", "/deep/nested/path"];
    for (const code of LOCALES) {
      for (const rest of samples) {
        const path = toLocalePath(rest, code);
        const parsed = localeFromPath(path);
        expect(parsed.locale).toBe(code);
        expect(parsed.rest).toBe(rest);
      }
    }
  });

  it("returned type is assignable to a plain string", () => {
    // Compile-time smoke — if the signature ever narrows, this fails to
    // type-check.
    const path: string = toLocalePath("/", "vi" satisfies Locale);
    expect(typeof path).toBe("string");
  });
});
