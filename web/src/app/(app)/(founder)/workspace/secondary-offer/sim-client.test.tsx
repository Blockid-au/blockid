// Colocated render test for the sandbox order book (S27-B): the Chapter
// 6D / 7 banner is on every state, price discovery is labelled "sandbox
// implied", locked plans get the Growth note, viewers cannot submit, the
// depth ladder flags held qty, and nothing prints NaN.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SecondarySimClient, type BookState } from "./sim-client";

const BOOK: BookState = {
  sandbox: true,
  notice: "Sandbox — no real securities are offered or transferred; not an offer under Chapter 6D or Chapter 7 of the Corporations Act 2001 (Cth).",
  role: "editor",
  settings: { rofrEnabled: true, rofrHoldHours: 48 },
  depth: { bids: [{ price: 1.0, qty: 10, orders: 1, held: 0 }], asks: [{ price: 1.5, qty: 70, orders: 1, held: 20 }], bestBid: 1.0, bestAsk: 1.5, spread: 0.5 },
  discovery: { label: "sandbox implied", last: 1.5, mid: 1.25, vwap: 1.5, impliedValuationAud: 3_000_000, fullyDilutedShares: 2_000_000, tradedShares: 30, tradeCount: 1 },
  trades: [{ id: "t1", buyerLabel: "Angel", sellerLabel: "Ada", price: 1.5, qty: 30, tradedAt: "2026-09-13T00:00:00Z" }],
  holders: [
    { holderKey: "sh:s1", label: "Ada", register: 600, position: 570, restingSell: 70, onRegister: true },
    { holderKey: "sb:angel", label: "Angel", register: 0, position: 30, restingSell: 0, onRegister: false },
  ],
  fullyDilutedShares: 2_000_000,
};

describe("SecondarySimClient", () => {
  it("editor: banner, sandbox-implied discovery, depth with held qty, tape, positions, submit enabled", () => {
    const html = renderToStaticMarkup(<SecondarySimClient canTrade locked={false} initial={BOOK} />);
    expect(html).toContain('data-testid="sandbox-banner"');
    expect(html).toContain("Chapter 6D");
    expect(html).toContain("Sandbox implied valuation");
    expect(html).toContain("A$3.00M");
    expect(html).toContain("not a valuation");
    expect(html).toContain("A$1.5000");
    expect(html).toContain("(20 held)");
    expect(html).toContain("Angel ← Ada");
    expect(html).toContain("(reg 600)");
    expect(html).toContain("Enforce shareholders");
    expect(html).not.toContain('data-testid="sim-locked"');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("locked plan: Growth note with the pricing link; viewer: submit disabled and role note", () => {
    const locked = renderToStaticMarkup(<SecondarySimClient canTrade={false} locked initial={BOOK} />);
    expect(locked).toContain('data-testid="sim-locked"');
    expect(locked).toContain("/pricing?feature=secondary_market.view");
    expect(locked).toContain('data-testid="sandbox-banner"');

    const viewer = renderToStaticMarkup(<SecondarySimClient canTrade={false} locked={false} initial={BOOK} />);
    expect(viewer).toMatch(/data-testid="sim-submit"[^>]*disabled|disabled[^>]*data-testid="sim-submit"/);
    expect(viewer).toContain("Editors and above can place sandbox orders");
    expect(viewer).not.toContain('data-testid="sim-locked"');
  });

  it("empty book: dashes, never NaN, banner still present", () => {
    const empty: BookState = { ...BOOK, depth: { bids: [], asks: [], bestBid: null, bestAsk: null, spread: null }, discovery: { ...BOOK.discovery, last: null, mid: null, vwap: null, impliedValuationAud: null, tradedShares: 0, tradeCount: 0 }, trades: [], holders: [] };
    const html = renderToStaticMarkup(<SecondarySimClient canTrade locked={false} initial={empty} />);
    expect(html).toContain("No sandbox trades yet");
    expect(html).toContain('data-testid="sandbox-banner"');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
