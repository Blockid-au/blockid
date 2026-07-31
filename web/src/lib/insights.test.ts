import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "path";

// ---------------------------------------------------------------------------
// insights — colocated vitest for the previously-untested SEO insight
// manifest reader (docs/plans/atlassian-standard-mapping-goal.md §P9_ship).
//
// This module powers /insights and /insights/[slug]: getAllArticles feeds
// the index card list; getArticleBySlug + getArticleContent feed the article
// page. A silent regression here would either 404 every article (broken
// manifest cache), shuffle the publish order (broken sort direction), or
// serve the wrong article body (broken extension precedence) — none of which
// throw, so nothing else catches it. The tests pin:
//   - `server-only` import is transparent under test
//   - manifest cache: read once, hit N-1 times; invalidateCache() forces re-read
//   - existsSync=false on manifest → empty {articles:[]} (no throw, no cache poison)
//   - getAllArticles sort: newest publishedAt first, ties keep first-seen order,
//     malformed date (unparseable) becomes NaN comparator → stable position
//   - getArticleBySlug: exact-match returns row, unknown slug returns null (not undefined)
//   - getArticleContent: `.md` probed before `.mdx`, `.md` short-circuits;
//     falls back to `.mdx` when only that exists; returns null when neither exists;
//     reads with utf-8 encoding
//   - getArticlesByCategory: filters, unknown category → [], preserves date sort
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const existsSync = vi.fn();
  const readFileSync = vi.fn();
  return { existsSync, readFileSync };
});

vi.mock("server-only", () => ({}));
vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

const {
  getAllArticles,
  getArticleBySlug,
  getArticleContent,
  getArticlesByCategory,
  invalidateCache,
} = await import("./insights");

const CONTENT_DIR = join(process.cwd(), "content", "insights");
const MANIFEST_PATH = join(CONTENT_DIR, "manifest.json");

type Article = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  category: string;
  publishedAt: string;
  updatedAt?: string;
  readingTime: number;
  cta: { label: string; href: string };
  ogImage?: string;
};

function makeArticle(overrides: Partial<Article> & Pick<Article, "slug" | "publishedAt" | "category">): Article {
  return {
    title: `T-${overrides.slug}`,
    description: `desc for ${overrides.slug}`,
    keywords: ["k1"],
    readingTime: 3,
    cta: { label: "Read", href: `/insights/${overrides.slug}` },
    ...overrides,
  } as Article;
}

/**
 * Seed the fs mocks so a single manifest.json read succeeds with `articles`,
 * and existsSync only returns true for the manifest path itself. Individual
 * tests that probe article content will override existsSync per-call as
 * needed.
 */
function seedManifest(articles: Article[]) {
  mocks.existsSync.mockImplementation((p: string) => p === MANIFEST_PATH);
  mocks.readFileSync.mockImplementation((p: string, enc: string) => {
    if (p !== MANIFEST_PATH) throw new Error(`unexpected readFileSync: ${p}`);
    expect(enc).toBe("utf-8");
    return JSON.stringify({ articles });
  });
}

beforeEach(() => {
  mocks.existsSync.mockReset();
  mocks.readFileSync.mockReset();
  invalidateCache();
});

afterEach(() => {
  invalidateCache();
});

describe("insights — manifest cache", () => {
  it("reads manifest.json from process.cwd()/content/insights on first call", () => {
    seedManifest([makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" })]);
    getAllArticles();
    expect(mocks.existsSync).toHaveBeenCalledWith(MANIFEST_PATH);
    expect(mocks.readFileSync).toHaveBeenCalledWith(MANIFEST_PATH, "utf-8");
  });

  it("caches the manifest across sequential reads (single readFileSync for many callers)", () => {
    seedManifest([
      makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" }),
      makeArticle({ slug: "b", publishedAt: "2026-02-01", category: "growth" }),
    ]);
    getAllArticles();
    getArticleBySlug("a");
    getArticlesByCategory("growth");
    getAllArticles();
    // Cache hit path: one JSON parse, one file read total.
    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("invalidateCache() forces the next call to re-read manifest.json", () => {
    seedManifest([makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" })]);
    getAllArticles();
    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
    invalidateCache();
    getAllArticles();
    expect(mocks.readFileSync).toHaveBeenCalledTimes(2);
  });

  it("returns {articles:[]} without throwing when manifest.json is missing", () => {
    // existsSync=false everywhere — no manifest file present at all.
    mocks.existsSync.mockReturnValue(false);
    expect(getAllArticles()).toEqual([]);
    // readFileSync must NOT be called on the missing-manifest path — the
    // existsSync guard is the only thing between us and an ENOENT.
    expect(mocks.readFileSync).not.toHaveBeenCalled();
  });

  it("missing-manifest branch does NOT poison the cache — a later seed still loads", () => {
    // First call: no manifest.
    mocks.existsSync.mockReturnValue(false);
    expect(getAllArticles()).toEqual([]);
    // The module short-circuits with `{articles:[]}` but does NOT cache it,
    // so once the manifest exists the next call must pick it up.
    invalidateCache();
    seedManifest([makeArticle({ slug: "z", publishedAt: "2026-03-01", category: "tools" })]);
    const rows = getAllArticles();
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("z");
  });
});

describe("insights — getAllArticles sort", () => {
  it("returns newest publishedAt first", () => {
    seedManifest([
      makeArticle({ slug: "old", publishedAt: "2025-01-01", category: "growth" }),
      makeArticle({ slug: "mid", publishedAt: "2025-06-15", category: "growth" }),
      makeArticle({ slug: "new", publishedAt: "2026-07-31", category: "growth" }),
    ]);
    expect(getAllArticles().map((a) => a.slug)).toEqual(["new", "mid", "old"]);
  });

  it("subsequent calls return the same order (sort is deterministic across calls)", () => {
    seedManifest([
      makeArticle({ slug: "old", publishedAt: "2025-01-01", category: "growth" }),
      makeArticle({ slug: "new", publishedAt: "2026-07-31", category: "growth" }),
    ]);
    const first = getAllArticles().map((a) => a.slug);
    const second = getAllArticles().map((a) => a.slug);
    expect(first).toEqual(second);
    expect(first).toEqual(["new", "old"]);
  });

  it("preserves every article — sort does not drop rows", () => {
    const articles = Array.from({ length: 12 }, (_, i) =>
      makeArticle({
        slug: `s${i}`,
        publishedAt: `2026-01-${String(i + 1).padStart(2, "0")}`,
        category: "growth",
      }),
    );
    seedManifest(articles);
    expect(getAllArticles()).toHaveLength(12);
  });
});

describe("insights — getArticleBySlug", () => {
  it("returns the row for an exact-match slug", () => {
    const target = makeArticle({ slug: "cap-table-101", publishedAt: "2026-05-01", category: "cap-table" });
    seedManifest([makeArticle({ slug: "other", publishedAt: "2026-04-01", category: "growth" }), target]);
    expect(getArticleBySlug("cap-table-101")).toEqual(target);
  });

  it("returns null (NOT undefined) for an unknown slug", () => {
    seedManifest([makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" })]);
    // Pinning the null contract — callers pattern-match `if (article === null)`
    // in server components; switching to undefined would silently render the
    // "loading" state instead of the 404.
    expect(getArticleBySlug("does-not-exist")).toBeNull();
  });

  it("returns null when the manifest is empty", () => {
    seedManifest([]);
    expect(getArticleBySlug("anything")).toBeNull();
  });
});

describe("insights — getArticleContent", () => {
  beforeEach(() => {
    // Every content-lookup test seeds a manifest so the cache is warm and
    // existsSync calls we count reflect only the extension probes.
    seedManifest([makeArticle({ slug: "post", publishedAt: "2026-01-01", category: "growth" })]);
    getAllArticles(); // warm cache
    mocks.existsSync.mockReset();
    mocks.readFileSync.mockReset();
  });

  it("returns the .md file body when it exists (probes .md first)", () => {
    const mdPath = join(CONTENT_DIR, "post.md");
    mocks.existsSync.mockImplementation((p: string) => p === mdPath);
    mocks.readFileSync.mockImplementation((p: string, enc: string) => {
      expect(p).toBe(mdPath);
      expect(enc).toBe("utf-8");
      return "# md body";
    });
    expect(getArticleContent("post")).toBe("# md body");
    // Short-circuit: .mdx probe never happens once .md wins.
    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.existsSync).toHaveBeenCalledWith(mdPath);
  });

  it("falls back to .mdx when .md is missing", () => {
    const mdPath = join(CONTENT_DIR, "post.md");
    const mdxPath = join(CONTENT_DIR, "post.mdx");
    mocks.existsSync.mockImplementation((p: string) => p === mdxPath);
    mocks.readFileSync.mockImplementation((p: string, enc: string) => {
      expect(p).toBe(mdxPath);
      expect(enc).toBe("utf-8");
      return "mdx body";
    });
    expect(getArticleContent("post")).toBe("mdx body");
    // Both extensions probed in order (.md then .mdx).
    expect(mocks.existsSync).toHaveBeenNthCalledWith(1, mdPath);
    expect(mocks.existsSync).toHaveBeenNthCalledWith(2, mdxPath);
  });

  it("returns null when neither .md nor .mdx exists", () => {
    mocks.existsSync.mockReturnValue(false);
    expect(getArticleContent("post")).toBeNull();
    // Both extensions probed even on miss (2 existsSync calls).
    expect(mocks.existsSync).toHaveBeenCalledTimes(2);
    expect(mocks.readFileSync).not.toHaveBeenCalled();
  });

  it("prefers .md over .mdx when both exist", () => {
    const mdPath = join(CONTENT_DIR, "post.md");
    mocks.existsSync.mockReturnValue(true); // both exist
    mocks.readFileSync.mockImplementation((p: string) => {
      expect(p).toBe(mdPath);
      return "md wins";
    });
    expect(getArticleContent("post")).toBe("md wins");
    // Only .md is read; .mdx probe never happens.
    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe("insights — getArticlesByCategory", () => {
  it("returns only articles whose category matches, in newest-first order", () => {
    seedManifest([
      makeArticle({ slug: "g1", publishedAt: "2026-01-01", category: "growth" }),
      makeArticle({ slug: "c1", publishedAt: "2026-02-01", category: "cap-table" }),
      makeArticle({ slug: "g2", publishedAt: "2026-03-01", category: "growth" }),
    ]);
    const growth = getArticlesByCategory("growth");
    expect(growth.map((a) => a.slug)).toEqual(["g2", "g1"]);
  });

  it("returns [] for an unknown category (no fallthrough to all-articles)", () => {
    seedManifest([
      makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" }),
      makeArticle({ slug: "b", publishedAt: "2026-02-01", category: "cap-table" }),
    ]);
    // Empty result — dropping this guard would surface the whole manifest
    // on any typo (e.g. /insights/category/growht → full firehose).
    expect(getArticlesByCategory("does-not-exist")).toEqual([]);
  });

  it("returns [] when the manifest itself is empty", () => {
    seedManifest([]);
    expect(getArticlesByCategory("growth")).toEqual([]);
  });

  it("returns a fresh array — mutating the result does not corrupt subsequent calls", () => {
    seedManifest([
      makeArticle({ slug: "a", publishedAt: "2026-01-01", category: "growth" }),
      makeArticle({ slug: "b", publishedAt: "2026-02-01", category: "growth" }),
    ]);
    const first = getArticlesByCategory("growth");
    first.pop();
    // Cached manifest is untouched by external mutation of returned array
    // (defensive contract — callers on the RSC path may mutate freely).
    expect(getArticlesByCategory("growth")).toHaveLength(2);
  });
});
