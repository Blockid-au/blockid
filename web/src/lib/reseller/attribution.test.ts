import { describe, it, expect } from "vitest";
import {
  normaliseResellerCode,
  extractViaFromSearchParams,
  extractViaFromCookieHeader,
  VIA_KEY,
  VIA_PARAM,
} from "./attribution";
import { viaClientReferenceId } from "./attribution-server";

describe("normaliseResellerCode", () => {
  it("uppercases and strips punctuation", () => {
    expect(normaliseResellerCode("infovision20")).toBe("INFOVISION20");
    expect(normaliseResellerCode("  Info-Vision 20 ")).toBe("INFOVISION20");
  });
  it("returns null for empty / null / whitespace", () => {
    expect(normaliseResellerCode("")).toBeNull();
    expect(normaliseResellerCode(null)).toBeNull();
    expect(normaliseResellerCode(undefined)).toBeNull();
    expect(normaliseResellerCode("   ")).toBeNull();
    expect(normaliseResellerCode("!!!")).toBeNull();
  });
});

describe("extractViaFromSearchParams", () => {
  it("reads from URLSearchParams", () => {
    const p = new URLSearchParams(`?${VIA_PARAM}=infovision20`);
    expect(extractViaFromSearchParams(p)).toBe("INFOVISION20");
  });
  it("reads from raw string with leading ?", () => {
    expect(extractViaFromSearchParams("?via=INFOVISION")).toBe("INFOVISION");
  });
  it("reads from raw string without leading ?", () => {
    expect(extractViaFromSearchParams("via=INFOVISION30&other=x")).toBe("INFOVISION30");
  });
  it("returns null when missing", () => {
    expect(extractViaFromSearchParams("other=1")).toBeNull();
  });
});

describe("extractViaFromCookieHeader", () => {
  it("finds the blockid_via cookie among others", () => {
    const header = `session=abc; ${VIA_KEY}=INFOVISION20; theme=dark`;
    expect(extractViaFromCookieHeader(header)).toBe("INFOVISION20");
  });
  it("handles url-encoded values", () => {
    const header = `${VIA_KEY}=INFOVISION%2FTEST`;
    expect(extractViaFromCookieHeader(header)).toBe("INFOVISIONTEST");
  });
  it("returns null when absent", () => {
    expect(extractViaFromCookieHeader("session=abc")).toBeNull();
    expect(extractViaFromCookieHeader(null)).toBeNull();
    expect(extractViaFromCookieHeader(undefined)).toBeNull();
  });
});

describe("viaClientReferenceId", () => {
  it("is stable for the same code", () => {
    const a = viaClientReferenceId("INFOVISION20");
    const b = viaClientReferenceId("INFOVISION20");
    expect(a).toBe(b);
  });
  it("differs across codes", () => {
    expect(viaClientReferenceId("INFOVISION20")).not.toBe(viaClientReferenceId("INFOVISION30"));
  });
  it("starts with the reseller_attribution prefix", () => {
    expect(viaClientReferenceId("INFOVISION")).toMatch(/^reseller_attribution:INFOVISION:[0-9a-f]{8}$/);
  });
});
