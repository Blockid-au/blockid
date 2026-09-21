// G26 — print the light-template guard scan outside vitest.
//
//   npx tsx scripts/light-guard-report.ts            summary + per-file list
//   FLAT=1 npx tsx scripts/light-guard-report.ts     one line per hit (grep-able)
//   LIGHT_GUARD_SRC=/path/to/src …                   scan another checkout's src/
//                                                    (still uses THIS allow-list)
//
// Same scanner and allow-list as `src/design/light-template.guard.test.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileAllowList, formatPerFile, formatReport, scanTree, summarise, type AllowEntry } from "../src/design/light-template-guard";

const HERE = resolve(__dirname, "../src");
const SRC = process.env.LIGHT_GUARD_SRC ? resolve(process.env.LIGHT_GUARD_SRC) : HERE;
const allow = (JSON.parse(readFileSync(`${HERE}/design/light-template.allowlist.json`, "utf8")) as { entries: AllowEntry[] }).entries;
const isAllowed = compileAllowList(allow);
const defects = scanTree(SRC).filter((h) => !isAllowed(h));
const s = summarise(defects, 50);
console.log(formatReport(s));
if (process.env.FLAT === "1") {
  for (const h of defects) console.log(`${h.file}:${h.line} [${h.rule}] ${h.token}  — ${h.text.slice(0, 140)}`);
} else {
  console.log(formatPerFile(s, 200));
}
process.exitCode = defects.length === 0 ? 0 : 1;
