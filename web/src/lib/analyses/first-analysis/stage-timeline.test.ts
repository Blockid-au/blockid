// Colocated suite for the TBR live stage timeline (26/09/2026).
//
// Pins: the timeline a claimed run starts from (upload, reading and the
// baseline are real facts from the row); every orchestrator event flips the
// right stage and nothing advances on its own; the skipped / failed rules;
// the payload summary (percent, remaining capped by the deadline, overrun,
// done = 100); the per-stage durations for the ETA ledger; and the upload
// card built from XHR bytes.

import { describe, expect, it } from "vitest";

import type { PipelineEvent } from "@/lib/report-pipeline/orchestrator";
import {
  DEFAULT_STAGE_SECONDS,
  TBR_STAGE_KEYS,
  applyPipelineEvent,
  clientIntakeTimeline,
  defaultStageEtas,
  documentDetail,
  failStages,
  finalizeStages,
  initialStages,
  isTimelineView,
  latestIso,
  queuedStages,
  stageDurationsMs,
  stagesFromLegacyPhase,
  summariseTimeline,
  type TbrStageRecord,
} from "./stage-timeline";

const CREATED = "2026-09-26T01:00:00.000Z";
const CLAIMED = "2026-09-26T01:00:04.000Z";
const at = (sec: number) => new Date(Date.parse(CLAIMED) + sec * 1000).toISOString();
const byKey = (stages: TbrStageRecord[], key: string) => stages.find((s) => s.key === key)!;

function fresh(): TbrStageRecord[] {
  return initialStages({
    createdAt: CREATED,
    claimedAt: CLAIMED,
    document: { filename: "deck.pdf", units: 12, unitLabel: "slides", words: 1800 },
    company: "Acme",
    baselineSvi: 104.4,
    stageLabel: "Seed",
  });
}

const chapter = (degraded = false) => ({ degraded }) as unknown as Extract<PipelineEvent, { type: "dimension_complete" }>["chapter"];

describe("documentDetail", () => {
  it("reads real numbers from the saved row: slides, words, sections, truncation", () => {
    const d = documentDetail({
      input_filename: "pitch.pdf",
      input_chars: 5400,
      input_truncated: true,
      input_text: "one two three four",
      intake: { structured: { slides: ["a", "b", "c"], deckSections: { problem: ["a"], market: [], team: ["c"] } } },
    });
    expect(d).toEqual({ filename: "pitch.pdf", units: 3, unitLabel: "slides", words: 4, chars: 5400, truncated: true, sections: ["problem", "team"] });
  });

  it("counts pages when there are no slides, and says nothing it does not know", () => {
    expect(documentDetail({ intake: { structured: { extractedUnits: [{ kind: "page" }, { kind: "page" }, { kind: "text" }] } } })).toEqual({ units: 2, unitLabel: "pages" });
    expect(documentDetail({})).toEqual({});
  });
});

describe("initialStages / queuedStages", () => {
  it("starts a claimed run with upload, reading and the baseline done and the pipeline waiting", () => {
    const s = fresh();
    expect(s.map((x) => x.key)).toEqual([...TBR_STAGE_KEYS]);
    expect(s.slice(0, 3).map((x) => x.status)).toEqual(["done", "done", "done"]);
    expect(s.slice(3).every((x) => x.status === "waiting")).toBe(true);
    expect(byKey(s, "read").detail).toMatchObject({ units: 12, unitLabel: "slides", words: 1800 });
    expect(byKey(s, "score")).toMatchObject({ startedAt: CREATED, finishedAt: CLAIMED, detail: { company: "Acme", baselineSvi: 104, stageLabel: "Seed" } });
  });

  it("shows a never-claimed row as queued on the score stage (held for the cap when it is)", () => {
    const q = queuedStages(CREATED, { words: 10 });
    expect(byKey(q, "score")).toMatchObject({ status: "running", detail: { queued: true } });
    expect(byKey(queuedStages(CREATED, {}, { heldForCap: true }), "score").detail).toMatchObject({ heldForCap: true });
  });

  it("derives a coarse timeline for a run written before stages existed", () => {
    const s = stagesFromLegacyPhase(CREATED, {}, "analyze", 3);
    expect(byKey(s, "evidence").status).toBe("done");
    expect(byKey(s, "agents").status).toBe("running");
    expect(byKey(s, "dimensions")).toMatchObject({ status: "running", detail: { done: 3, total: 8 } });
    expect(byKey(s, "synthesis").status).toBe("waiting");
  });
});

describe("applyPipelineEvent — a full run, event by event", () => {
  it("flips each stage only on its real event and records what came back", () => {
    const s = fresh();
    const ev = (e: unknown, t: number) => applyPipelineEvent(s, e as PipelineEvent, at(t));

    expect(ev({ type: "context", industry: "Fintech", stage: 2, stageLabel: "Seed", phaseId: "p", tier: "standard", estimatedCalls: 30, estimatedSeconds: 420, dims: ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"] }, 1)).toBe(true);
    expect(byKey(s, "evidence")).toMatchObject({ status: "running", startedAt: at(1), detail: { industry: "Fintech" } });
    expect(byKey(s, "dimensions")).toMatchObject({ status: "waiting", detail: { total: 8 } });

    ev({ type: "gather_complete", evidenceRows: 14, connectors: [], diagnostics: { marketResearch: { ms: 8123, status: "ok" }, ga4: { ms: 2, status: "skipped", note: "no db" } } }, 40);
    expect(byKey(s, "evidence")).toMatchObject({ status: "done", finishedAt: at(40), detail: { evidenceRows: 14, sources: [{ name: "marketResearch", status: "ok", ms: 8123 }, { name: "ga4", status: "skipped", ms: 2 }] } });

    ev({ type: "progress", completed: 15, total: 100, phase: "wave1" }, 41);
    expect(byKey(s, "agents")).toMatchObject({ status: "running", detail: { wave: 1 } });
    ev({ type: "progress", completed: 45, total: 100, phase: "wave2" }, 80);
    expect(byKey(s, "agents").detail?.wave).toBe(2);

    ev({ type: "progress", completed: 80, total: 100, phase: "wave4" }, 140);
    expect(byKey(s, "agents")).toMatchObject({ status: "done", finishedAt: at(140) });
    for (const d of ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]) ev({ type: "dimension_start", dim: d, ownerAgent: "cfo" }, 140);
    expect(byKey(s, "dimensions").detail?.writing).toHaveLength(8);

    ev({ type: "dimension_complete", dim: "tre", chapter: chapter() }, 170);
    ev({ type: "dimension_complete", dim: "mpc", chapter: chapter(true) }, 175);
    // A duplicate landing is not counted twice.
    expect(ev({ type: "dimension_complete", dim: "mpc", chapter: chapter(true) }, 176)).toBe(false);
    expect(byKey(s, "dimensions")).toMatchObject({ status: "running", detail: { done: 2, degraded: 1, landed: ["tre", "mpc"] } });
    expect(byKey(s, "dimensions").detail?.writing).not.toContain("tre");

    for (const d of ["ftv", "ptd", "cgh", "iri", "lco", "svm"]) ev({ type: "dimension_complete", dim: d, chapter: chapter() }, 260);
    expect(byKey(s, "dimensions")).toMatchObject({ status: "done", finishedAt: at(260), detail: { done: 8, degraded: 1 } });

    ev({ type: "valuation_complete", chapter: { status: "ok", consensus: { lowAud: 1_200_000, midAud: 2_000_000, highAud: 3_100_000, confidence: 0.5 } } }, 261);
    expect(byKey(s, "valuation")).toMatchObject({ status: "done", detail: { lowAud: 1_200_000, midAud: 2_000_000, highAud: 3_100_000 } });

    ev({ type: "progress", completed: 85, total: 100, phase: "synthesizing" }, 262);
    expect(byKey(s, "synthesis")).toMatchObject({ status: "running", startedAt: at(262) });
    ev({ type: "executive_complete", summary: "x" }, 300);
    expect(byKey(s, "synthesis").status).toBe("done");
    expect(byKey(s, "audit")).toMatchObject({ status: "running", startedAt: at(300) });
    ev({ type: "audit_complete", groundedShare: 0.853, revised: 2 }, 330);
    expect(byKey(s, "audit")).toMatchObject({ status: "done", detail: { groundedPct: 85, revised: 2 } });
    ev({ type: "progress", completed: 95, total: 100, phase: "rendering" }, 331);
    expect(byKey(s, "assemble").status).toBe("running");
    ev({ type: "done", reportId: "r", totalMs: 1, calls: 30, costAud: 0, costUsd: 0, costReportedCalls: 0, degradedSections: [], deadlineHit: true, budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 }, 333);
    expect(s.every((x) => x.status === "done")).toBe(true);
    expect(byKey(s, "assemble").detail?.deadlineHit).toBe(true);

    const ms = stageDurationsMs(s);
    expect(ms.evidence).toBe(39_000);
    expect(ms.dimensions).toBe(120_000);
    expect(ms.score).toBe(4_000);
    expect(ms).not.toHaveProperty("received");
  });

  it("skips a stage the run never reached and marks an unavailable valuation honestly", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "context", dims: [] } as unknown as PipelineEvent, at(1));
    applyPipelineEvent(s, { type: "progress", completed: 85, total: 100, phase: "synthesizing" } as PipelineEvent, at(50));
    expect(byKey(s, "evidence").status).toBe("done");
    for (const k of ["agents", "dimensions", "valuation"]) expect(byKey(s, k)).toMatchObject({ status: "skipped", detail: { reason: "not_run" } });

    const t = fresh();
    applyPipelineEvent(t, { type: "valuation_complete", chapter: { status: "unavailable" } } as unknown as PipelineEvent, at(5));
    expect(byKey(t, "valuation")).toMatchObject({ status: "done", detail: { unavailable: true } });
  });

  it("ignores events that carry no stage information", () => {
    const s = fresh();
    expect(applyPipelineEvent(s, { type: "error", message: "x", degraded: true } as PipelineEvent, at(1))).toBe(false);
    expect(applyPipelineEvent(s, { type: "progress", completed: 1, total: 100, phase: "unknown" } as unknown as PipelineEvent, at(1))).toBe(false);
  });
});

describe("failStages / finalizeStages", () => {
  it("marks the running stage failed with a machine reason and leaves later stages waiting", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "progress", completed: 15, total: 100, phase: "wave1" } as PipelineEvent, at(3));
    failStages(s, at(90), "degraded");
    expect(byKey(s, "agents")).toMatchObject({ status: "failed", finishedAt: at(90), detail: { reason: "degraded" } });
    expect(byKey(s, "synthesis").status).toBe("waiting");
  });

  it("fails the next waiting stage when nothing was running", () => {
    const s = fresh();
    failStages(s, at(2), "error");
    expect(byKey(s, "evidence")).toMatchObject({ status: "failed", detail: { reason: "error" } });
  });

  it("finalises: running becomes done, never-started becomes skipped", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "context", dims: [] } as unknown as PipelineEvent, at(1));
    finalizeStages(s, at(10));
    expect(byKey(s, "evidence").status).toBe("done");
    expect(byKey(s, "audit")).toMatchObject({ status: "skipped", detail: { reason: "not_run" } });
  });
});

describe("summariseTimeline", () => {
  const etas = defaultStageEtas();

  it("weights percent by stage ETAs, counts a running stage up to 95 %, and estimates the time left", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "context", dims: [] } as unknown as PipelineEvent, at(0));
    const v = summariseTimeline({ stages: s, etas, now: new Date(at(20)), state: "running", createdAt: CREATED, lastUpdateAt: at(18), calls: 3 });
    expect(v.current).toBe("evidence");
    expect(v.percent).toBeGreaterThan(0);
    expect(v.percent).toBeLessThan(20);
    const evidence = v.stages.find((x) => x.key === "evidence")!;
    expect(evidence).toMatchObject({ etaSec: DEFAULT_STAGE_SECONDS.evidence, elapsedSec: 20 });
    // waiting stages + what is left of the running one
    const waiting = ["agents", "dimensions", "valuation", "synthesis", "audit", "assemble"].reduce((n, k) => n + etas.stages[k as keyof typeof etas.stages], 0);
    expect(v.remainingSec).toBe(waiting + (DEFAULT_STAGE_SECONDS.evidence - 20));
    expect(v.elapsedSec).toBe(24);
    expect(v).toMatchObject({ state: "running", overrun: false, lastUpdateAt: at(18), serverNow: at(20), calls: 3, samples: 0 });
    expect(isTimelineView(v)).toBe(true);
  });

  it("never promises longer than the pipeline deadline", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "context", dims: [] } as unknown as PipelineEvent, at(0));
    const v = summariseTimeline({ stages: s, etas, now: new Date(at(20)), state: "running", createdAt: CREATED, deadlineAt: at(80) });
    expect(v.remainingSec).toBe(90);
  });

  it("flags a stage well past its usual time as overrun (still running, not stuck)", () => {
    const s = fresh();
    applyPipelineEvent(s, { type: "progress", completed: 15, total: 100, phase: "wave1" } as PipelineEvent, at(0));
    const v = summariseTimeline({ stages: s, etas, now: new Date(at(DEFAULT_STAGE_SECONDS.agents * 2)), state: "running", createdAt: CREATED });
    expect(v.overrun).toBe(true);
    expect(v.remainingSec).toBeGreaterThan(0);
  });

  it("is 100 % with nothing left once the document exists; elapsed freezes at completion", () => {
    const s = fresh();
    finalizeStages(s, at(300));
    const v = summariseTimeline({ stages: s, etas, now: new Date(at(900)), state: "done", createdAt: CREATED, completedAt: at(300) });
    expect(v).toMatchObject({ percent: 100, remainingSec: null, current: null, elapsedSec: 304 });
  });

  it("has no remaining estimate while held for the free cap or after a terminal failure", () => {
    const q = queuedStages(CREATED, {}, { heldForCap: true });
    expect(summariseTimeline({ stages: q, etas, now: new Date(at(5)), state: "held", createdAt: CREATED }).remainingSec).toBeNull();
    expect(summariseTimeline({ stages: fresh(), etas, now: new Date(at(5)), state: "failed", createdAt: CREATED }).remainingSec).toBeNull();
    expect(summariseTimeline({ stages: q, etas, now: new Date(at(5)), state: "queued", createdAt: CREATED }).remainingSec).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("latestIso picks the latest valid stamp", () => {
    expect(latestIso(null, at(3), undefined, at(9), "nope")).toBe(at(9));
    expect(latestIso(null)).toBeNull();
  });

  it("isTimelineView rejects foreign shapes", () => {
    expect(isTimelineView(null)).toBe(false);
    expect(isTimelineView({ stages: [{ key: "bogus" }], percent: 1, state: "running" })).toBe(false);
  });
});

describe("clientIntakeTimeline — the upload card", () => {
  const base = { hasFile: true, filename: "deck.pdf", loaded: 0, total: 4_000_000, uploaded: false, startedAt: 1_000_000, uploadedAt: null, at: 1_000_000 };

  it("shows the upload running with real bytes and every later stage waiting", () => {
    const v = clientIntakeTimeline({ ...base, loaded: 1_000_000, at: 1_003_000 });
    const received = v.stages.find((s) => s.key === "received")!;
    expect(received).toMatchObject({ status: "running", detail: { filename: "deck.pdf", bytesLoaded: 1_000_000, bytesTotal: 4_000_000 } });
    expect(v.stages.find((s) => s.key === "read")?.status).toBe("waiting");
    expect(v.current).toBe("received");
    expect(v.elapsedSec).toBe(3);
  });

  it("switches to reading once the last byte left the browser", () => {
    const v = clientIntakeTimeline({ ...base, loaded: 4_000_000, uploaded: true, uploadedAt: 1_005_000, at: 1_009_000 });
    expect(v.stages.find((s) => s.key === "received")?.status).toBe("done");
    expect(v.stages.find((s) => s.key === "read")).toMatchObject({ status: "running", elapsedSec: 4 });
  });

  it("starts at reading for typed text or a URL (nothing to upload)", () => {
    const v = clientIntakeTimeline({ ...base, hasFile: false, filename: null, total: 0 });
    expect(v.stages.find((s) => s.key === "received")?.status).toBe("done");
    expect(v.current).toBe("read");
  });
});
