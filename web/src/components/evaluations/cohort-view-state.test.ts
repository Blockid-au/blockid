// cohort-view-state — pure unit tests (G21 P2-B). No DOM: every persistence
// helper takes an explicit `store` so this file never touches real
// localStorage. Pins: column normalisation (unknown dropped, company always
// present, registry order restored), a throwing store degrading to the
// defaults rather than throwing, "Default" always first in the saved views
// and never itself persisted, the MAX_SAVED_VIEWS cap, and the compare
// selection reducer capped at MAX_COMPARE (full → same selection, refuses
// a 5th id).

import { describe, expect, it } from "vitest";
import {
  COHORT_COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_VIEW,
  MAX_COMPARE,
  MAX_SAVED_VIEWS,
  loadColumns,
  loadDensity,
  loadSavedViews,
  normaliseColumns,
  persistSavedViews,
  removeSavedView,
  saveColumns,
  saveDensity,
  toggleCompare,
  upsertSavedView,
  type CohortColumn,
  type SavedView,
} from "./cohort-view-state";

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function fakeStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const THROWING: Store = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("storage blocked");
  },
};

describe("normaliseColumns", () => {
  it("drops unknown columns, keeps registry order, and always includes company", () => {
    expect(normaliseColumns(["decision", "bogus", "svi"])).toEqual(["company", "svi", "decision"]);
  });

  it("adds company even when it is absent from the input", () => {
    expect(normaliseColumns(["gaps"])).toEqual(["company", "gaps"]);
  });

  it("falls back to just company for null / non-array input", () => {
    expect(normaliseColumns(null)).toEqual(["company"]);
    expect(normaliseColumns(undefined)).toEqual(["company"]);
    expect(normaliseColumns("svi")).toEqual(["company"]);
    expect(normaliseColumns({ svi: true })).toEqual(["company"]);
  });

  it("restores the full registry order regardless of input order", () => {
    const shuffled: CohortColumn[] = ["shortlist", "svi", "company", "stage"];
    expect(normaliseColumns(shuffled)).toEqual(COHORT_COLUMNS.filter((c) => (shuffled as string[]).includes(c)));
  });
});

describe("columns persistence", () => {
  it("loadColumns defaults to every registry column when nothing is stored", () => {
    const store = fakeStore();
    expect(loadColumns(store)).toEqual([...DEFAULT_COLUMNS]);
  });

  it("saveColumns / loadColumns round-trip through the store, normalised", () => {
    const store = fakeStore();
    expect(saveColumns(["svi", "company", "bogus"], store)).toBe(true);
    expect(loadColumns(store)).toEqual(["company", "svi"]);
  });

  it("a throwing store never throws and yields the defaults", () => {
    expect(() => loadColumns(THROWING)).not.toThrow();
    expect(loadColumns(THROWING)).toEqual([...DEFAULT_COLUMNS]);
    expect(() => saveColumns(["svi"], THROWING)).not.toThrow();
    expect(saveColumns(["svi"], THROWING)).toBe(false);
  });
});

describe("density persistence", () => {
  it("defaults to comfortable, round-trips compact, and a throwing store degrades safely", () => {
    const store = fakeStore();
    expect(loadDensity(store)).toBe("comfortable");
    expect(saveDensity("compact", store)).toBe(true);
    expect(loadDensity(store)).toBe("compact");
    expect(() => loadDensity(THROWING)).not.toThrow();
    expect(loadDensity(THROWING)).toBe("comfortable");
    expect(saveDensity("compact", THROWING)).toBe(false);
  });
});

describe("saved views", () => {
  it("loadSavedViews always starts with Default, even with nothing stored", () => {
    const store = fakeStore();
    const views = loadSavedViews(store);
    expect(views).toHaveLength(1);
    expect(views[0]).toEqual({ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] });
  });

  it("a throwing store yields just Default, without throwing", () => {
    expect(() => loadSavedViews(THROWING)).not.toThrow();
    expect(loadSavedViews(THROWING)).toEqual([{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }]);
  });

  it("upsertSavedView inserts a new view after Default, normalising its columns", () => {
    const base: SavedView[] = [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }];
    const next = upsertSavedView(base, { name: "Shortlist only", filters: { shortlist: true }, columns: ["company", "svi", "bogus"] });
    expect(next.map((v) => v.name)).toEqual(["Default", "Shortlist only"]);
    expect(next[1]).toEqual({ name: "Shortlist only", filters: { shortlist: true }, columns: ["company", "svi"] });
  });

  it("upsertSavedView replaces an existing view of the same name rather than duplicating it", () => {
    let views: SavedView[] = [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }];
    views = upsertSavedView(views, { name: "V", filters: {}, columns: ["company"] });
    views = upsertSavedView(views, { name: "V", filters: { risk: true }, columns: ["company", "svi"] });
    expect(views.filter((v) => v.name === "V")).toHaveLength(1);
    expect(views.find((v) => v.name === "V")?.filters).toEqual({ risk: true });
  });

  it("upsertSavedView rejects an empty or 'Default' name (returns an unchanged copy)", () => {
    const base: SavedView[] = [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }];
    expect(upsertSavedView(base, { name: "   ", filters: {}, columns: [] })).toEqual(base);
    expect(upsertSavedView(base, { name: "Default", filters: { risk: true }, columns: [] })).toEqual(base);
  });

  it("removeSavedView drops a named view but Default can never be removed", () => {
    const base: SavedView[] = [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }, { name: "V", filters: {}, columns: ["company"] }];
    expect(removeSavedView(base, "V")).toEqual([base[0]]);
    expect(removeSavedView(base, "Default")).toEqual(base);
  });

  it("persistSavedViews writes Default-excluded views and loadSavedViews reads them back with Default restored first", () => {
    const store = fakeStore();
    const views: SavedView[] = [
      { ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] },
      { name: "Custom", filters: { stage: [3] }, columns: ["company", "stage"] },
    ];
    expect(persistSavedViews(views, store)).toBe(true);
    // Default is never in the raw stored payload.
    const raw = JSON.parse(store.data["blockid.cohort.views.v1"]!) as Array<{ name: string }>;
    expect(raw.some((v) => v.name === "Default")).toBe(false);
    expect(raw.some((v) => v.name === "Custom")).toBe(true);
    // Reading it back restores Default first.
    const reloaded = loadSavedViews(store);
    expect(reloaded.map((v) => v.name)).toEqual(["Default", "Custom"]);
  });

  it("a throwing store on persistSavedViews never throws", () => {
    expect(() => persistSavedViews([{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }], THROWING)).not.toThrow();
    expect(persistSavedViews([], THROWING)).toBe(false);
  });

  it("caps the saved-view list at MAX_SAVED_VIEWS (+1 for Default)", () => {
    let views: SavedView[] = [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }];
    for (let i = 0; i < MAX_SAVED_VIEWS + 5; i++) {
      views = upsertSavedView(views, { name: `View ${i}`, filters: {}, columns: ["company"] });
    }
    expect(views).toHaveLength(MAX_SAVED_VIEWS + 1);
    expect(views[0].name).toBe("Default");
  });
});

describe("toggleCompare", () => {
  it("adds an id that is not yet selected", () => {
    expect(toggleCompare([], 1)).toEqual({ selected: [1], full: false });
    expect(toggleCompare([1, 2], 3)).toEqual({ selected: [1, 2, 3], full: false });
  });

  it("removes an id that is already selected", () => {
    expect(toggleCompare([1, 2, 3], 2)).toEqual({ selected: [1, 3], full: false });
  });

  it("refuses to add a 5th id once at MAX_COMPARE, returning the same selection with full:true", () => {
    const full = [1, 2, 3, 4];
    expect(MAX_COMPARE).toBe(4);
    const result = toggleCompare(full, 5);
    expect(result).toEqual({ selected: [1, 2, 3, 4], full: true });
    expect(result.selected).not.toBe(full); // a fresh array, same values
  });

  it("removing while full still works (removal is checked before the cap)", () => {
    expect(toggleCompare([1, 2, 3, 4], 4)).toEqual({ selected: [1, 2, 3], full: false });
  });

  it("honours a custom max", () => {
    expect(toggleCompare([1], 2, 1)).toEqual({ selected: [1], full: true });
  });
});
