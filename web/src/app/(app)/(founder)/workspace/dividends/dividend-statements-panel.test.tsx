// Colocated render test for the dividend statements panel (S25-B).
//
// Pins the show-cost-first button copy (2 credits vs included), the
// role-aware controls (editor issues + saves to the data room, owner/admin
// also voids, viewer sees downloads only), the record card with register
// download, the statement rows (issued / voided, PDF link, TFN withheld
// line), the empty state, and the copy rule (no "PhD", ≤ 2-sentence intro).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DividendStatementsPanel,
  VOID_REASON_MAX_LEN,
  VoidReasonForm,
  canIssue,
  canVoid,
  normaliseVoidReason,
  periodLabel,
  type DividendRecordItem,
  type StatementListItem,
  type StatementsPanelState,
} from "./dividend-statements-panel";

const ST: StatementListItem = {
  id: "s-1",
  statementNo: "DS-7K3MP-Q9X2A",
  recordId: "r-1",
  shareholderName: "Jane Founder",
  role: "founder",
  sharesHeld: 600_000,
  grossAud: 30_000,
  frankingCreditAud: 10_000,
  tfnWithheldAud: 0,
  netPaidAud: 30_000,
  frankingPct: 100,
  creditsCharged: 2,
  issuedAt: "2026-07-16T02:00:00Z",
  voidedAt: null,
  voidReason: null,
  pdfUrl: "/api/dividends/statements/s-1/pdf",
};

const VOIDED: StatementListItem = { ...ST, id: "s-2", statementNo: "DS-ABCDE-FGHJK", shareholderName: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 400_000, grossAud: 20_000, frankingCreditAud: 0, tfnWithheldAud: 9_400, netPaidAud: 10_600, frankingPct: 0, voidedAt: "2026-07-20T00:00:00Z", voidReason: "wrong holding", pdfUrl: "/api/dividends/statements/s-2/pdf" };

const REC: DividendRecordItem = {
  id: "r-1",
  period: "2026-06",
  createdAt: "2026-07-01T00:00:00Z",
  paidAt: "2026-07-15",
  totalDividendAud: 50_000,
  perShareAud: 0.05,
  companyTaxRate: 0.25,
  frankingPct: 100,
  payoutCount: 2,
  registerUrl: "/api/dividends/r-1/register.pdf",
  statements: [ST, VOIDED],
};

function state(over: Partial<StatementsPanelState> = {}): StatementsPanelState {
  return { records: [REC], role: "owner", cost: 2, included: false, ...over };
}

describe("DividendStatementsPanel", () => {
  it("owner, Starter: button shows the 2-credit cost; record card has register + data room; rows have PDF + void", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state()} />);
    expect(html).toContain("Issue statements (2 credits)");
    expect(html).toContain('data-testid="dividend-record"');
    expect(html).toContain("Dividend — June 2026");
    expect(html).toContain("A$50,000.00 total");
    expect(html).toContain("100% franked");
    expect(html).toContain("25% tax rate");
    expect(html).toContain("1/2 statements live");
    expect(html).toContain('href="/api/dividends/r-1/register.pdf"');
    expect(html).toContain('data-testid="statements-dataroom"');
    expect(html).toContain('data-statement="DS-7K3MP-Q9X2A"');
    expect(html).toContain('href="/api/dividends/statements/s-1/pdf"');
    expect(html).toContain("Jane Founder");
    expect(html).toContain("franking credit A$10,000.00");
    expect(html).toContain("Issued");
    expect(html).toContain('data-testid="statement-void"');
    // Voided row: label, reason, TFN withheld line, no void button for it.
    expect(html).toContain('data-statement="DS-ABCDE-FGHJK" data-voided="1"');
    expect(html).toContain("Voided");
    expect(html).toContain("voided: wrong holding");
    expect(html).toContain("TFN withheld A$9,400.00");
    expect((html.match(/data-testid="statement-void"/g) ?? []).length).toBe(1);
    expect(html).toContain("not tax advice");
    expect(html).not.toMatch(/PhD/);
    expect(html).not.toContain("Auschain");
  });

  it("Growth / add-on: the button says included", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state({ included: true })} />);
    expect(html).toContain("Issue statements (included in your plan)");
  });

  it("editor: can issue and save to the data room but not void", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state({ role: "editor" })} />);
    expect(html).toContain('data-testid="issue-statements"');
    expect(html).toContain('data-testid="statements-dataroom"');
    expect(html).not.toContain('data-testid="statement-void"');
  });

  it("viewer: read-only note, download links only", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state({ role: "viewer" })} />);
    expect(html).toContain('data-testid="statements-readonly"');
    expect(html).not.toContain('data-testid="issue-statements"');
    expect(html).not.toContain('data-testid="statements-dataroom"');
    expect(html).not.toContain('data-testid="statement-void"');
    expect(html).toContain('data-testid="statement-pdf"');
    expect(html).toContain('data-testid="register-pdf"');
  });

  it("empty state when no dividend has been declared", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state({ records: [] })} />);
    expect(html).toContain('data-testid="statements-empty"');
    expect(html).toContain("No dividend has been declared yet.");
    expect(html).not.toContain('data-testid="issue-statements"');
    expect(html).not.toContain('data-testid="statements-recipient"');
  });

  it("a record with no statements yet shows the per-record empty line and hides data-room save", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state({ records: [{ ...REC, statements: [] }] })} />);
    expect(html).toContain('data-testid="statement-empty"');
    expect(html).toContain("0/2 statements live");
    expect(html).toContain('data-testid="issue-statements"');
    expect(html).not.toContain('data-testid="statements-dataroom"');
  });

  it("helpers", () => {
    expect(canIssue("editor")).toBe(true);
    expect(canIssue("viewer")).toBe(false);
    expect(canVoid("admin")).toBe(true);
    expect(canVoid("editor")).toBe(false);
    expect(periodLabel("2026-06")).toBe("June 2026");
    expect(periodLabel("x")).toBe("x");
  });

  it("void button is a disclosure for the inline confirm (aria-expanded / aria-controls), closed by default — no window.prompt", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state()} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="void-confirm-s-1"');
    expect(html).not.toContain('data-testid="void-confirm"');
    expect(html).not.toContain("prompt(");
  });

  it("VoidReasonForm: labelled group, required textarea (maxLength = API limit), Confirm disabled until a reason is typed, Cancel", () => {
    const noop = () => {};
    const empty = renderToStaticMarkup(<VoidReasonForm statementId="s-1" statementNo="DS-7K3MP-Q9X2A" reason="" busy={false} onChange={noop} onConfirm={noop} onCancel={noop} />);
    expect(empty).toContain('id="void-confirm-s-1"');
    expect(empty).toContain('role="group"');
    expect(empty).toContain('aria-labelledby="void-reason-s-1-label"');
    expect(empty).toContain('for="void-reason-s-1"');
    expect(empty).toContain("Void DS-7K3MP-Q9X2A — reason (printed on the VOID banner)");
    expect(empty).toContain('<textarea id="void-reason-s-1"');
    expect(empty).toContain(`maxLength="${VOID_REASON_MAX_LEN}"`);
    expect(empty).toContain('aria-required="true"');
    expect(empty).toContain('aria-describedby="void-reason-s-1-hint"');
    expect(empty).toContain('id="void-reason-s-1-hint"');
    expect(empty).toContain("Voiding is one-way");
    expect(empty).toContain('data-testid="void-reason"');
    // Confirm disabled while the reason is blank; Cancel enabled.
    expect(empty).toMatch(/<button type="button" disabled="" data-testid="confirm-void"/);
    expect(empty).toMatch(/<button type="button" data-testid="cancel-void"/);
    expect(empty).toContain("Confirm void");
    expect(empty).not.toContain('aria-invalid');

    const typed = renderToStaticMarkup(<VoidReasonForm statementId="s-1" statementNo="DS-7K3MP-Q9X2A" reason="wrong holding" busy={false} onChange={noop} onConfirm={noop} onCancel={noop} />);
    expect(typed).toMatch(/<button type="button" data-testid="confirm-void"/);
    expect(typed).toContain(">wrong holding</textarea>");

    const busy = renderToStaticMarkup(<VoidReasonForm statementId="s-1" statementNo="DS-7K3MP-Q9X2A" reason="wrong holding" busy onChange={noop} onConfirm={noop} onCancel={noop} />);
    expect(busy).toMatch(/<button type="button" disabled="" data-testid="confirm-void"/);
    expect(busy).toMatch(/<button type="button" disabled="" data-testid="cancel-void"/);
    expect(busy).toContain("animate-spin");

    const tooLong = renderToStaticMarkup(<VoidReasonForm statementId="s-1" statementNo="DS-7K3MP-Q9X2A" reason={"x".repeat(VOID_REASON_MAX_LEN + 1)} busy={false} onChange={noop} onConfirm={noop} onCancel={noop} />);
    expect(tooLong).toContain('aria-invalid="true"');
    expect(tooLong).toMatch(/<button type="button" disabled="" data-testid="confirm-void"/);
  });

  it("normaliseVoidReason mirrors the void API: trimmed, non-empty, ≤ 500 chars", () => {
    expect(VOID_REASON_MAX_LEN).toBe(500);
    expect(normaliseVoidReason("  wrong holding  ")).toBe("wrong holding");
    expect(normaliseVoidReason("   ")).toBeNull();
    expect(normaliseVoidReason("")).toBeNull();
    expect(normaliseVoidReason("x".repeat(500))).toHaveLength(500);
    expect(normaliseVoidReason("x".repeat(501))).toBeNull();
  });

  it("intro copy is at most two sentences", () => {
    const html = renderToStaticMarkup(<DividendStatementsPanel initial={state()} />);
    const m = html.match(/One AU distribution statement[^<]*/);
    expect(m).not.toBeNull();
    expect((m![0].match(/\.\s/g) ?? []).length + 1).toBeLessThanOrEqual(2);
  });
});
