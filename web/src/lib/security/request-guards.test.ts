// Colocated vitest for lib/security/request-guards.ts (S8-C, 2026-09-11).

import { describe, expect, it } from "vitest";
import { GRANT_ID_RE, isGrantId, isUuid, PRIVATE_JSON_HEADERS, readJsonBody, rejectCrossSite } from "./request-guards";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

describe("readJsonBody", () => {
  it("parses a small JSON object", async () => {
    const r = await readJsonBody<{ a: number }>(post('{"a":1}'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.a).toBe(1);
  });

  it("returns a 400 response for malformed JSON and for an empty body", async () => {
    const bad = await readJsonBody(post("{nope"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.status).toBe(400);
      expect(bad.response.status).toBe(400);
      expect(await bad.response.json()).toMatchObject({ ok: false, error: "invalid_json" });
    }
    const empty = await readJsonBody(post(""));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.status).toBe(400);
  });

  it("refuses an oversize body with 413 before parsing (byte length, not char length)", async () => {
    const big = JSON.stringify({ description: "é".repeat(600) }); // 600 chars, ~1.2 KB utf-8
    const r = await readJsonBody(post(big), 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(413);
      expect(await r.response.json()).toMatchObject({ ok: false, error: "payload_too_large", max_bytes: 1000 });
    }
    const fits = await readJsonBody(post(JSON.stringify({ description: "a".repeat(600) })), 1000);
    expect(fits.ok).toBe(true);
  });

  it("does not trust Content-Length", async () => {
    const r = await readJsonBody(post(JSON.stringify({ x: "y".repeat(5000) }), { "content-length": "10" }), 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });
});

describe("rejectCrossSite", () => {
  it("refuses only an explicit Sec-Fetch-Site: cross-site", () => {
    expect(rejectCrossSite(post("{}", { "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(rejectCrossSite(post("{}", { "sec-fetch-site": "Cross-Site" }))?.status).toBe(403);
    expect(rejectCrossSite(post("{}", { "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(rejectCrossSite(post("{}", { "sec-fetch-site": "same-site" }))).toBeNull();
    expect(rejectCrossSite(post("{}", { "sec-fetch-site": "none" }))).toBeNull();
    // Non-browser callers (curl, cron, tests) send no header → allowed.
    expect(rejectCrossSite(post("{}"))).toBeNull();
  });
});

describe("isUuid / isGrantId", () => {
  it("accepts canonical uuids only", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
    expect(isUuid("123e4567e89b12d3a456426614174000")).toBe(false);
    expect(isUuid("../123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("accepts seed-shaped grant ids and refuses anything else", () => {
    for (const ok of ["rdti", "esic", "igp-early-stage", "emdg", "a1-b2-c3"]) expect(isGrantId(ok)).toBe(true);
    for (const bad of ["", "-rdti", "RDTI", "rdti ", "rdti;drop", "rd_ti", "a".repeat(81), "../x", null]) expect(isGrantId(bad)).toBe(false);
    expect(GRANT_ID_RE.test("x".repeat(80))).toBe(true);
  });
});

describe("PRIVATE_JSON_HEADERS", () => {
  it("is private, no-store and frozen", () => {
    expect(PRIVATE_JSON_HEADERS["Cache-Control"]).toBe("private, no-store");
    expect(Object.isFrozen(PRIVATE_JSON_HEADERS)).toBe(true);
  });
});
