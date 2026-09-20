// G20-sweep: /workspace/esop/offers/request is a client page with no
// workspace shell, so it must provide its own <main> landmark and one <h1>
// (the founder sweep reported `no_main` on 2026-09-20).
import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/legal/not-financial-advice", () => ({ NotFinancialAdvice: () => <p data-nfa /> }));

import EquityOfferRequestPage from "./page";

async function html(): Promise<string> {
  const stream = await renderToReadableStream(<EquityOfferRequestPage />);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("/workspace/esop/offers/request", () => {
  it("renders one <main> landmark and one <h1>", async () => {
    const out = await html();
    expect((out.match(/<main[\s>]/g) ?? []).length).toBe(1);
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain("Request a Call");
    expect(out).toContain('href="/workspace/esop/offers"');
  });
});
