// G26 — light-template guard (docs/design/unicorn-template.md v2 § 6).
//
// Scans every `.tsx` under `src/app` and `src/components` for page-level
// dark surfaces, white / near-white text tokens and raw hex / rgb colours in
// Tailwind arbitrary values, minus the allow-list
// (`light-template.allowlist.json` — one `{ file, rule?, pattern, reason }`
// per legitimate exception). Everything left is a defect for the page lanes.
//
// MODES
//   • Default since G26-X (2026-09-21, the page lanes have landed): ENFORCING —
//     any hit outside the allow-list fails CI. The per-rule / per-area
//     summary and the per-file list are still printed as the briefing.
//   • `LIGHT_GUARD_ENFORCE=1`  — enforce (kept for parity with the docs).
//   • `LIGHT_GUARD_REPORT_ONLY=1` — report only (a lane surveying its area).
//   `scripts/light-guard-report.ts` (`FLAT=1` for one line per hit) prints
//   the same scan outside vitest.
//
// Always enforced, regardless of mode: the FOUNDATION files (template
// primitives, nav, footer, locale switcher, theme toggle, marketing shell)
// carry zero hits; the allow-list is well-formed, ≤ 30 entries, and every
// entry still matches at least one hit (no stale exceptions).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compileAllowList,
  formatPerFile,
  formatReport,
  scanTree,
  summarise,
  type AllowEntry,
  type Hit,
  type RuleId,
} from "./light-template-guard";

/** Flipped to `true` by G26-X once the page lanes landed (2026-09-21). */
const ENFORCE_DEFAULT = true;

const enforce =
  process.env.LIGHT_GUARD_REPORT_ONLY === "1"
    ? false
    : process.env.LIGHT_GUARD_ENFORCE === "1"
      ? true
      : ENFORCE_DEFAULT;

const SRC = resolve(__dirname, "..");
const ALLOW_PATH = join(__dirname, "light-template.allowlist.json");
const RULE_IDS: readonly RuleId[] = ["dark-surface", "text-on-dark", "raw-color"];

/** Lane T's own files — light by construction, enforced from day one. */
const FOUNDATION_FILES: readonly string[] = [
  "components/marketing/template/",
  "components/landing/nav-v2.tsx",
  "components/landing/locale-switcher.tsx",
  "components/marketing/footer.tsx",
  "components/marketing/marketing-shell.tsx",
  "components/ui/theme-toggle.tsx",
];

function loadAllowList(): AllowEntry[] {
  const raw = JSON.parse(readFileSync(ALLOW_PATH, "utf8")) as { entries: AllowEntry[] };
  return raw.entries;
}

const allow = loadAllowList();
const isAllowed = compileAllowList(allow);
const allHits: Hit[] = scanTree(SRC);
const used = new Set<AllowEntry>();
const defects: Hit[] = [];
for (const h of allHits) {
  const e = isAllowed(h);
  if (e) used.add(e);
  else defects.push(h);
}
const summary = summarise(defects, 8);

describe("light-template guard — allow-list hygiene (always enforced)", () => {
  it("is well-formed: ≤ 30 entries, each with file / pattern / reason, a known rule, and a compilable pattern", () => {
    expect(allow.length).toBeLessThanOrEqual(30);
    for (const e of allow) {
      expect(typeof e.file, "file").toBe("string");
      expect(e.file.length).toBeGreaterThan(0);
      expect(typeof e.pattern, "pattern").toBe("string");
      expect(e.reason.length, `${e.file} reason`).toBeGreaterThan(20);
      if (e.rule) expect(RULE_IDS, `${e.file} rule`).toContain(e.rule);
      expect(() => new RegExp(e.pattern), `${e.file} pattern`).not.toThrow();
    }
  });

  it("has no stale entries — every allow-list entry still excuses at least one hit", () => {
    const stale = allow.filter((e) => !used.has(e)).map((e) => `${e.file} :: ${e.pattern}`);
    expect(stale, "remove these entries from light-template.allowlist.json").toEqual([]);
  });
});

describe("light-template guard — foundation files are light by construction (always enforced)", () => {
  it("template primitives, nav, footer, locale switcher, theme toggle and the shell carry no dark surface, white text or raw colour", () => {
    const own = defects.filter((h) => FOUNDATION_FILES.some((f) => (f.endsWith("/") ? h.file.startsWith(f) : h.file === f)));
    expect(
      own.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.token}`),
      "foundation files must stay light",
    ).toEqual([]);
  });
});

describe(`light-template guard — page-level scan (${enforce ? "ENFORCING" : "report only"})`, () => {
  it("scans src/app + src/components .tsx and produces the per-rule / per-area report", () => {
    expect(allHits.length).toBeGreaterThan(0);
    const report = formatReport(summary);
    expect(report).toContain("light-template guard:");
    // Always print — this is the briefing the page lanes work from.
    console.log(`\n${report}\n`);
    if (process.env.LIGHT_GUARD_FILES === "1" || enforce) console.log(formatPerFile(summary, 6));
  });

  it(`no dark surface / white text / raw colour outside the allow-list${enforce ? "" : " (reporting; flip ENFORCE_DEFAULT in the merge session)"}`, () => {
    if (!enforce) {
      expect(summary.total).toBeGreaterThanOrEqual(0);
      return;
    }
    const list = [...summary.files.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([f, hs]) => `${f} (${hs.length}): ${hs.slice(0, 3).map((h) => `L${h.line} ${h.token}`).join(", ")}${hs.length > 3 ? ", …" : ""}`);
    expect(list, `${summary.total} light-template defect(s) in ${summary.files.size} file(s)`).toEqual([]);
  });
});
