// Colocated vitest for /api/accelerator/cohort — RETIRED in G21 P2-A.
// Pins: every method answers 410 with the JSON pointer to the batch API, no
// auth lookup, no placeholder data, no-store.

import { describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));

import { COHORT_API_GONE, GET, POST } from "./route";

describe("/api/accelerator/cohort (retired)", () => {
  it("GET → 410 gone with the replacement endpoints", async () => {
    const res = await GET();
    expect(res.status).toBe(410);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json).toEqual(COHORT_API_GONE);
    expect(json.replaced_by.list).toBe("/api/evaluations/batch");
    expect(json.replaced_by.import_csv).toBe("/api/evaluations/batch/[id]/import.csv");
    expect(json.replaced_by.page).toBe("/workspace/evaluations/cohort");
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("POST → 410 too, without reading the body", async () => {
    const res = await POST(new Request("http://x/api/accelerator/cohort", { method: "POST", body: "{nope", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("gone");
  });
});
