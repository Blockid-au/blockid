import { describe, expect, it } from "vitest";

import {
  cohortBandsForRun,
  cohortStageLabel,
  dataRoomBuildUp,
  DATA_ROOM_SECTIONS,
  DATA_ROOM_TOTAL_DOCUMENTS,
  JOURNEY_PHASES,
  phaseOrderForRun,
  runById,
  SAMPLE_RUNS,
  SVI_DIMENSIONS,
} from "./sample-runs";

// These assertions are the provenance gate for the homepage. Every number
// the page renders comes through this module, so pinning them here means a
// silent edit to a marketing figure fails the build rather than shipping.

describe("SAMPLE_RUNS", () => {
  it("carries exactly the three published anonymised runs", () => {
    expect(SAMPLE_RUNS.map((r) => r.id)).toEqual(["idea", "mvp", "revenue"]);
  });

  it("keeps the published scores and valuation ranges verbatim", () => {
    expect(
      SAMPLE_RUNS.map((r) => [
        r.sviScore,
        r.valuationLowLabel,
        r.valuationHighLabel,
      ]),
    ).toEqual([
      [42, "A$180K", "A$420K"],
      [58, "A$850K", "A$2.1M"],
      [71, "A$4.2M", "A$8.5M"],
    ]);
  });

  it("keeps numeric valuations in step with their display labels", () => {
    for (const run of SAMPLE_RUNS) {
      expect(run.valuationHigh).toBeGreaterThan(run.valuationLow);
    }
    expect(runById("revenue").valuationLow).toBe(4_200_000);
    expect(runById("idea").valuationHigh).toBe(420_000);
  });

  it("publishes four dimension readings per run and no more", () => {
    for (const run of SAMPLE_RUNS) {
      expect(Object.keys(run.measured)).toHaveLength(4);
    }
  });
});

describe("SVI_DIMENSIONS", () => {
  it("names all eight dimensions", () => {
    expect(SVI_DIMENSIONS).toHaveLength(8);
    expect(SVI_DIMENSIONS.map((d) => d.key)).toEqual([
      "ftv",
      "mpc",
      "ptd",
      "tre",
      "cgh",
      "iri",
      "lco",
      "svm",
    ]);
  });
});

describe("cohortBandsForRun", () => {
  it("returns one band per dimension with avg below top", () => {
    const bands = cohortBandsForRun(runById("revenue"));
    expect(bands).toHaveLength(8);
    for (const b of bands) expect(b.top).toBeGreaterThan(b.avg);
  });

  it("carries the run's reading only where one was published", () => {
    const bands = cohortBandsForRun(runById("revenue"));
    const measured = bands.filter((b) => b.measured !== null);
    expect(measured.map((b) => [b.key, b.measured])).toEqual([
      ["ftv", 70],
      ["mpc", 78],
      ["ptd", 65],
      ["tre", 72],
    ]);
    expect(bands.filter((b) => b.measured === null)).toHaveLength(4);
  });

  it("matches each run to the cohort stage of the same name", () => {
    expect(cohortStageLabel(runById("idea"))).toBe("Idea");
    expect(cohortStageLabel(runById("revenue"))).toBe("Revenue");
  });
});

describe("phaseOrderForRun", () => {
  it("uses the product's own phase resolver and stays inside 1..12", () => {
    for (const run of SAMPLE_RUNS) {
      const order = phaseOrderForRun(run);
      expect(order).toBeGreaterThanOrEqual(1);
      expect(order).toBeLessThanOrEqual(JOURNEY_PHASES.length);
    }
  });

  it("places later-stage runs no earlier on the journey", () => {
    const orders = SAMPLE_RUNS.map(phaseOrderForRun);
    expect(orders[1]).toBeGreaterThanOrEqual(orders[0]);
    expect(orders[2]).toBeGreaterThanOrEqual(orders[1]);
  });
});

describe("JOURNEY_PHASES", () => {
  it("is the twelve phases, in order, starting at Vision & Mission", () => {
    expect(JOURNEY_PHASES).toHaveLength(12);
    expect(JOURNEY_PHASES.map((p) => p.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(JOURNEY_PHASES[0].title).toBe("Vision & Mission");
    expect(JOURNEY_PHASES[11].title).toBe("Funding");
  });
});

describe("data room", () => {
  it("strips the template's leading numbers from section names", () => {
    expect(DATA_ROOM_SECTIONS[0].name).toBe("Corporate & Legal");
    for (const s of DATA_ROOM_SECTIONS) {
      expect(s.name).not.toMatch(/^\d/);
    }
  });

  it("build-up is cumulative and ends at the full checklist", () => {
    const steps = dataRoomBuildUp();
    expect(steps.map((s) => s.stage)).toEqual([
      "idea",
      "mvp",
      "launch",
      "revenue",
      "raise",
    ]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].cumulative).toBeGreaterThan(steps[i - 1].cumulative);
    }
    expect(steps[steps.length - 1].cumulative).toBe(DATA_ROOM_TOTAL_DOCUMENTS);
    expect(
      steps.reduce((sum, s) => sum + s.added, 0),
    ).toBe(DATA_ROOM_TOTAL_DOCUMENTS);
  });

  it("every section lands in exactly one stage of the build-up", () => {
    const named = dataRoomBuildUp().flatMap((s) => s.sections);
    expect(new Set(named).size).toBe(DATA_ROOM_SECTIONS.length);
  });
});
