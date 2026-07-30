import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

// ---------------------------------------------------------------------------
// blockid-og-state.readShowcaseCurrentPhase() — colocated vitest.
//
// The module is a thin, defensive helper for the /showcase/blockid OG +
// Twitter-card metadata routes. It walks the two report-dir candidates
// (`web/content/reports`, then `content/reports`) and returns the highest
// `phase_at_generation` observed across the report tags — or `null` on any
// failure so the OG image always renders a fallback badge rather than 500.
//
// These tests pin:
//   - candidate walk order + short-circuit rules (first-successful wins,
//     empty-markdown falls through, throws fall through, both-fail → null)
//   - the "return even if max is null" contract when markdown exists but
//     no row has a numeric phase (does NOT fall through to next candidate)
//   - filenames filter is `.endsWith(".md")` (non-md entries dropped before
//     tagger call)
//   - `includeTemplates: false` is always forwarded to the tagger
//   - `path.join(process.cwd(), ...parts)` shape for both candidates
//   - max-across-rows arithmetic (null rows skipped, ties keep first-seen,
//     0 is a legitimate phase value that beats `null` max)
//   - tagger throw is treated the same as a readdir throw (caught, falls
//     through to next candidate)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const readdir = vi.fn();
  const buildShowcaseDataRoomRows = vi.fn();
  return { readdir, buildShowcaseDataRoomRows };
});

vi.mock("node:fs", () => ({
  promises: { readdir: mocks.readdir },
}));

vi.mock("@/lib/showcase/report-tagging", () => ({
  buildShowcaseDataRoomRows: mocks.buildShowcaseDataRoomRows,
}));

// Import AFTER vi.mock so the module picks up the mocked bindings.
const { readShowcaseCurrentPhase } = await import("./blockid-og-state");

const CWD = process.cwd();
const PRIMARY_DIR = path.join(CWD, "web", "content", "reports");
const FALLBACK_DIR = path.join(CWD, "content", "reports");

function makeRow(phase: number | null) {
  return {
    source_path: `web/content/reports/x-${phase}.md`,
    filename: `x-${phase}.md`,
    title: `x ${phase}`,
    generated_by_agent: "ceo" as const,
    phase_at_generation: phase,
    generated_at: null,
    version: null,
    tags: [],
  };
}

beforeEach(() => {
  mocks.readdir.mockReset();
  mocks.buildShowcaseDataRoomRows.mockReset();
});

describe("readShowcaseCurrentPhase — candidate walk", () => {
  it("returns null when both candidates throw (ENOENT-style)", async () => {
    mocks.readdir.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    mocks.readdir.mockRejectedValueOnce(new Error("boom"));
    expect(await readShowcaseCurrentPhase()).toBeNull();
    expect(mocks.readdir).toHaveBeenCalledTimes(2);
    expect(mocks.buildShowcaseDataRoomRows).not.toHaveBeenCalled();
  });

  it("returns null when both candidates have no .md entries", async () => {
    mocks.readdir.mockResolvedValueOnce([]);
    mocks.readdir.mockResolvedValueOnce(["README.txt", "notes.json"]);
    expect(await readShowcaseCurrentPhase()).toBeNull();
    expect(mocks.readdir).toHaveBeenCalledTimes(2);
    expect(mocks.buildShowcaseDataRoomRows).not.toHaveBeenCalled();
  });

  it("uses the second candidate when the first throws", async () => {
    mocks.readdir.mockRejectedValueOnce(new Error("no dir"));
    mocks.readdir.mockResolvedValueOnce(["a.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(5)]);
    expect(await readShowcaseCurrentPhase()).toBe(5);
    expect(mocks.readdir).toHaveBeenNthCalledWith(1, PRIMARY_DIR);
    expect(mocks.readdir).toHaveBeenNthCalledWith(2, FALLBACK_DIR);
  });

  it("falls through to the second candidate when the first has no .md files", async () => {
    mocks.readdir.mockResolvedValueOnce(["README.txt", "cover.png"]);
    mocks.readdir.mockResolvedValueOnce(["phase-9.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(9)]);
    expect(await readShowcaseCurrentPhase()).toBe(9);
    expect(mocks.readdir).toHaveBeenCalledTimes(2);
    expect(mocks.buildShowcaseDataRoomRows).toHaveBeenCalledTimes(1);
  });

  it("short-circuits on the first successful candidate — second candidate is never tried", async () => {
    mocks.readdir.mockResolvedValueOnce(["only-here.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(3)]);
    expect(await readShowcaseCurrentPhase()).toBe(3);
    expect(mocks.readdir).toHaveBeenCalledTimes(1);
    expect(mocks.readdir).toHaveBeenCalledWith(PRIMARY_DIR);
  });

  it("returns null (not fallthrough) when the first candidate has .md files but no row has a numeric phase", async () => {
    // Pinning the semantic — buildShowcaseDataRoomRows is called, the max
    // stays `null`, and the function returns null WITHOUT trying the
    // fallback dir. Falling through would let a stale fallback dir shadow
    // fresh reports that haven't been phase-tagged yet.
    mocks.readdir.mockResolvedValueOnce(["a.md", "b.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([
      makeRow(null),
      makeRow(null),
    ]);
    expect(await readShowcaseCurrentPhase()).toBeNull();
    expect(mocks.readdir).toHaveBeenCalledTimes(1);
    expect(mocks.buildShowcaseDataRoomRows).toHaveBeenCalledTimes(1);
  });

  it("returns null when the tagger throws (caught, walks to next candidate, then null)", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.md"]);
    mocks.buildShowcaseDataRoomRows.mockImplementationOnce(() => {
      throw new Error("tagger blew up");
    });
    mocks.readdir.mockRejectedValueOnce(new Error("second dir missing"));
    expect(await readShowcaseCurrentPhase()).toBeNull();
    expect(mocks.readdir).toHaveBeenCalledTimes(2);
    expect(mocks.buildShowcaseDataRoomRows).toHaveBeenCalledTimes(1);
  });
});

describe("readShowcaseCurrentPhase — tagger inputs", () => {
  it("filters non-.md entries before passing filenames to the tagger", async () => {
    mocks.readdir.mockResolvedValueOnce([
      "a.md",
      "b.md",
      "notes.txt",
      "screenshot.png",
      "index.html",
      "c.md",
    ]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(1)]);
    await readShowcaseCurrentPhase();
    expect(mocks.buildShowcaseDataRoomRows).toHaveBeenCalledWith({
      filenames: ["a.md", "b.md", "c.md"],
      includeTemplates: false,
    });
  });

  it("always forwards includeTemplates=false (template reports never count toward founder phase)", async () => {
    mocks.readdir.mockResolvedValueOnce(["r.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(7)]);
    await readShowcaseCurrentPhase();
    const arg = mocks.buildShowcaseDataRoomRows.mock.calls[0]?.[0];
    expect(arg?.includeTemplates).toBe(false);
  });
});

describe("readShowcaseCurrentPhase — max arithmetic", () => {
  it("returns the max phase across rows", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.md", "b.md", "c.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([
      makeRow(3),
      makeRow(11),
      makeRow(7),
    ]);
    expect(await readShowcaseCurrentPhase()).toBe(11);
  });

  it("skips null-phase rows when computing the max", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.md", "b.md", "c.md", "d.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([
      makeRow(null),
      makeRow(4),
      makeRow(null),
      makeRow(6),
    ]);
    expect(await readShowcaseCurrentPhase()).toBe(6);
  });

  it("returns 0 when 0 is the only numeric phase (0 beats a null max via strict `>` compare)", async () => {
    // Guards against a regression where `max || row.phase > max` would
    // treat 0 as falsy and silently swap it for null.
    mocks.readdir.mockResolvedValueOnce(["a.md", "b.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([
      makeRow(null),
      makeRow(0),
    ]);
    expect(await readShowcaseCurrentPhase()).toBe(0);
  });

  it("returns null when the tagger returns an empty row list", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([]);
    expect(await readShowcaseCurrentPhase()).toBeNull();
  });

  it("is order-agnostic — max wins even when rows are unsorted", async () => {
    mocks.readdir.mockResolvedValueOnce(["a.md", "b.md", "c.md", "d.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([
      makeRow(12),
      makeRow(1),
      makeRow(7),
      makeRow(3),
    ]);
    expect(await readShowcaseCurrentPhase()).toBe(12);
  });
});

describe("readShowcaseCurrentPhase — candidate dir paths", () => {
  it("tries the primary web/content/reports dir first", async () => {
    mocks.readdir.mockResolvedValueOnce(["r.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(1)]);
    await readShowcaseCurrentPhase();
    expect(mocks.readdir).toHaveBeenNthCalledWith(1, PRIMARY_DIR);
  });

  it("tries the fallback content/reports dir when the primary fails", async () => {
    mocks.readdir.mockRejectedValueOnce(new Error("missing"));
    mocks.readdir.mockResolvedValueOnce(["r.md"]);
    mocks.buildShowcaseDataRoomRows.mockReturnValueOnce([makeRow(2)]);
    await readShowcaseCurrentPhase();
    expect(mocks.readdir).toHaveBeenNthCalledWith(2, FALLBACK_DIR);
  });
});
