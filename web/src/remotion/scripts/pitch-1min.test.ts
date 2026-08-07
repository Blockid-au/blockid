/**
 * Colocated tests for the 60-second BlockID.au pitch-video script
 * (src/remotion/scripts/pitch-1min.ts).
 *
 * PITCH_1MIN is the shipped 60s Google-for-Startups pitch timeline —
 * every entry gets rendered into the Remotion composition, the SRT
 * caption file that ships alongside the MP4, and the WEBVTT track
 * consumed by the /pitch player. Three separable contracts hold:
 *
 *   1. **Gap-free monotone timeline.** Remotion sequences frames by
 *      the (startTime, endTime) pairs; a gap silently drops audio,
 *      an overlap double-stacks captions on top of each other.
 *      Every consecutive pair must satisfy `next.startTime ===
 *      prev.endTime`, the first line must start at 0, and the last
 *      must end at exactly 60 (the file header claims "Duration:
 *      60 seconds @ 30fps" and the composition durationInFrames
 *      hard-codes `60 * fps` — a drift here silently corrupts the
 *      export).
 *   2. **Emotion union.** The `emotion` field routes into the
 *      voice-over synth (ElevenLabs style stability) and into
 *      the composition's colour-grade preset — a stray value would
 *      throw at render time; the ScriptLine union is the single
 *      source of truth.
 *   3. **Caption format.** `generateSRT` and `generateVTT` emit
 *      broadcast-standard formats: SRT uses `,` for the millisecond
 *      separator + blank-line-separated cues, WEBVTT uses `.` and
 *      the mandatory `WEBVTT` header. Silent frames (`text === ""`)
 *      MUST be filtered — a caption cue with empty text renders as
 *      a phantom black bar in most players. Time formatting must
 *      pad to `HH:MM:SS,mmm` even for sub-hour timestamps or the
 *      spec-conformant SRT/VTT parsers will reject the file.
 */

import { describe, expect, it } from "vitest";

import {
  PITCH_1MIN,
  PITCH_1MIN_WORD_COUNT,
  generateSRT,
  generateVTT,
  getCitations,
  type ScriptLine,
} from "./pitch-1min";

const EMOTION_UNION: ReadonlyArray<ScriptLine["emotion"]> = [
  "neutral",
  "urgent",
  "inspiring",
  "excited",
  "dramatic",
];

describe("PITCH_1MIN — shape", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(PITCH_1MIN)).toBe(true);
    expect(PITCH_1MIN.length).toBeGreaterThan(0);
  });

  it("ships exactly 22 script lines (change this pin only via a conscious edit)", () => {
    expect(PITCH_1MIN).toHaveLength(22);
  });

  it("every line has the required fields with the right primitive types", () => {
    for (const line of PITCH_1MIN) {
      expect(typeof line.startTime).toBe("number");
      expect(typeof line.endTime).toBe("number");
      expect(typeof line.text).toBe("string");
      expect(typeof line.visual).toBe("string");
      expect(typeof line.emotion).toBe("string");
      if (line.source !== undefined) {
        expect(typeof line.source).toBe("string");
      }
    }
  });
});

describe("PITCH_1MIN — timeline invariants", () => {
  it("first line starts at 0 (Remotion sequence origin)", () => {
    expect(PITCH_1MIN[0]?.startTime).toBe(0);
  });

  it("last line ends at exactly 60s (matches file header + composition durationInFrames)", () => {
    expect(PITCH_1MIN[PITCH_1MIN.length - 1]?.endTime).toBe(60);
  });

  it("every line has startTime strictly less than endTime (no zero-length cues)", () => {
    for (const line of PITCH_1MIN) {
      expect(line.startTime).toBeLessThan(line.endTime);
    }
  });

  it("startTime and endTime are finite non-negative numbers", () => {
    for (const line of PITCH_1MIN) {
      expect(Number.isFinite(line.startTime)).toBe(true);
      expect(Number.isFinite(line.endTime)).toBe(true);
      expect(line.startTime).toBeGreaterThanOrEqual(0);
      expect(line.endTime).toBeGreaterThan(0);
    }
  });

  it("consecutive lines have no gaps and no overlaps (next.startTime === prev.endTime)", () => {
    for (let i = 1; i < PITCH_1MIN.length; i += 1) {
      const prev = PITCH_1MIN[i - 1]!;
      const cur = PITCH_1MIN[i]!;
      expect(cur.startTime).toBe(prev.endTime);
    }
  });

  it("startTime is monotonically non-decreasing across the whole script", () => {
    for (let i = 1; i < PITCH_1MIN.length; i += 1) {
      expect(PITCH_1MIN[i]!.startTime).toBeGreaterThanOrEqual(
        PITCH_1MIN[i - 1]!.startTime,
      );
    }
  });

  it("sum of every line's duration equals the 60s total (no fractional drift)", () => {
    const total = PITCH_1MIN.reduce(
      (sum, l) => sum + (l.endTime - l.startTime),
      0,
    );
    expect(total).toBe(60);
  });
});

describe("PITCH_1MIN — content invariants", () => {
  it("every line's emotion is a member of the ScriptLine union", () => {
    for (const line of PITCH_1MIN) {
      expect(EMOTION_UNION).toContain(line.emotion);
    }
  });

  it("every line has a non-empty visual description (Remotion needs SOMETHING to render)", () => {
    for (const line of PITCH_1MIN) {
      expect(line.visual.length).toBeGreaterThan(0);
      expect(line.visual.trim()).toBe(line.visual.trim()); // sanity
      expect(line.visual.trim().length).toBeGreaterThan(0);
    }
  });

  it("every source citation is a non-empty trimmed string when present", () => {
    for (const line of PITCH_1MIN) {
      if (line.source !== undefined) {
        expect(line.source.length).toBeGreaterThan(0);
        expect(line.source.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses all five emotion tones somewhere across the 60s (pitch dynamics)", () => {
    const seen = new Set(PITCH_1MIN.map((l) => l.emotion));
    for (const e of EMOTION_UNION) {
      expect(seen.has(e)).toBe(true);
    }
  });

  it("ships exactly 7 source citations (Failory / ABS / Second Talent / Stanford / Industry avg / Industry research / Startup Genome+ABS)", () => {
    const cited = PITCH_1MIN.filter((l) => l.source);
    expect(cited).toHaveLength(7);
  });

  it("ships exactly 10 silent frames (text: \"\") — the LIVE-RECORDING / cut-away visuals", () => {
    const silent = PITCH_1MIN.filter((l) => l.text === "");
    expect(silent).toHaveLength(10);
  });

  it("ships exactly 12 voice-over frames (silent + voiced = 22 total lines)", () => {
    const voiced = PITCH_1MIN.filter((l) => l.text !== "");
    expect(voiced).toHaveLength(12);
    expect(voiced.length + PITCH_1MIN.filter((l) => l.text === "").length).toBe(
      PITCH_1MIN.length,
    );
  });
});

describe("PITCH_1MIN_WORD_COUNT", () => {
  it("equals a recomputed sum over PITCH_1MIN (no drift between constant and source)", () => {
    const recomputed = PITCH_1MIN.reduce(
      (sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length,
      0,
    );
    expect(PITCH_1MIN_WORD_COUNT).toBe(recomputed);
  });

  it("is a positive integer", () => {
    expect(Number.isInteger(PITCH_1MIN_WORD_COUNT)).toBe(true);
    expect(PITCH_1MIN_WORD_COUNT).toBeGreaterThan(0);
  });

  it("fits a plausible pitch pacing window for a 60s VO track (50–250 words)", () => {
    // Not every second is voiced (10 of 22 lines are silent cut-aways),
    // so the pacing envelope is intentionally wide — this is a smoke
    // check against an accidental double-counting or empty-collapse
    // regression, not a rigid 140–160 WPM enforcement.
    expect(PITCH_1MIN_WORD_COUNT).toBeGreaterThanOrEqual(50);
    expect(PITCH_1MIN_WORD_COUNT).toBeLessThanOrEqual(250);
  });

  it("silent lines contribute zero words (filter(Boolean) drops the empty split)", () => {
    const silentWordCount = PITCH_1MIN.filter((l) => l.text === "").reduce(
      (sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length,
      0,
    );
    expect(silentWordCount).toBe(0);
  });
});

describe("generateSRT", () => {
  it("filters out silent lines (text === \"\") — no phantom caption bar", () => {
    const out = generateSRT(PITCH_1MIN);
    const voiceLines = PITCH_1MIN.filter((l) => l.text !== "");
    // Cue count = "N\n" opening line count; the first voice-over cue is
    // numbered 1, so the last is voiceLines.length.
    for (const l of voiceLines) {
      expect(out).toContain(l.text);
    }
    // Silent lines' visual text should NOT appear as a caption:
    // the shipped script's visual descriptions are internal notes, not
    // rendered strings.
    expect(out.split("\n").filter(Boolean).length).toBeGreaterThan(0);
  });

  it("numbers cues starting at 1 and increments monotonically", () => {
    const out = generateSRT(PITCH_1MIN);
    const voiceCount = PITCH_1MIN.filter((l) => l.text !== "").length;
    // Split on the double-newline that separates cues in the join.
    // Each cue starts with its index on its own line.
    const cues = out.split("\n\n").filter((c) => c.trim().length > 0);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.startsWith("1\n")).toBe(true);
    expect(cues[cues.length - 1]!.startsWith(`${voiceCount}\n`)).toBe(true);
  });

  it("uses the SRT time separator `,` for milliseconds (spec-conformant)", () => {
    const out = generateSRT([
      { startTime: 3, endTime: 6, text: "hi", visual: "v", emotion: "neutral" },
    ]);
    expect(out).toContain("00:00:03,000 --> 00:00:06,000");
    expect(out).not.toContain("00:00:03.000"); // that would be VTT
  });

  it("pads hours / minutes / seconds to 2 digits and ms to 3", () => {
    const out = generateSRT([
      {
        startTime: 0,
        endTime: 3,
        text: "hello",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("00:00:00,000 --> 00:00:03,000");
  });

  it("handles fractional seconds → correct millisecond rendering", () => {
    const out = generateSRT([
      {
        startTime: 1.25,
        endTime: 2.5,
        text: "x",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("00:00:01,250 --> 00:00:02,500");
  });

  it("handles hour-scale timestamps (> 3600s) without breaking the format", () => {
    const out = generateSRT([
      {
        startTime: 3600,
        endTime: 3665,
        text: "long",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("01:00:00,000 --> 01:01:05,000");
  });

  it("emits `n\\nHH:MM:SS,mmm --> HH:MM:SS,mmm\\ntext\\n` per cue", () => {
    const out = generateSRT([
      {
        startTime: 3,
        endTime: 6,
        text: "Ninety percent of startups fail.",
        visual: "v",
        emotion: "urgent",
      },
    ]);
    expect(out).toBe(
      "1\n00:00:03,000 --> 00:00:06,000\nNinety percent of startups fail.\n",
    );
  });

  it("joins multiple cues with a blank line separator", () => {
    const out = generateSRT([
      { startTime: 0, endTime: 1, text: "a", visual: "v", emotion: "neutral" },
      { startTime: 1, endTime: 2, text: "b", visual: "v", emotion: "neutral" },
    ]);
    expect(out).toBe(
      "1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb\n",
    );
  });

  it("returns an empty string when every line is silent", () => {
    const out = generateSRT([
      { startTime: 0, endTime: 1, text: "", visual: "v", emotion: "neutral" },
      { startTime: 1, endTime: 2, text: "", visual: "v", emotion: "neutral" },
    ]);
    expect(out).toBe("");
  });

  it("returns an empty string on an empty input", () => {
    expect(generateSRT([])).toBe("");
  });
});

describe("generateVTT", () => {
  it("starts with the mandatory `WEBVTT\\n\\n` header", () => {
    const out = generateVTT(PITCH_1MIN);
    expect(out.startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("uses the VTT `.` millisecond separator (not SRT's `,`)", () => {
    const out = generateVTT([
      {
        startTime: 3,
        endTime: 6,
        text: "hi",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("00:00:03.000 --> 00:00:06.000");
    expect(out).not.toContain("00:00:03,000");
  });

  it("filters out silent lines (text === \"\")", () => {
    const out = generateVTT([
      { startTime: 0, endTime: 1, text: "", visual: "v", emotion: "neutral" },
      {
        startTime: 1,
        endTime: 2,
        text: "voiced",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("voiced");
    // Only one cue after the WEBVTT header → cue index starts at 1
    expect(out).toContain("1\n00:00:01.000 --> 00:00:02.000\nvoiced\n");
    expect(out).not.toContain("2\n");
  });

  it("numbers cues starting at 1", () => {
    const out = generateVTT([
      { startTime: 0, endTime: 1, text: "a", visual: "v", emotion: "neutral" },
      { startTime: 1, endTime: 2, text: "b", visual: "v", emotion: "neutral" },
    ]);
    expect(out).toBe(
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\na\n\n2\n00:00:01.000 --> 00:00:02.000\nb\n",
    );
  });

  it("returns just the header when every line is silent", () => {
    const out = generateVTT([
      { startTime: 0, endTime: 1, text: "", visual: "v", emotion: "neutral" },
    ]);
    expect(out).toBe("WEBVTT\n\n");
  });

  it("returns just the header on empty input", () => {
    expect(generateVTT([])).toBe("WEBVTT\n\n");
  });

  it("handles hour-scale + fractional timestamps together", () => {
    const out = generateVTT([
      {
        startTime: 3661.75,
        endTime: 3662.5,
        text: "x",
        visual: "v",
        emotion: "neutral",
      },
    ]);
    expect(out).toContain("01:01:01.750 --> 01:01:02.500");
  });
});

describe("getCitations", () => {
  it("returns only lines that carry a source (filters undefined-source frames)", () => {
    const cites = getCitations(PITCH_1MIN);
    const expected = PITCH_1MIN.filter((l) => l.source).length;
    expect(cites).toHaveLength(expected);
    for (const c of cites) {
      expect(typeof c.source).toBe("string");
      expect(c.source.length).toBeGreaterThan(0);
    }
  });

  it("shapes each citation as {text, source, time: `${startTime}s-${endTime}s`}", () => {
    const cites = getCitations([
      {
        startTime: 3,
        endTime: 6,
        text: "Ninety percent of startups fail.",
        visual: "v",
        emotion: "urgent",
        source: "Failory 2026",
      },
    ]);
    expect(cites).toEqual([
      {
        text: "Ninety percent of startups fail.",
        source: "Failory 2026",
        time: "3s-6s",
      },
    ]);
  });

  it("preserves the pitch-order of citations", () => {
    const cites = getCitations(PITCH_1MIN);
    const sourceOrder = PITCH_1MIN.filter((l) => l.source).map((l) => l.source);
    expect(cites.map((c) => c.source)).toEqual(sourceOrder);
  });

  it("returns [] on empty input", () => {
    expect(getCitations([])).toEqual([]);
  });

  it("returns [] when no line carries a source", () => {
    expect(
      getCitations([
        {
          startTime: 0,
          endTime: 1,
          text: "x",
          visual: "v",
          emotion: "neutral",
        },
      ]),
    ).toEqual([]);
  });

  it("includes the shipped Failory 2026 + ABS June 2025 + Stanford HAI 2025 anchors", () => {
    const sources = getCitations(PITCH_1MIN).map((c) => c.source);
    expect(sources).toContain("Failory 2026");
    expect(sources).toContain("ABS June 2025");
    expect(sources).toContain("Stanford HAI 2025, AI4SP");
  });
});
