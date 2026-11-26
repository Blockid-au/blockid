// G36 (26/11/2026) — the live page sweep (tests/live-qa/33-page-sweep.spec.ts)
// kept finding founder pages served with no <h1> (cap-table, investor CRM,
// score trend, evidence gaps): client components fetch their data in the
// browser, so the loading state is what the server sends, and it had no
// heading. This pins the server pass (= loading state; no effect runs under
// renderToStaticMarkup) of every such page to exactly one h1.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/workspace",
  useParams: () => ({}),
}));

import { FinanceDashboardClient } from "./finance/finance-client";
import { DocumentsClient } from "./documents/documents-client";
import { ShareholdersClient } from "./equity/shareholders/shareholders-client";
import { RoundClient } from "./raise/round/[roundId]/round-client";
import { SviEvidenceClient } from "./evidence/gaps/svi-evidence-client";
import { ExitStrategyResultsClient } from "./exit/strategy/[scenarioId]/exit-strategy-results-client";

const cases: Array<[string, ReactElement]> = [
  ["finance", <FinanceDashboardClient key="f" userEmail="a@example.com" startupName="Acme" />],
  ["documents", <DocumentsClient key="d" />],
  ["shareholders", <ShareholdersClient key="s" isAdmin={false} />],
  ["raise round", <RoundClient key="r" roundId="r1" />],
  ["evidence gaps", <SviEvidenceClient key="e" projectId="p1" />],
  ["exit strategy", <ExitStrategyResultsClient key="x" scenarioId="s1" />],
];

describe("founder workspace loading states carry the page h1", () => {
  it.each(cases)("%s", (_name, el) => {
    const html = renderToStaticMarkup(el);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });
});
