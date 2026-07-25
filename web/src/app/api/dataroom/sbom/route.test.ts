// Unit tests for GET /api/dataroom/sbom
// (P7-sbom-license-risk-wire — closes the P7-sbom-license-risk ship-note
// gap that layered the pure classifier at
// web/src/lib/dataroom/sbom-license-risk.ts but did NOT wire it into the
// public JSON response. This tick makes /api/dataroom/sbom return the
// license_risk report alongside the SBOM so investors doing pre-signature
// diligence see the strong_copyleft / weak_copyleft / unknown exposure
// without having to run the classifier client-side.)

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { SBOM_DISCLAIMER } from "@/lib/dataroom/sbom";
import { LICENSE_RISK_DISCLAIMER } from "@/lib/dataroom/sbom-license-risk";
import { GET } from "./route";

function req(query = ""): NextRequest {
  return new NextRequest(`http://x/api/dataroom/sbom${query}`);
}

describe("GET /api/dataroom/sbom", () => {
  it("returns the SBOM with license_risk layered into the JSON body", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    expect(res.headers.get("cache-control")).toContain("max-age=300");

    const body = await res.json();
    expect(typeof body.generated_at).toBe("string");
    expect(body.root_name).toBeTruthy();
    expect(body.disclaimer).toBe(SBOM_DISCLAIMER);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);

    expect(body.license_risk).toBeTruthy();
    expect(body.license_risk.disclaimer).toBe(LICENSE_RISK_DISCLAIMER);
    expect(body.license_risk.root_name).toBe(body.root_name);
    expect(body.license_risk.generated_at).toBe(body.generated_at);

    for (const key of [
      "strong_copyleft",
      "weak_copyleft",
      "unknown",
      "permissive",
      "other",
    ]) {
      expect(typeof body.license_risk.counts_runtime[key]).toBe("number");
      expect(typeof body.license_risk.counts_dev[key]).toBe("number");
    }

    expect(Array.isArray(body.license_risk.runtime_risky)).toBe(true);
    for (const risky of body.license_risk.runtime_risky) {
      expect(risky.dev).toBe(false);
      expect(["strong_copyleft", "weak_copyleft", "unknown"]).toContain(
        risky.band,
      );
    }
  });

  it("returns the SBOM as CSV without the license_risk column (raw dump only)", async () => {
    const res = await GET(req("?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/csv");
    expect(res.headers.get("content-disposition") ?? "").toContain(
      "blockid-sbom-",
    );

    const csv = await res.text();
    const [header] = csv.split("\n");
    expect(header).toBe("name,version,license,dev,resolved");
    // CSV is the raw spreadsheet dump — license_risk stays out of it so
    // investors uploading straight into folder 7 evidence get a clean
    // per-package inventory. Machine-readable risk lives in the JSON path.
    expect(header).not.toContain("license_risk");
    expect(header).not.toContain("band");
  });
});
