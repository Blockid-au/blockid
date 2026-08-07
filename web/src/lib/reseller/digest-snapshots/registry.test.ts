import { describe, expect, it } from "vitest";

import { computeSnapshot } from "./compute";
import {
  DIGEST_SNAPSHOT_REGISTRY,
  REGISTRY_DIMENSIONS,
  REGISTRY_KINDS,
  getSnapshotBySlug,
  getSnapshotsByDimension,
  getSnapshotsByKind,
} from "./registry";
import { mean, median, mode, stdev, variance, cv, geomean, harmean } from "./metrics/moment";
import { percentile, p10, p50, p90, p95, p99 } from "./metrics/percentile";
import { iqr, mad, midhinge, peakToNMean, peakToCubicMean, range } from "./metrics/dispersion";
import { coverage, directionStreak, longestRun, momentum } from "./metrics/streak";

describe("registry — shape", () => {
  it("has at least 20 entries", () => {
    expect(DIGEST_SNAPSHOT_REGISTRY.length).toBeGreaterThanOrEqual(20);
  });

  it("all slugs are unique", () => {
    const slugs = DIGEST_SNAPSHOT_REGISTRY.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all slugs are non-empty kebab-case strings", () => {
    for (const e of DIGEST_SNAPSHOT_REGISTRY) {
      expect(typeof e.slug).toBe("string");
      expect(e.slug.length).toBeGreaterThan(0);
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("every entry declares a whitelisted kind", () => {
    const allowed = new Set<string>(REGISTRY_KINDS);
    for (const e of DIGEST_SNAPSHOT_REGISTRY) {
      expect(allowed.has(e.kind)).toBe(true);
    }
  });

  it("every entry declares a whitelisted dimension", () => {
    const allowed = new Set<string>(REGISTRY_DIMENSIONS);
    for (const e of DIGEST_SNAPSHOT_REGISTRY) {
      expect(allowed.has(e.dimension)).toBe(true);
    }
  });

  it("every metric is a callable function", () => {
    for (const e of DIGEST_SNAPSHOT_REGISTRY) {
      expect(typeof e.metric).toBe("function");
    }
  });
});

describe("registry — lookup helpers", () => {
  it("getSnapshotBySlug returns the entry when present", () => {
    const first = DIGEST_SNAPSHOT_REGISTRY[0];
    expect(getSnapshotBySlug(first.slug)?.slug).toBe(first.slug);
  });

  it("getSnapshotBySlug returns undefined when missing", () => {
    expect(getSnapshotBySlug("no-such-slug-exists-anywhere")).toBeUndefined();
  });

  it("getSnapshotsByKind returns only entries of that kind", () => {
    const perMetric = getSnapshotsByKind("per-metric");
    expect(perMetric.length).toBeGreaterThan(0);
    for (const e of perMetric) expect(e.kind).toBe("per-metric");
  });

  it("getSnapshotsByDimension returns only entries of that dimension", () => {
    const moment = getSnapshotsByDimension("moment");
    expect(moment.length).toBeGreaterThan(0);
    for (const e of moment) expect(e.dimension).toBe("moment");
  });
});

describe("computeSnapshot — round-trip", () => {
  it("emits { slug, value, count } for finite rows", () => {
    const out = computeSnapshot(
      [{ value: 1 }, { value: 2 }, { value: 3 }],
      mean,
      "test-mean",
    );
    expect(out).toEqual({ slug: "test-mean", value: 2, count: 3 });
  });

  it("drops NaN and Infinity rows before folding", () => {
    const out = computeSnapshot(
      [
        { value: 1 },
        { value: Number.NaN },
        { value: 2 },
        { value: Number.POSITIVE_INFINITY },
        { value: 3 },
      ],
      mean,
      "test-mean-guarded",
    );
    expect(out.count).toBe(3);
    expect(out.value).toBe(2);
  });

  it("empty input folds to 0 (family convention)", () => {
    const out = computeSnapshot([], mean, "test-mean-empty");
    expect(out).toEqual({ slug: "test-mean-empty", value: 0, count: 0 });
  });
});

describe("moment family — sanity", () => {
  it("mean of [1,2,3] = 2", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
  it("median of [1,2,3,4,5] = 3", () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });
  it("median of [1,2,3,4] = 2.5", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("mode of [1,2,2,3,3,3] = 3", () => {
    expect(mode([1, 2, 2, 3, 3, 3])).toBe(3);
  });
  it("variance of [1,2,3] = 2/3", () => {
    expect(variance([1, 2, 3])).toBeCloseTo(2 / 3);
  });
  it("stdev of [1,2,3] = sqrt(2/3)", () => {
    expect(stdev([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
  });
  it("cv of [2,2,2] = 0 (no dispersion)", () => {
    expect(cv([2, 2, 2])).toBe(0);
  });
  it("geomean of [1,10,100] = 10", () => {
    expect(geomean([1, 10, 100])).toBeCloseTo(10);
  });
  it("harmean of [1,2,4] ≈ 1.714", () => {
    expect(harmean([1, 2, 4])).toBeCloseTo(12 / 7);
  });
  it("empty inputs return 0 for every moment helper", () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(mode([])).toBe(0);
    expect(variance([])).toBe(0);
    expect(stdev([])).toBe(0);
    expect(cv([])).toBe(0);
    expect(geomean([])).toBe(0);
    expect(harmean([])).toBe(0);
  });
});

describe("percentile family — sanity", () => {
  it("p50 of [1,2,3,4,5] = 3", () => {
    expect(p50([1, 2, 3, 4, 5])).toBe(3);
  });
  it("p10 of [1..10] = 1.9 (linear interpolation)", () => {
    expect(p10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(1.9);
  });
  it("p90 of [1..10] = 9.1", () => {
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(9.1);
  });
  it("p95 and p99 stay monotonic in the tail", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(p99(v)).toBeGreaterThanOrEqual(p95(v));
    expect(p95(v)).toBeGreaterThanOrEqual(p90(v));
  });
  it("percentile clamps out-of-range q", () => {
    expect(percentile([1, 2, 3], -50)).toBe(1);
    expect(percentile([1, 2, 3], 250)).toBe(3);
  });
  it("empty input returns 0", () => {
    expect(p50([])).toBe(0);
  });
});

describe("dispersion family — sanity", () => {
  it("range of [1,5,3] = 4", () => {
    expect(range([1, 5, 3])).toBe(4);
  });
  it("iqr of [1..9] = 4", () => {
    expect(iqr([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(4);
  });
  it("mad of [1,2,3,4,5] = 1.2", () => {
    expect(mad([1, 2, 3, 4, 5])).toBeCloseTo(1.2);
  });
  it("midhinge of [1..9] = 5", () => {
    expect(midhinge([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(5);
  });
  it("peakToCubicMean of [1,2,3,4,10] = 10 / mean([10,4,3]) = 10 / 5.667", () => {
    expect(peakToCubicMean([1, 2, 3, 4, 10])).toBeCloseTo(10 / ((10 + 4 + 3) / 3));
  });
  it("peakToNMean caps N at values.length", () => {
    expect(peakToNMean([1, 2, 3], 100)).toBeCloseTo(3 / 2);
  });
  it("peakToNMean returns 0 when all top values are 0", () => {
    expect(peakToNMean([0, 0, 0], 3)).toBe(0);
  });
  it("empty input returns 0 for every dispersion helper", () => {
    expect(range([])).toBe(0);
    expect(iqr([])).toBe(0);
    expect(mad([])).toBe(0);
    expect(midhinge([])).toBe(0);
    expect(peakToNMean([], 3)).toBe(0);
  });
});

describe("streak family — sanity", () => {
  it("directionStreak of [+,+,-,+,+,+] = 3", () => {
    // signs are the transitions between consecutive elements — build a
    // series that yields +,+,-,+,+,+ so the tail streak = 3.
    const series = [0, 1, 2, 1, 2, 3, 4];
    expect(directionStreak(series)).toBe(3);
  });
  it("directionStreak returns 0 when the last transition is flat", () => {
    expect(directionStreak([1, 2, 3, 3])).toBe(0);
  });
  it("longestRun spots the longest same-direction run anywhere", () => {
    // signs: +,+,+,-,+,+ → longest = 3
    expect(longestRun([0, 1, 2, 3, 2, 3, 4])).toBe(3);
  });
  it("momentum(3) sums the last 3 signed transitions", () => {
    // signs: +,+,-,+,+,+  last 3 = +,+,+ → 3
    expect(momentum([0, 1, 2, 1, 2, 3, 4], 3)).toBe(3);
  });
  it("coverage is fraction of non-flat transitions", () => {
    // signs: +,0,+,-,0 → 3/5 = 0.6
    expect(coverage([1, 2, 2, 3, 2, 2])).toBeCloseTo(0.6);
  });
  it("empty and single-element inputs return 0", () => {
    expect(directionStreak([])).toBe(0);
    expect(directionStreak([1])).toBe(0);
    expect(longestRun([])).toBe(0);
    expect(momentum([], 3)).toBe(0);
    expect(coverage([])).toBe(0);
  });
});
