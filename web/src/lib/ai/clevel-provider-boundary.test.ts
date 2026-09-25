import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// These customer adapters must never inherit the unrestricted background chain.
const adapters = [
  "src/app/api/support/route.ts",
  "src/app/api/data-room/auto-fill/route.ts",
  "src/lib/term-sheet/analyze.ts",
  "src/app/api/revaluation/route.ts",
  "src/app/api/competitive-positioning/positioning/route.ts",
  "src/app/api/svi/modular/route.ts",
  "src/app/api/svi/research/route.ts",
  "src/app/api/svi/full-report/route.ts",
  "src/app/api/svi/report/route.ts",
  "src/app/api/svi/report-section/route.ts",
  "src/app/api/svi/ai-score/route.ts",
  "src/app/api/svi/pitch-deck/route.ts",
  "src/app/api/svi/report/qa/route.ts",
  "src/app/api/svi/report/section/route.ts",
  "src/app/api/startup-package/analyze/route.ts",
  "src/app/api/evidence/analyze/route.ts",
  "src/app/api/ai/share-structure/route.ts",
  "src/app/api/ai/action-plan/route.ts",
  "src/app/api/ai/equity-split/route.ts",
  "src/app/api/ai/vesting/route.ts",
  "src/app/api/ai/vesting-review/route.ts",
  "src/app/api/ai/esop/route.ts",
  "src/app/api/evaluation/[criterionKey]/ai-suggest/route.ts",
  "src/app/api/evaluation/[criterionKey]/ai-score/route.ts",
  "src/app/api/journal/reflect/route.ts",
  "src/lib/agents/tech-intelligence.ts",
  "src/lib/agents/grant-advisor-narrative.ts",
  "src/lib/agents/abn-trademark-guide.ts",
  "src/lib/agents/rnd-idea-lab.ts",
  "src/lib/agents/accelerator-drafter.ts",
  "src/lib/agents/cto-next-best-action.ts",
  "src/lib/agents/chro-team.ts",
  "src/lib/agents/grant-application-drafter.ts",
  "src/lib/ai-equity.ts",
  "src/lib/competitive-intelligence.ts",
  "src/lib/rnd-analysis.ts",
  "src/lib/action-plan/generate.ts",
  "src/lib/agents/cmo-market-research.ts",
  "src/lib/intake/analyze-input.ts",
  "src/lib/intake/deck-sections.ts",
  "src/lib/analyses/first-analysis/job.ts"
,
  "src/app/api/svi/dimensions/stream/route.legacy.ts",
  "src/lib/expenses/categorise.ts"
] as const;

describe("customer C-level provider boundary", () => {
  it.each(adapters)("%s opts into DeepInfra at every customer dispatch", (filename) => {
    const source = ts.createSourceFile(filename, fs.readFileSync(path.join(process.cwd(), filename), "utf8"), ts.ScriptTarget.Latest, true);
    let checked = 0;
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "generateResearchSummary") return; // shared/unspecified caller, not a customer adapter
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "callAI") {
        const options = node.arguments[0];
        expect(options && ts.isObjectLiteralExpression(options), filename).toBe(true);
        if (options && ts.isObjectLiteralExpression(options)) {
          const policy = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === "providerPolicy");
          expect(policy && ts.isPropertyAssignment(policy) && ts.isStringLiteral(policy.initializer) && policy.initializer.text === "deepinfra-only", filename).toBe(true);
          checked++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(checked, filename).toBeGreaterThan(0);
  });
});
