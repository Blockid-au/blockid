// G19-S46 — the showcase read: fixed project id (env override), only a STORED
// report_v2 becomes the payload, every failure → null (empty state), and the
// data-cache wrapper falls back to the direct read outside the Next runtime.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

vi.mock("server-only", () => ({}));

const loadMock = vi.fn();
vi.mock("@/lib/report-v2/load", () => ({ loadLatestReportV2ForProject: (...a: unknown[]) => loadMock(...a) }));

const cacheState = { mode: "passthrough" as "passthrough" | "outside" };
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => (...a: unknown[]) => {
    if (cacheState.mode === "outside") throw new Error("Invariant: incrementalCache missing in unstable_cache");
    return fn(...a);
  },
}));

import { BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT, blockidShowcaseProjectId, loadBlockidShowcaseReport, readBlockidShowcaseReport, toShowcasePayload } from "./blockid-report";

beforeEach(() => {
  loadMock.mockReset();
  cacheState.mode = "passthrough";
});
afterEach(() => {
  delete process.env.BLOCKID_SHOWCASE_PROJECT_ID;
});

describe("blockid showcase report", () => {
  it("resolves the canonical project id, overridable by env", () => {
    expect(blockidShowcaseProjectId()).toBe(BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT);
    expect(BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT).toBe("2bf55234-e359-4390-8faa-06597824f77a");
    process.env.BLOCKID_SHOWCASE_PROJECT_ID = "  other-id ";
    expect(blockidShowcaseProjectId()).toBe("other-id");
  });

  it("toShowcasePayload keeps only a stored document (never the adapter path)", () => {
    const report = demoReportV2();
    expect(toShowcasePayload(null)).toBeNull();
    expect(toShowcasePayload({ report, snapshotId: "s", projectId: "p", accountId: "a", shareToken: null, path: "adapter" })).toBeNull();
    expect(toShowcasePayload({ report, snapshotId: "s", projectId: "p", accountId: "a", shareToken: null, path: "stored" })).toEqual({ report, snapshotId: "s", generatedAt: report.generatedAt });
  });

  it("readBlockidShowcaseReport queries the project with the showcase name and never throws", async () => {
    const report = demoReportV2();
    loadMock.mockResolvedValueOnce({ report, snapshotId: "s-9", projectId: "p", accountId: "a", shareToken: null, path: "stored" });
    const got = await readBlockidShowcaseReport();
    expect(got?.snapshotId).toBe("s-9");
    expect(loadMock).toHaveBeenCalledWith(BLOCKID_SHOWCASE_PROJECT_ID_DEFAULT, { startupName: "BlockID.au (Auschain PTY LTD)", locale: "en" });
    loadMock.mockRejectedValueOnce(new Error('relation "svi_snapshots" does not exist'));
    expect(await readBlockidShowcaseReport()).toBeNull();
    loadMock.mockResolvedValueOnce(null);
    expect(await readBlockidShowcaseReport()).toBeNull();
  });

  it("loadBlockidShowcaseReport goes through the data cache, falls back to the direct read outside Next, and is null on any other failure", async () => {
    const report = demoReportV2();
    loadMock.mockResolvedValue({ report, snapshotId: "s-1", projectId: "p", accountId: "a", shareToken: null, path: "stored" });
    expect((await loadBlockidShowcaseReport())?.snapshotId).toBe("s-1");
    cacheState.mode = "outside";
    expect((await loadBlockidShowcaseReport())?.snapshotId).toBe("s-1");
    cacheState.mode = "passthrough";
    loadMock.mockImplementation(() => { throw new Error("boom"); });
    expect(await loadBlockidShowcaseReport()).toBeNull();
  });
});
