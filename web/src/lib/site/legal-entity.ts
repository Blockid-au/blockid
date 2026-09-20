// Canonical legal identity — the ONE place company identity lives (G21 P0-A).
//
// Advisor feedback 2026-09-20: trust is the product, and a site that names its
// operator differently on different pages loses it. Every page, PDF, e-mail,
// JSON-LD block and invoice line derives its entity strings from this object.
// Never hard-code "Auschain", "PPL Food", the ACN or the ABN anywhere else —
// `legal-entity.test.ts` fails on stray literals.
//
// The split below is the founder's standing decision (2026-09-10, see
// `docs/design/messaging.md` §8): marketing surfaces name the product company
// (`marketingOperator`), while billing / legal / invoices / JSON-LD name the
// seller of record (`operator`, which carries the ACN/ABN). Both roles are
// rendered explicitly so the two names never look like a contradiction.
// Flipping `marketingOperator` to the operator unifies the site in one edit.

export const LEGAL_ENTITY = {
  brand: "BlockID",
  /** Seller of record: invoices, GST, Stripe merchant, privacy + terms owner. */
  operator: "Auschain PTY LTD",
  acn: "659 615 111",
  abn: "79 659 615 111",
  /** Product company shown on marketing surfaces (footer, about, home). */
  marketingOperator: "PPL Food PTY LTD",
  jurisdiction: "Australia",
  city: "Sydney NSW",
  supportEmail: "support@blockid.au",
  privacyEmail: "privacy@blockid.au",
  adminEmail: "admin@blockid.au",
  privacyOwner: "Auschain PTY LTD",
  termsOwner: "Auschain PTY LTD",
  invoiceEntity: "Auschain PTY LTD",
  stripeMerchant: "Auschain PTY LTD",
  copyrightHolder: "Auschain PTY LTD",
  domain: "blockid.au",
} as const;

export type LegalEntity = typeof LEGAL_ENTITY;

/** "ACN 659 615 111" */
export const LEGAL_ENTITY_ACN_LABEL = `ACN ${LEGAL_ENTITY.acn}`;
/** "ABN 79 659 615 111" */
export const LEGAL_ENTITY_ABN_LABEL = `ABN ${LEGAL_ENTITY.abn}`;

/** "Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)" — legal + PDF cover. */
export function legalLine(): string {
  return `${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ACN_LABEL}, ${LEGAL_ENTITY_ABN_LABEL})`;
}

/** "Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW" — invoices, e-mail footers, JSON-LD. */
export function sellerOfRecordLine(): string {
  return `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ABN_LABEL} · ${LEGAL_ENTITY.city}`;
}

/** Marketing footer line — names both roles so the split reads as intended. */
export function marketingLine(year: number = new Date().getFullYear()): string {
  const marketing: string = LEGAL_ENTITY.marketingOperator;
  const built =
    marketing === LEGAL_ENTITY.operator
      ? `© ${year} ${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ABN_LABEL}`
      : `© ${year} ${LEGAL_ENTITY.brand} · built by ${LEGAL_ENTITY.marketingOperator}`;
  return `${built} · Billing, legal and invoices: ${LEGAL_ENTITY.operator} ${LEGAL_ENTITY_ABN_LABEL} · ${LEGAL_ENTITY.city}`;
}

/** Trust-section rows (home, product, solutions, pricing, methodology). */
export function trustRows(sviVersion: string): Array<{ label: string; value: string }> {
  return [
    { label: "Operating entity", value: `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY.jurisdiction}` },
    { label: "ACN / ABN", value: `${LEGAL_ENTITY_ACN_LABEL} · ${LEGAL_ENTITY_ABN_LABEL}` },
    { label: "Methodology version", value: `Startup Value Index v${sviVersion}` },
    { label: "Support", value: LEGAL_ENTITY.supportEmail },
  ];
}
