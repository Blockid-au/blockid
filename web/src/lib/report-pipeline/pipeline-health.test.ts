// G15-R3.4 — report-pipeline fully-degraded event: hash-only project id,
// structured log line the error digest keys on, best-effort writer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { REPORT_PIPELINE_HEALTH_FILE, appendDegradedEvent, projectHash, recordFullyDegraded } from "./pipeline-health";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("projectHash", () => {
  it("is the first 12 hex of sha256(projectId) and 'anonymous' without one", () => {
    const id = "6d1f0a2e-1111-4c1d-9c2e-0000deadbeef";
    expect(projectHash(id)).toBe(createHash("sha256").update(id).digest("hex").slice(0, 12));
    expect(projectHash(id)).toHaveLength(12);
    expect(projectHash(id)).not.toContain(id.slice(0, 8));
    expect(projectHash(null)).toBe("anonymous");
    expect(projectHash(undefined)).toBe("anonymous");
    expect(projectHash("")).toBe("anonymous");
  });
});

describe("recordFullyDegraded", () => {
  it("emits {ts, project_hash, reason, llm_calls} to the injected writer and logs one structured line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const writer = vi.fn();
    const now = new Date("2026-09-18T05:00:00.000Z");
    const ev = recordFullyDegraded({ projectId: "proj-1", reason: "deadline_hit", llmCalls: 7 }, writer, now);
    expect(ev).toEqual({ ts: "2026-09-18T05:00:00.000Z", project_hash: projectHash("proj-1"), reason: "deadline_hit", llm_calls: 7 });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith(ev);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(`[report-pipeline] fully_degraded project=${ev.project_hash} reason=deadline_hit llm_calls=7`);
  });

  it("never throws when the writer throws or rejects, and clamps llm_calls to a non-negative integer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => recordFullyDegraded({ reason: "no_llm_calls", llmCalls: -3.7 }, () => { throw new Error("disk full"); })).not.toThrow();
    const rejecting = vi.fn(async () => { throw new Error("EACCES"); });
    const ev = recordFullyDegraded({ projectId: null, reason: "placeholder_summary", llmCalls: 2.9 }, rejecting);
    expect(ev.project_hash).toBe("anonymous");
    expect(ev.llm_calls).toBe(2);
    await Promise.resolve();
    expect(rejecting).toHaveBeenCalledTimes(1);
  });

  it("the default writer is a no-op under vitest (no file is touched)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(REPORT_PIPELINE_HEALTH_FILE).toBe("content/reports/report-pipeline-health.jsonl");
    expect(() => appendDegradedEvent({ ts: "t", project_hash: "abc", reason: "deadline_hit", llm_calls: 0 })).not.toThrow();
    expect(() => recordFullyDegraded({ reason: "deadline_hit", llmCalls: 0 })).not.toThrow();
  });
});
