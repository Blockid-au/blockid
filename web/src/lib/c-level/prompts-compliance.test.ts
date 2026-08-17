import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanForRealNames } from "./compute-c-level-dcf";

const PROMPTS_DIR = join(process.cwd(), "scripts", "lib", "clevel-prompts");

/**
 * The prompts intentionally NAME real companies inside the "COMPLIANCE"
 * section as a ban-list. Those mentions are the guardrail, not a violation.
 * We strip that section before scanning.
 */
function stripComplianceBanList(md: string): string {
  return md.replace(/## COMPLIANCE[\s\S]*?(?=\n## )/g, "");
}

const ROLES = ["cfo", "ceo", "cto", "cmo", "cdo"] as const;

describe("clevel prompts: compliance sweep (no real company names outside ban-list)", () => {
  for (const role of ROLES) {
    it(`${role}.md — non-ban-list body has no real names`, () => {
      const path = join(PROMPTS_DIR, `${role}.md`);
      const raw = readFileSync(path, "utf8");
      const stripped = stripComplianceBanList(raw);
      const scan = scanForRealNames(stripped);
      if (!scan.ok) {
        // Surface which names slipped through for a debugging assertion
        // eslint-disable-next-line no-console
        console.error(`[${role}.md] violations:`, scan.violations);
      }
      expect(scan.ok).toBe(true);
    });

    it(`${role}.md — includes the "no real names" guardrail language`, () => {
      const path = join(PROMPTS_DIR, `${role}.md`);
      const raw = readFileSync(path, "utf8");
      expect(raw).toMatch(/anonymised|COMPLIANCE|No real company/i);
    });
  }
});
