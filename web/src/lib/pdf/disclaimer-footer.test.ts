import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// pdf/disclaimer-footer — colocated tests for the previously-untested T-0425
// stamper that appends the current active disclaimer (id + version + hash
// prefix + Auschain ACN/ABN) to every page of a PDF or as a single-page
// addendum to a DOCX. A silent regression here (dropping the effective_from
// ordering, forgetting to filter by (kind, jurisdiction), or letting the
// pdf-lib soft-dependency catch throw instead of returning unstamped bytes)
// would strip the regulator-facing provenance the report pipeline relies on
// to prove which acknowledgement a founder / investor was actually shown.
// ---------------------------------------------------------------------------

type FilterCall = { op: "eq" | "lte"; col: string; val: unknown };

interface QueryState {
  filters: FilterCall[];
  orderCol: string | null;
  orderAsc: boolean | null;
  limitN: number | null;
  selectCols: string | null;
  maybeSingleCalled: boolean;
}

interface FakeSupabaseState {
  admin: "ok" | "null";
  table: string | null;
  query: QueryState;
  data: Record<string, unknown> | null;
}

const state: FakeSupabaseState = {
  admin: "ok",
  table: null,
  query: {
    filters: [],
    orderCol: null,
    orderAsc: null,
    limitN: null,
    selectCols: null,
    maybeSingleCalled: false,
  },
  data: null,
};

function resetQuery() {
  state.query = {
    filters: [],
    orderCol: null,
    orderAsc: null,
    limitN: null,
    selectCols: null,
    maybeSingleCalled: false,
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.admin === "null") return null;
    const chain = {
      select(cols: string) {
        state.query.selectCols = cols;
        return chain;
      },
      eq(col: string, val: unknown) {
        state.query.filters.push({ op: "eq", col, val });
        return chain;
      },
      lte(col: string, val: unknown) {
        state.query.filters.push({ op: "lte", col, val });
        return chain;
      },
      order(col: string, opts: { ascending: boolean }) {
        state.query.orderCol = col;
        state.query.orderAsc = opts.ascending;
        return chain;
      },
      limit(n: number) {
        state.query.limitN = n;
        return chain;
      },
      async maybeSingle() {
        state.query.maybeSingleCalled = true;
        return { data: state.data, error: null };
      },
    };
    return {
      from(table: string) {
        state.table = table;
        return chain;
      },
    };
  },
}));

async function loadModule() {
  vi.resetModules();
  return import("./disclaimer-footer");
}

beforeEach(() => {
  state.admin = "ok";
  state.table = null;
  state.data = null;
  resetQuery();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_RECORD = {
  id: "disc_not_fa_au",
  version: "3",
  jurisdiction: "AU",
  kind: "not_financial_advice",
  body_md: "This is general information, not personal financial advice.",
  hash: "abcdef1234567890fedcba9876543210",
};

describe("loadDisclaimer — DB query shape", () => {
  it("returns null when getSupabaseAdmin() is null (dev fallback, no throw)", async () => {
    state.admin = "null";
    const { loadDisclaimer } = await loadModule();
    const rec = await loadDisclaimer("not_financial_advice");
    expect(rec).toBeNull();
  });

  it("queries the disclaimer_registry table", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    await loadDisclaimer("not_financial_advice");
    expect(state.table).toBe("disclaimer_registry");
  });

  it("selects the six columns the DisclaimerRecord type pins", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    await loadDisclaimer("not_financial_advice");
    // All six DisclaimerRecord keys must be in the select list; a rename
    // would drop them from `data` and downstream footerText would render
    // "undefined" into a founder-facing report.
    for (const col of ["id", "version", "jurisdiction", "kind", "body_md", "hash"]) {
      expect(state.query.selectCols).toContain(col);
    }
  });

  it("filters by (kind, jurisdiction) — default AU when omitted", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    await loadDisclaimer("equity_offer_disclaimer");
    expect(state.query.filters).toContainEqual({
      op: "eq",
      col: "kind",
      val: "equity_offer_disclaimer",
    });
    expect(state.query.filters).toContainEqual({
      op: "eq",
      col: "jurisdiction",
      val: "AU",
    });
  });

  it("honours an explicit GLOBAL jurisdiction override", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    await loadDisclaimer("privacy", "GLOBAL");
    expect(state.query.filters).toContainEqual({
      op: "eq",
      col: "jurisdiction",
      val: "GLOBAL",
    });
  });

  it("gates on effective_from <= now via .lte with an ISO-8601 timestamp", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    const before = Date.now();
    await loadDisclaimer("not_financial_advice");
    const after = Date.now();
    const lte = state.query.filters.find((f) => f.op === "lte" && f.col === "effective_from");
    expect(lte).toBeDefined();
    // Must be an ISO string parseable back to a wall-clock in [before, after].
    const asNum = Date.parse(String(lte!.val));
    expect(Number.isFinite(asNum)).toBe(true);
    expect(asNum).toBeGreaterThanOrEqual(before);
    expect(asNum).toBeLessThanOrEqual(after);
  });

  it("orders by effective_from DESC so the newest active row wins", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    await loadDisclaimer("not_financial_advice");
    expect(state.query.orderCol).toBe("effective_from");
    expect(state.query.orderAsc).toBe(false);
  });

  it("limits to 1 and terminates with maybeSingle() — never throws on empty registry", async () => {
    state.data = null;
    const { loadDisclaimer } = await loadModule();
    const rec = await loadDisclaimer("not_financial_advice");
    expect(state.query.limitN).toBe(1);
    expect(state.query.maybeSingleCalled).toBe(true);
    expect(rec).toBeNull();
  });

  it("returns the mapped record verbatim when the row exists", async () => {
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    const rec = await loadDisclaimer("not_financial_advice");
    expect(rec).toEqual(SAMPLE_RECORD);
  });

  it("returns null when data is undefined (no coerce to {})", async () => {
    state.data = null;
    const { loadDisclaimer } = await loadModule();
    const rec = await loadDisclaimer("tos");
    expect(rec).toBeNull();
  });
});

describe("stampPdfFooter — soft-dependency fallback + no-record short-circuit", () => {
  it("returns the original bytes unchanged when no active disclaimer exists", async () => {
    state.data = null;
    const { stampPdfFooter } = await loadModule();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    const out = await stampPdfFooter(bytes, "not_financial_advice");
    expect(out).toBe(bytes); // same reference — no mutation, no copy
  });

  it("returns the original bytes when getSupabaseAdmin() is null (no active row → no stamp)", async () => {
    state.admin = "null";
    const { stampPdfFooter } = await loadModule();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const out = await stampPdfFooter(bytes, "share_issuance");
    expect(out).toBe(bytes);
  });

  it("falls back to unstamped bytes when pdf-lib is not installed (soft dependency contract)", async () => {
    // pdf-lib is intentionally NOT in web/package.json — the module uses a
    // Function('return import("pdf-lib")')() trick to bypass the bundler and
    // catches the resulting resolution failure at runtime. This test pins
    // that the catch branch returns the original bytes instead of throwing.
    state.data = SAMPLE_RECORD;
    const { stampPdfFooter } = await loadModule();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const out = await stampPdfFooter(bytes, "not_financial_advice");
    expect(out).toBe(bytes);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("pdf-lib not installed"),
    );
  });

  it("respects a custom jurisdiction when short-circuiting on missing record", async () => {
    state.data = null;
    const { stampPdfFooter } = await loadModule();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await stampPdfFooter(bytes, "wholesale_certification", "GLOBAL");
    expect(state.query.filters).toContainEqual({
      op: "eq",
      col: "jurisdiction",
      val: "GLOBAL",
    });
  });
});

describe("stampDocxFooter — appendix branch + originalBytes passthrough", () => {
  it("returns originalBytes when no active disclaimer exists (unchanged passthrough)", async () => {
    state.data = null;
    const { stampDocxFooter } = await loadModule();
    const original = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK zip magic
    const out = await stampDocxFooter({ originalBytes: original }, "not_financial_advice");
    expect(out).toBe(original);
  });

  it("returns null when no active disclaimer AND no originalBytes provided", async () => {
    state.data = null;
    const { stampDocxFooter } = await loadModule();
    const out = await stampDocxFooter({}, "not_financial_advice");
    expect(out).toBeNull();
  });

  it("returns originalBytes without appendPagePlaceholder even when the disclaimer exists (round-trip stamping unimplemented)", async () => {
    state.data = SAMPLE_RECORD;
    const { stampDocxFooter } = await loadModule();
    const original = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]);
    const out = await stampDocxFooter({ originalBytes: original }, "not_financial_advice");
    expect(out).toBe(original);
  });

  it("returns null without appendPagePlaceholder AND no originalBytes even when the disclaimer exists", async () => {
    state.data = SAMPLE_RECORD;
    const { stampDocxFooter } = await loadModule();
    const out = await stampDocxFooter({}, "not_financial_advice");
    expect(out).toBeNull();
  });

  it("generates a real DOCX (PK zip magic) with appendPagePlaceholder=true", async () => {
    state.data = SAMPLE_RECORD;
    const { stampDocxFooter } = await loadModule();
    const out = await stampDocxFooter({ appendPagePlaceholder: true }, "not_financial_advice");
    expect(out).not.toBeNull();
    expect(out).toBeInstanceOf(Uint8Array);
    // .docx is a ZIP; the file header is PK\x03\x04.
    expect(out![0]).toBe(0x50);
    expect(out![1]).toBe(0x4b);
    expect(out![2]).toBe(0x03);
    expect(out![3]).toBe(0x04);
    expect(out!.byteLength).toBeGreaterThan(200);
  }, 15000);

  it("embeds the disclaimer body + version + Auschain ACN/ABN in the generated DOCX", async () => {
    state.data = SAMPLE_RECORD;
    const { stampDocxFooter } = await loadModule();
    const out = await stampDocxFooter({ appendPagePlaceholder: true }, "not_financial_advice");
    expect(out).not.toBeNull();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(out!);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    // Body copy verbatim.
    expect(documentXml).toContain("general information, not personal financial advice");
    // Disclaimer id + version.
    expect(documentXml).toContain("disc_not_fa_au");
    expect(documentXml).toContain("v3");
    // Truncated hash — footerText slices to the first 12 chars.
    expect(documentXml).toContain("abcdef123456");
    // Must NOT contain the full untruncated hash (regression: pinning the slice).
    expect(documentXml).not.toContain("abcdef1234567890fedcba9876543210");
    // Corporate provenance — the "Auschain PTY LTD" + ACN + ABN string.
    expect(documentXml).toContain("Auschain PTY LTD");
    expect(documentXml).toContain("659 615 111");
    expect(documentXml).toContain("79 659 615 111");
    // Header text.
    expect(documentXml).toContain("Disclaimer");
  }, 15000);

  it("honours a custom jurisdiction when loading the disclaimer for the appendix", async () => {
    state.data = SAMPLE_RECORD;
    const { stampDocxFooter } = await loadModule();
    await stampDocxFooter({ appendPagePlaceholder: true }, "privacy", "GLOBAL");
    expect(state.query.filters).toContainEqual({ op: "eq", col: "kind", val: "privacy" });
    expect(state.query.filters).toContainEqual({
      op: "eq",
      col: "jurisdiction",
      val: "GLOBAL",
    });
  }, 15000);

  it("returns originalBytes when getSupabaseAdmin() is null (loadDisclaimer null path, appendPagePlaceholder ignored)", async () => {
    state.admin = "null";
    const { stampDocxFooter } = await loadModule();
    const original = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const out = await stampDocxFooter(
      { appendPagePlaceholder: true, originalBytes: original },
      "not_financial_advice",
    );
    // With null admin loadDisclaimer returns null and the early-return
    // preserves originalBytes rather than generating an empty appendix.
    expect(out).toBe(original);
  });

  it("returns null when getSupabaseAdmin() is null AND no originalBytes AND appendPagePlaceholder=true", async () => {
    state.admin = "null";
    const { stampDocxFooter } = await loadModule();
    const out = await stampDocxFooter({ appendPagePlaceholder: true }, "not_financial_advice");
    expect(out).toBeNull();
  });
});

describe("DocumentKind + Jurisdiction typing surface", () => {
  it("accepts every documented DisclaimerKind value at runtime", async () => {
    // Runtime coverage guard: if the union type is later narrowed / renamed
    // this test still exercises each kind so the DB query shape is verified
    // against every case the caller-facing type advertises.
    state.data = SAMPLE_RECORD;
    const { loadDisclaimer } = await loadModule();
    const kinds = [
      "not_financial_advice",
      "equity_offer_disclaimer",
      "share_issuance",
      "trial",
      "tos",
      "privacy",
      "wholesale_certification",
    ] as const;
    for (const k of kinds) {
      resetQuery();
      await loadDisclaimer(k);
      expect(state.query.filters).toContainEqual({ op: "eq", col: "kind", val: k });
    }
  });
});
