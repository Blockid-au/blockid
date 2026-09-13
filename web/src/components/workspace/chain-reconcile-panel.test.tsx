// Colocated render test for the "On-chain vs register" panel (S27-B): no
// token → nothing; in sync → green state, push disabled; drift → the table
// with register / chain / delta and a push enabled for the editor only;
// unreachable → the infrastructure note, never a drift claim; no NaN.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChainReconcilePanel, type ReconcileState } from "./chain-reconcile-panel";

const A = "0x00000000000000000000000000000000000000a1";
const TOKEN = { address: "0xa16e02e87b7454126e5e10d957a927a7f5b5d2be", symbol: "ACME", syncEnabled: true };

function state(over: Partial<ReconcileState> = {}): ReconcileState {
  return { token: TOKEN, last: null, role: "owner", ...over };
}

describe("ChainReconcilePanel", () => {
  it("renders nothing without a token", () => {
    expect(renderToStaticMarkup(<ChainReconcilePanel initial={state({ token: null })} />)).toBe("");
  });

  it("never checked → header, run button, push disabled", () => {
    const html = renderToStaticMarkup(<ChainReconcilePanel initial={state()} />);
    expect(html).toContain("On-chain vs register");
    expect(html).toContain("Never checked");
    expect(html).toContain('data-testid="chain-reconcile-run"');
    expect(html).toMatch(/data-testid="chain-reconcile-push"[^>]*disabled|disabled[^>]*data-testid="chain-reconcile-push"/);
  });

  it("drift → table rows with register / chain / delta and push enabled for an editor; viewer sees no buttons", () => {
    const last: ReconcileState["last"] = {
      id: "r1",
      taken_at: "2026-09-13T06:00:00Z",
      status: "drift",
      drift_count: 3,
      source: "cron",
      summary: {
        matched: [],
        driftRows: [{ shareholder: "Ada", address: A, offchain: 600, onchain: 590, delta: 10 }],
        missingOnChain: [{ shareholder: "Cy", address: null, shares: 50, reason: "no_wallet" }],
        unknownOnChain: [{ address: "0x00000000000000000000000000000000000000c3", shares: 7 }],
        totals: { offchainShares: 650, onchainShares: 597, delta: 53, registerRows: 2, onchainHolders: 2, driftCount: 3 },
      },
    };
    const editor = renderToStaticMarkup(<ChainReconcilePanel initial={state({ last, role: "editor" })} />);
    expect(editor).toContain('data-status="drift"');
    expect(editor).toContain("Ada");
    expect(editor).toContain("+10");
    expect(editor).toContain("Chain is short");
    expect(editor).toContain("No wallet on the register");
    expect(editor).toContain("Unknown wallet");
    expect(editor).toContain("weekly sweep");
    expect(editor).toContain("Push register to chain");
    expect(editor).not.toMatch(/data-testid="chain-reconcile-push"[^>]*disabled/);
    expect(editor).not.toMatch(/NaN|Infinity/);

    const viewer = renderToStaticMarkup(<ChainReconcilePanel initial={state({ last, role: "viewer" })} />);
    expect(viewer).not.toContain("chain-reconcile-push");
    expect(viewer).not.toContain("chain-reconcile-run");
  });

  it("in sync → green line; unreachable → infrastructure note, no drift claim", () => {
    const sync = renderToStaticMarkup(
      <ChainReconcilePanel
        initial={state({
          last: { id: "r", taken_at: "2026-09-13T06:00:00Z", status: "in_sync", drift_count: 0, source: "route", summary: { matched: [{ shareholder: "Ada", address: A, shares: 600 }], driftRows: [], missingOnChain: [], unknownOnChain: [], totals: { offchainShares: 600, onchainShares: 600, delta: 0, registerRows: 1, onchainHolders: 1, driftCount: 0 } } },
        })}
      />,
    );
    expect(sync).toContain("In sync");
    expect(sync).toContain("Every wallet-backed holder matches the chain (1 holder)");

    const down = renderToStaticMarkup(
      <ChainReconcilePanel initial={state({ last: { id: "r", taken_at: "2026-09-13T06:00:00Z", status: "unreachable", drift_count: 0, source: "cron", summary: { error: "ECONNREFUSED" } } })} />,
    );
    expect(down).toContain("Chain unreachable");
    expect(down).toContain("ECONNREFUSED");
    expect(down).toContain("No drift is implied");
    expect(down).not.toContain("chain-drift-table");
  });
});
