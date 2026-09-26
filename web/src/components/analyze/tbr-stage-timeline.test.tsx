// Colocated spec for the live stage timeline card (26/09/2026).
//
// Static renders (the tick effect never runs) pin what the founder sees for
// each state: every stage with its status, the running stage's hint and live
// result chips, elapsed / usual time, the progress bar, the heartbeat band,
// the leave-this-page note (no e-mail promise unless a destination is
// known), the folded-away list once the report is ready, EN and VI; plus
// the pure helpers (chips, liveness band, poll merge) and the upload card.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { IntakeProgressCard, LiveRunTimeline, TbrStageTimeline, livenessBand, mergeLiveView } from "./tbr-stage-timeline";
import { fmtDuration, stageChips } from "./tbr-stage-copy";
import {
  applyPipelineEvent,
  defaultStageEtas,
  finalizeStages,
  initialStages,
  summariseTimeline,
  type TbrTimelineView,
} from "@/lib/analyses/first-analysis/stage-timeline";
import type { PipelineEvent } from "@/lib/report-pipeline/orchestrator";
import type { FullReportView } from "@/lib/analyses/first-analysis/types";

const CREATED = "2026-09-26T01:00:00.000Z";
const at = (sec: number) => new Date(Date.parse(CREATED) + sec * 1000).toISOString();
const STAGE_KEYS = ["received", "read", "score", "evidence", "agents", "dimensions", "valuation", "synthesis", "audit", "assemble"];

function running(lastUpdateSec = 118): TbrTimelineView {
  const s = initialStages({ createdAt: CREATED, claimedAt: at(3), document: { filename: "deck.pdf", units: 12, unitLabel: "slides", words: 2400 }, company: "Acme Pty Ltd", baselineSvi: 104 });
  applyPipelineEvent(s, { type: "context", dims: [] } as unknown as PipelineEvent, at(4));
  applyPipelineEvent(s, { type: "gather_complete", evidenceRows: 14, connectors: [], diagnostics: { marketResearch: { ms: 9000, status: "ok" }, ga4: { ms: 1, status: "skipped" } } } as unknown as PipelineEvent, at(44));
  applyPipelineEvent(s, { type: "progress", completed: 80, total: 100, phase: "wave4" } as PipelineEvent, at(90));
  applyPipelineEvent(s, { type: "dimension_start", dim: "tre", ownerAgent: "cro" } as PipelineEvent, at(90));
  applyPipelineEvent(s, { type: "dimension_start", dim: "cgh", ownerAgent: "cfo" } as PipelineEvent, at(90));
  applyPipelineEvent(s, { type: "dimension_complete", dim: "mpc", chapter: { degraded: false } } as unknown as PipelineEvent, at(110));
  return summariseTimeline({ stages: s, etas: defaultStageEtas(), now: new Date(at(120)), state: "running", createdAt: CREATED, lastUpdateAt: at(lastUpdateSec), calls: 9 });
}

describe("TbrStageTimeline — a running report", () => {
  const html = renderToStaticMarkup(<TbrStageTimeline timeline={running()} receivedAt={0} locale="en" hasLink emailTo="f******@example.com" />);

  it("names the company, shows elapsed, time left and an accessible progress bar", () => {
    expect(html).toContain("Analysing Acme Pty Ltd");
    expect(html).toContain("2m elapsed");
    expect(html).toMatch(/~\d+m( \d+s)? left/);
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="\d+"/);
    expect(html).toContain("A run usually takes ~");
  });

  it("lists every stage with its status; the running one carries aria-current, its hint and live chips", () => {
    for (const k of STAGE_KEYS) expect(html).toContain("data-testid=" + JSON.stringify("tbr-stage-" + k));
    expect(html).toMatch(/aria-current="step" data-testid="tbr-stage-dimensions" data-status="running"/);
    expect(html).toContain("Each owner agent scores and writes one chapter");
    expect(html).toContain("1 of 8 written");
    expect(html).toContain("writing now: CRO (Traction &amp; Revenue), CFO (Cap Table &amp; Governance)");
    expect(html).toContain("12 slides");
    expect(html).toContain("14 evidence rows");
    expect(html).toContain("market research");
    expect(html).toContain("1 not available for this run");
    expect(html).toContain("SVI 104");
    expect(html).toContain("usually ~");
    expect(html).toMatch(/data-testid="tbr-stage-synthesis" data-status="waiting"/);
  });

  it("says the server is alive, how many AI calls answered, and that the visitor may leave", () => {
    expect(html).toContain("Server working · last update 2s ago");
    expect(html).toContain("9 AI calls answered");
    expect(html).toContain("You can leave this page — the report stays at this link.");
    expect(html).toContain("It is also e-mailed to f******@example.com when it lands.");
    expect(html).toMatch(/aria-live="polite"[^>]*>Eight dimension chapters — \d+% complete</);
  });

  it("never promises an e-mail when no destination is known", () => {
    const plain = renderToStaticMarkup(<TbrStageTimeline timeline={running()} receivedAt={0} locale="en" hasLink />);
    expect(plain).not.toContain("e-mailed");
  });

  it("turns the heartbeat amber after three silent minutes, with an honest line", () => {
    const stale = renderToStaticMarkup(<TbrStageTimeline timeline={running(-100)} receivedAt={0} locale="en" />);
    expect(stale).toContain("data-band=" + JSON.stringify("stale"));
    expect(stale).toContain("the run is restarted automatically");
  });

  it("renders in Vietnamese", () => {
    const vi = renderToStaticMarkup(<TbrStageTimeline timeline={running()} receivedAt={0} locale="vi" hasLink />);
    expect(vi).toContain("Đang phân tích Acme Pty Ltd");
    expect(vi).toContain("8 chương theo chiều đánh giá");
    expect(vi).toContain("đã viết 1/8");
    expect(vi).toContain("Máy chủ đang làm việc");
    expect(vi).toContain("Bạn có thể rời trang");
  });

  it("stays light: no dark surfaces, spinners stop under reduced motion", () => {
    expect(html).not.toMatch(/bg-(black|slate-9|gray-9|neutral-9)/);
    expect(html).toContain("motion-reduce:animate-none");
  });
});

describe("TbrStageTimeline — other states", () => {
  it("ready: 100 %, the stage list folds into a details toggle, no heartbeat or leave note", () => {
    const s = initialStages({ createdAt: CREATED, claimedAt: at(3), document: {} });
    finalizeStages(s, at(300));
    const t = summariseTimeline({ stages: s, etas: defaultStageEtas(), now: new Date(at(400)), state: "done", createdAt: CREATED, completedAt: at(300) });
    const html = renderToStaticMarkup(<TbrStageTimeline timeline={t} receivedAt={0} locale="en" hasLink />);
    expect(html).toContain("Report ready");
    expect(html).toContain("aria-valuenow=" + JSON.stringify("100"));
    expect(html).toContain("<details>");
    expect(html).toContain("Show every stage");
    expect(html).not.toContain("tbr-timeline-heartbeat");
    expect(html).not.toContain("tbr-timeline-leave");
    expect(html).toContain("5m elapsed");
  });

  it("before the first poll: a connecting card, busy", () => {
    const html = renderToStaticMarkup(<TbrStageTimeline timeline={null} receivedAt={0} locale="en" />);
    expect(html).toContain("data-state=" + JSON.stringify("connecting"));
    expect(html).toContain("aria-busy=" + JSON.stringify("true"));
  });

  it("a poll failure keeps the card and says the run continues on the server", () => {
    const html = renderToStaticMarkup(<TbrStageTimeline timeline={running()} receivedAt={0} locale="en" connectionTrouble />);
    expect(html).toContain("Your run keeps going on the server.");
  });

  it("LiveRunTimeline renders nothing for a pre-G28 seven-voice row", () => {
    const view = { kind: "s32", timeline: null } as unknown as FullReportView;
    expect(renderToStaticMarkup(<LiveRunTimeline live={{ analysisId: "a", view, receivedAt: 1, connectionTrouble: false }} />)).toBe("");
  });
});

describe("IntakeProgressCard — the upload itself", () => {
  it("shows real upload bytes, the reading step waiting, and no leave note (leaving would cancel)", () => {
    const html = renderToStaticMarkup(
      <IntakeProgressCard progress={{ hasFile: true, filename: "deck.pdf", loaded: 1_048_576, total: 4_194_304, uploaded: false, startedAt: 1000, uploadedAt: null, at: 3000 }} />,
    );
    expect(html).toContain("Uploading and reading your document");
    expect(html).toContain("Uploading 25% · 1.0 MB of 4.0 MB");
    expect(html).toMatch(/data-testid="tbr-stage-read" data-status="waiting"/);
    expect(html).not.toContain("tbr-timeline-leave");
    expect(html).not.toContain("tbr-timeline-heartbeat");
  });

  it("once uploaded, the server-side reading runs", () => {
    const html = renderToStaticMarkup(
      <IntakeProgressCard progress={{ hasFile: true, filename: "deck.pdf", loaded: 4_194_304, total: 4_194_304, uploaded: true, startedAt: 1000, uploadedAt: 5000, at: 6000 }} />,
    );
    expect(html).toContain("4.0 MB received");
    expect(html).toContain("The server is extracting the text now");
  });
});

describe("helpers", () => {
  it("livenessBand", () => {
    expect(livenessBand(null)).toBe("unknown");
    expect(livenessBand(5)).toBe("alive");
    expect(livenessBand(90)).toBe("slow");
    expect(livenessBand(400)).toBe("stale");
  });

  it("mergeLiveView keeps the last good payload through a failed poll", () => {
    const good = { analysisId: "a", view: { status: "running" }, receivedAt: 1, connectionTrouble: false };
    const bad = { analysisId: "a", view: null, receivedAt: 2, connectionTrouble: true };
    expect(mergeLiveView(null, good)).toBe(good);
    expect(mergeLiveView(good, bad)).toEqual({ ...good, connectionTrouble: true });
    expect(mergeLiveView(null, bad)).toBe(bad);
  });

  it("stageChips: valuation range, unavailable valuation, grounding, reasons", () => {
    expect(stageChips({ key: "valuation", status: "done", detail: { lowAud: 1_200_000, midAud: 2_000_000, highAud: 3_100_000 } }, "en")).toEqual(["A$1.2M – A$3.1M", "mid A$2.0M"]);
    expect(stageChips({ key: "valuation", status: "done", detail: { unavailable: true } }, "en")[0]).toMatch(/not calculable/);
    expect(stageChips({ key: "audit", status: "done", detail: { groundedPct: 86, revised: 2 } }, "vi")).toEqual(["86% phần có căn cứ", "2 phần được sửa"]);
    expect(stageChips({ key: "agents", status: "failed", detail: { reason: "retrying" } }, "en")).toEqual(["retried automatically in a few minutes"]);
    expect(stageChips({ key: "score", status: "running", detail: { queued: true } }, "en")).toEqual(["Waiting for a report worker — starts in a moment"]);
  });

  it("fmtDuration", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(59)).toBe("59s");
    expect(fmtDuration(120)).toBe("2m");
    expect(fmtDuration(125)).toBe("2m 5s");
  });
});
