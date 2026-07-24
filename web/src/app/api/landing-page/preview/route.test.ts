// Unit tests for POST /api/landing-page/preview — P4a-publish-route
// (route wrapper half of the P4a-landing-page-preview pure lib ship).
//
// Asserts:
//   1. Non-JSON body → 400 `invalid_json`.
//   2. Non-object JSON body → 400 `invalid_body`.
//   3. Fully-valid input → 200 with markdown + html + validation.valid=true
//      and cache-control: no-store.
//   4. Missing fields → 200 with rendered placeholders AND
//      validation.reasons[] listing every gap (headline_empty,
//      bullet_count_too_low, cta_href_invalid, etc.) — the renderer is
//      deliberately defensive so a founder sees the preview and the gap list
//      side-by-side.
//   5. Unsafe cta_href (`javascript:` schema) neutralises in the HTML AND
//      surfaces `cta_href_invalid` in validation.
//   6. Bad-shape optional field (e.g. bullets non-array) coerces to a safe
//      default rather than throwing.

import { describe, it, expect } from "vitest";
import { POST } from "./route";

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/landing-page/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/landing-page/preview", () => {
  it("400s when body is not JSON", async () => {
    const res = await POST(jsonReq("<not json>"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("400s when body is JSON but not an object", async () => {
    const res = await POST(jsonReq(["headline"]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns markdown + html + validation for a fully-valid input", async () => {
    const res = await POST(
      jsonReq({
        headline: "One-click compliance for AU founders",
        subheadline: "Ship an investor-ready data-room in a week, not a quarter.",
        bullets: [
          "12-folder / 102-item data-room seeded from Atlassian's S-1",
          "AU-flavoured SAFE + Pty Ltd constitution templates",
          "ESIC + Div 83A eligibility gates built in",
        ],
        cta_label: "Start free",
        cta_href: "https://blockid.au/svi",
        ga4_measurement_id: "G-ABCD1234",
        brand_name: "BlockID.au",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.validation).toEqual({ valid: true, reasons: [] });
    expect(body.markdown).toMatch(/# One-click compliance for AU founders/);
    expect(body.markdown).toMatch(/\[Start free\]\(https:\/\/blockid\.au\/svi\)/);
    expect(body.html).toMatch(/<!doctype html>/);
    expect(body.html).toMatch(/G-ABCD1234/);
    expect(body.html).toMatch(/BlockID\.au/);
  });

  it("surfaces every validation reason but still renders a placeholder preview", async () => {
    const res = await POST(
      jsonReq({
        headline: "",
        subheadline: "",
        bullets: [],
        cta_label: "",
        cta_href: "",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation.valid).toBe(false);
    expect(body.validation.reasons).toEqual(
      expect.arrayContaining([
        "headline_empty",
        "subheadline_empty",
        "bullet_count_too_low",
        "cta_label_empty",
        "cta_href_empty",
      ]),
    );
    // Rendered draft still lands so the founder sees the shape.
    expect(body.markdown).toMatch(/\(headline missing\)/);
    expect(body.html).toMatch(/\(headline missing\)/);
  });

  it("neutralises javascript: cta_href in HTML and flags cta_href_invalid", async () => {
    const res = await POST(
      jsonReq({
        headline: "Test",
        subheadline: "Sub",
        bullets: ["bullet"],
        cta_label: "Go",
        // eslint-disable-next-line no-script-url
        cta_href: "javascript:alert(1)",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation.reasons).toContain("cta_href_invalid");
    expect(body.html).not.toMatch(/javascript:/i);
    expect(body.html).toMatch(/href="#"/);
  });

  it("coerces non-array bullets to an empty array rather than throwing", async () => {
    const res = await POST(
      jsonReq({
        headline: "Hi",
        subheadline: "Ok",
        bullets: "one, two, three",
        cta_label: "Go",
        cta_href: "/start",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation.reasons).toContain("bullet_count_too_low");
  });

  it("flags ga4_measurement_id_invalid when the id does not match the G- shape", async () => {
    const res = await POST(
      jsonReq({
        headline: "Hi",
        subheadline: "Ok",
        bullets: ["b1"],
        cta_label: "Go",
        cta_href: "/start",
        ga4_measurement_id: "UA-12345-6",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation.reasons).toContain("ga4_measurement_id_invalid");
    // Bad id → analytics snippet omitted, comment placeholder present.
    expect(body.html).toMatch(/no GA4 or Plausible ID supplied/);
  });
});
