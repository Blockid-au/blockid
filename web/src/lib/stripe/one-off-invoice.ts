// one-off-invoice — the ATO tax-invoice block every one-off Checkout Session
// carries (G35 P3, plan §1.5 G3 / §6.2).
//
// Same shape the guest One-Click, Money Finder and /api/stripe/checkout
// one-off branches already sent inline: Stripe issues an invoice for the
// payment, with the Seller ABN as a custom field and the GST footer, so the
// buyer receives a valid ATO tax invoice. Prices are GST-inclusive
// (`tax_behavior: "inclusive"` on the Price + `automatic_tax`).
//
// Pure (no I/O) so routes and tests share one definition.

import { LEGAL_ENTITY, LEGAL_ENTITY_ACN_LABEL } from "@/lib/site/legal-entity";

export interface OneOffInvoiceCreation {
  enabled: true;
  invoice_data: {
    description: string;
    custom_fields: Array<{ name: string; value: string }>;
    footer: string;
  };
}

/** `invoice_creation` for a one-off (mode: "payment") Checkout Session. `productName` lands in the invoice description. */
export function oneOffInvoiceCreation(productName: string): OneOffInvoiceCreation {
  return {
    enabled: true,
    invoice_data: {
      description: `BlockID.au — ${productName}`,
      custom_fields: [{ name: "Seller ABN", value: LEGAL_ENTITY.abn }],
      footer: `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ACN_LABEL} · GST-registered`,
    },
  };
}
