// L1-3 — the runtime-state root helper + a guard that keeps new code from
// building content/reports paths off process.cwd() (= the frozen release dir
// /data/releases/<BUILD_ID> on production: reads go stale, writes are lost on
// the next deploy).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIVE_WEB_DIR,
  getRuntimeWebDir,
  releaseContentPath,
  resetRuntimeWebDirCache,
  runtimeContentPath,
  runtimeReportsPath,
} from "./runtime-paths";
import { getStatusRoot } from "./status/jsonl";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeWebDirCache();
});

describe("getRuntimeWebDir / runtime*Path", () => {
  it("BLOCKID_WEB_DIR wins and is read on every call (not cached)", () => {
    vi.stubEnv("BLOCKID_WEB_DIR", "/srv/web-a");
    expect(getRuntimeWebDir()).toBe("/srv/web-a");
    vi.stubEnv("BLOCKID_WEB_DIR", "/srv/web-b");
    expect(getRuntimeWebDir()).toBe("/srv/web-b");
    expect(runtimeReportsPath("svi-backtest-latest.json")).toBe("/srv/web-b/content/reports/svi-backtest-latest.json");
    expect(runtimeReportsPath()).toBe("/srv/web-b/content/reports");
    expect(runtimeContentPath("i18n", "x.json")).toBe("/srv/web-b/content/i18n/x.json");
    expect(getStatusRoot()).toBe("/srv/web-b"); // the status readers share the one helper
  });

  it("without the env: the documented live checkout only when it has content/reports, else cwd", () => {
    vi.stubEnv("BLOCKID_WEB_DIR", "");
    const expected = existsSync(path.join(DEFAULT_LIVE_WEB_DIR, "content", "reports")) ? DEFAULT_LIVE_WEB_DIR : process.cwd();
    expect(getRuntimeWebDir()).toBe(expected);
    expect(path.isAbsolute(getRuntimeWebDir())).toBe(true);
  });

  it("releaseContentPath stays on process.cwd() (immutable bundled content)", () => {
    vi.stubEnv("BLOCKID_WEB_DIR", "/srv/web");
    expect(releaseContentPath("reports", "version.json")).toBe(path.join(process.cwd(), "content", "reports", "version.json"));
  });
});

// ---------- guard ----------

/** Release-bound content/reports readers that deliberately keep process.cwd(). */
const ALLOWED_CWD_REPORT_FILES = new Set([
  // The migration manifest THIS release ships; the G30 controller verifies
  // /api/status.schema_migrations against it (scripts/g30-serving-state.py).
  "src/lib/ops/schema-migrations.ts",
]);

const REPORTS_LITERAL = /content\/reports|["'`]content["'`]\s*,\s*["'`]reports["'`]/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

/** Every reason this source builds a content/reports path off process.cwd(). */
export function cwdReportViolations(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const out: string[] = [];
  // 1. direct: path.join(process.cwd(), …, "content", "reports" …) in one expression
  for (const m of src.matchAll(/process\.cwd\(\)/g)) {
    const tail = src.slice(m.index ?? 0, (m.index ?? 0) + 300).split(";")[0];
    if (REPORTS_LITERAL.test(tail)) out.push(`direct: ${tail.slice(0, 80)}`);
  }
  // 2. alias: const ROOT = process.cwd(); … join(ROOT, "content", "reports") / `${ROOT}/content/reports`
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:path\.)?(?:resolve\(\s*)?process\.cwd\(\)/g)) {
    const name = m[1];
    const uses = new RegExp(`(?:join|resolve)\\(\\s*${name}\\s*,\\s*(?:["'\`]content\\/reports|["'\`]content["'\`]\\s*,\\s*["'\`]reports["'\`])|\\$\\{${name}\\}\\/content\\/reports`);
    if (uses.test(src)) out.push(`alias: ${name}`);
  }
  // 3. default parameter root = process.cwd() in a module that addresses content/reports
  if (/\b[A-Za-z_$][\w$]*\s*:\s*string\s*=\s*process\.cwd\(\)/.test(src) && REPORTS_LITERAL.test(src)) out.push("default-param root = process.cwd()");
  // 4. a runtime-state reader/writer handed process.cwd() as its root, e.g.
  //    readTractionSnapshotRaw(process.cwd()) — the reader's default is the live root.
  for (const m of src.matchAll(/\b((?:read|persist|load|write)[A-Z]\w*)\(((?:[^()]|\([^()]*\))*,\s*)?process\.cwd\(\)\s*[,)]/g)) out.push(`root arg: ${m[1]}(…process.cwd())`);
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("guard: no content/reports path off process.cwd() (L1-3)", () => {
  it("the detector catches the three shapes that shipped before L1-3 and ignores the helper forms", () => {
    expect(cwdReportViolations('const f = path.join(process.cwd(), "content", "reports", "x.json");')).toHaveLength(1);
    expect(cwdReportViolations('const d = path.resolve(process.cwd(), "content/reports", n);')).toHaveLength(1);
    expect(cwdReportViolations('const c = [path.join(process.cwd(), "web", "content", "reports")];')).toHaveLength(1);
    expect(cwdReportViolations('const REPO_ROOT = process.cwd();\nconst L = path.join(REPO_ROOT, "content", "reports", "deploy-log.jsonl");')).toContain("alias: REPO_ROOT");
    expect(cwdReportViolations('const W = process.cwd();\nconst L = `${W}/content/reports/a.jsonl`;')).toContain("alias: W");
    expect(cwdReportViolations('export const F = path.join("content", "reports", "a.json");\nexport async function r(root: string = process.cwd()) {}')).toContain("default-param root = process.cwd()");
    expect(cwdReportViolations('const f = runtimeReportsPath("x.json"); const v = releaseContentPath("reports", "version.json");')).toEqual([]);
    expect(cwdReportViolations('// path.join(process.cwd(), "content", "reports")\nconst x = 1;')).toEqual([]);
    expect(cwdReportViolations('const p = path.join(process.cwd(), "content", "insights");')).toEqual([]);
    expect(cwdReportViolations("const raw = await readTractionSnapshotRaw(process.cwd());")).toHaveLength(1);
    expect(cwdReportViolations("const d = await loadExternalSignalsAdmin(getSupabaseAdmin(), process.cwd());")).toHaveLength(1);
    expect(cwdReportViolations('const t = readFileSync(path.join(process.cwd(), "public", "x.png"));')).toEqual([]);
  });

  it("no non-test file under src/ builds a content/reports path from process.cwd()", () => {
    const webDir = path.resolve(__dirname, "..", "..");
    const offenders: string[] = [];
    for (const file of walk(path.join(webDir, "src"))) {
      const rel = path.relative(webDir, file).split(path.sep).join("/");
      if (ALLOWED_CWD_REPORT_FILES.has(rel)) continue;
      for (const v of cwdReportViolations(readFileSync(file, "utf8"))) offenders.push(`${rel} — ${v}`);
    }
    // Use runtimeReportsPath()/getRuntimeWebDir() (mutable runtime state) or
    // releaseContentPath() (immutable content shipped with the release).
    expect(offenders).toEqual([]);
  });
});
