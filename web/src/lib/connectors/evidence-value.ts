// G21 P3-C — "Which claim does this make more trustworthy?"
//
// Every integration BlockID offers (or lists as not offered) is justified by
// the claims it strengthens and the evidence-ladder level it can reach
// (docs/product/score-governance.md § 4). This registry is the one source
// the connector cards, the connector → EvidenceRecord emitter
// (lib/connectors/connector-evidence.ts) and the feature inventory read.
//
// Levels: a connector is machine-read from the source of record → L4
// `connected_source`; revenue / payout transaction data → L5
// `transaction_data`. L6 `third_party_verified` is a named human reviewer
// (§ 4, § 13 "connectors read what the source of record exposes; they do
// not audit it") — so the ABR lookup, although an authoritative register,
// ships at L4 and is stated as such on the card.
//
// Pure data + lookups. No React, no Next, no `server-only`.

import type { EvidenceLevel, SviDimension } from "@/lib/evidence/types";

export type EvidenceConnectorId = "stripe" | "xero" | "github" | "ga4" | "abr" | "linkedin";

/** Priority-2/3 integrations listed as "not offered" with the claim they would strengthen. */
export type NotOfferedConnectorId = "quickbooks" | "hubspot" | "salesforce" | "airtable" | "notion_drive" | "investor_crm" | "licensed_datasets";

export interface ConnectorEvidenceValue {
  id: EvidenceConnectorId | NotOfferedConnectorId;
  /** Display name ("Xero"). */
  name: string;
  /** Dimensions whose claims this source strengthens (chips on the card). */
  dimensions: readonly SviDimension[];
  /** CLAIM_REGISTRY keys this source can prove (empty for a not-offered row). */
  claimKeys: readonly string[];
  /** The strongest ladder level this source reaches. */
  level: EvidenceLevel;
  /** One sentence: which claim it makes more trustworthy, and how. */
  sentence: string;
  /** `offered` today (an OAuth route exists), or a Priority-2/3 `not_offered` list row. */
  availability: "offered" | "not_offered";
  /** HIDDEN_FEATURES key when the connector is hidden behind an unprovisioned OAuth app. */
  hiddenKey?: "connector_stripe_connect" | "connector_xero" | "connector_quickbooks";
}

export const DIMENSION_LABEL: Record<SviDimension, string> = {
  ftv: "Founder & Team",
  mpc: "Market Pull",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Capital & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategy & Moat",
};

export const EVIDENCE_LEVEL_LABEL: Record<EvidenceLevel, string> = {
  L1_self_declared: "L1 · self-declared",
  L2_public_url: "L2 · public URL",
  L3_uploaded_document: "L3 · uploaded document",
  L4_connected_source: "L4 · connected source",
  L5_transaction_data: "L5 · transaction data",
  L6_third_party_verified: "L6 · third-party verified",
};

export const CONNECTOR_EVIDENCE_VALUES: readonly ConnectorEvidenceValue[] = Object.freeze([
  {
    id: "stripe",
    name: "Stripe",
    dimensions: ["tre", "mpc"],
    claimKeys: ["traction.has_revenue", "traction.mrr_aud", "traction.arr_aud", "traction.paying_customers", "traction.churn_90d_pct", "market.has_customers"],
    level: "L5_transaction_data",
    sentence: "Turns a stated MRR into transaction data: recurring revenue, paying customers and 90-day churn are read from Stripe, so the revenue claim no longer rests on the founder's word.",
    availability: "offered",
    hiddenKey: "connector_stripe_connect",
  },
  {
    id: "xero",
    name: "Xero",
    dimensions: ["tre", "cgh"],
    claimKeys: ["traction.has_revenue", "traction.mrr_aud", "capital.bank_balance_aud", "capital.runway_months"],
    level: "L5_transaction_data",
    sentence: "Backs the revenue claim with the booked P&L and the runway claim with cash at bank, read from the accounting file rather than a spreadsheet.",
    availability: "offered",
    hiddenKey: "connector_xero",
  },
  {
    id: "github",
    name: "GitHub",
    dimensions: ["ftv", "ptd"],
    claimKeys: ["ftv.shipping_cadence", "product.has_source_code"],
    level: "L4_connected_source",
    sentence: "Makes the execution claim observable: commit cadence over the last 30 days and the repository itself are read from GitHub, so 'we ship weekly' becomes a measured figure.",
    availability: "offered",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    dimensions: ["tre", "mpc"],
    claimKeys: ["traction.monthly_sessions", "traction.monthly_conversions", "traction.has_analytics"],
    level: "L4_connected_source",
    sentence: "Strengthens the traction claim with 30-day sessions and tracked conversions read from the GA4 property, instead of a screenshot.",
    availability: "offered",
  },
  {
    id: "abr",
    name: "Australian Business Register",
    dimensions: ["lco"],
    claimKeys: ["lco.registered", "legal.has_abn"],
    level: "L4_connected_source",
    sentence: "Confirms the registration claim against the ABR: ABN status and entity name are read from the register (an authoritative source, still machine-read — a reviewer's check is what reaches L6).",
    availability: "offered",
  },
  {
    id: "linkedin",
    name: "LinkedIn (profile upload)",
    dimensions: ["ftv"],
    claimKeys: ["team.founder_experience"],
    level: "L3_uploaded_document",
    sentence: "Supports the founder-experience claim with an exported profile; an upload, so it reaches L3 rather than a connected source.",
    availability: "offered",
  },
  // ── Priority-2/3 — listed, not offered (docs/plans/g21-fi-upgrade-2026-09-20.md § P3-C) ──
  {
    id: "quickbooks",
    name: "QuickBooks",
    dimensions: ["tre", "cgh"],
    claimKeys: [],
    level: "L5_transaction_data",
    sentence: "Would back the revenue and runway claims with the booked P&L, as Xero does; the CSV import under Expenses covers the same figures today.",
    availability: "not_offered",
    hiddenKey: "connector_quickbooks",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    dimensions: ["tre", "mpc"],
    claimKeys: [],
    level: "L4_connected_source",
    sentence: "Would strengthen the pipeline and customer-count claims with CRM deal stages read from the source; today those figures are self-declared.",
    availability: "not_offered",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    dimensions: ["tre", "mpc"],
    claimKeys: [],
    level: "L4_connected_source",
    sentence: "Would strengthen the pipeline and customer-count claims with CRM opportunity data; today those figures are self-declared.",
    availability: "not_offered",
  },
  {
    id: "airtable",
    name: "Airtable",
    dimensions: ["tre"],
    claimKeys: [],
    level: "L4_connected_source",
    sentence: "Would let a customer or pilot register kept in Airtable back the paying-customer claim; an uploaded export reaches L3 today.",
    availability: "not_offered",
  },
  {
    id: "notion_drive",
    name: "Notion / Google Drive",
    dimensions: ["iri", "cgh"],
    claimKeys: [],
    level: "L3_uploaded_document",
    sentence: "Would sync the data-room documents behind the investor-readiness and governance claims; uploading them to the Evidence Hub reaches the same L3 today.",
    availability: "not_offered",
  },
  {
    id: "investor_crm",
    name: "Investor CRMs (Affinity, DealRoom)",
    dimensions: ["iri"],
    claimKeys: [],
    level: "L4_connected_source",
    sentence: "Would let an evaluator's own pipeline record back the prior-raise and investor-conversation claims; today the dossier records them from the founder's data room.",
    availability: "not_offered",
  },
  {
    id: "licensed_datasets",
    name: "Licensed datasets (Crunchbase, PitchBook)",
    dimensions: ["mpc", "svm"],
    claimKeys: [],
    level: "L2_public_url",
    sentence: "Would add a third-party record of funding rounds and market comparables beside the founder's claim; public registers and the founder's own links reach L2 today.",
    availability: "not_offered",
  },
]);

const BY_ID = new Map(CONNECTOR_EVIDENCE_VALUES.map((v) => [v.id, v]));

/** The registry row for a connector id; undefined when unknown. */
export function connectorEvidenceValue(id: string): ConnectorEvidenceValue | undefined {
  return BY_ID.get(id as EvidenceConnectorId);
}

/** Rows offered today (an OAuth / lookup route exists). */
export function offeredConnectors(): ConnectorEvidenceValue[] {
  return CONNECTOR_EVIDENCE_VALUES.filter((v) => v.availability === "offered");
}

/** Priority-2/3 rows listed as "not offered". */
export function notOfferedConnectors(): ConnectorEvidenceValue[] {
  return CONNECTOR_EVIDENCE_VALUES.filter((v) => v.availability === "not_offered");
}

/** Dimension chips for a card, in registry order. */
export function connectorDimensionLabels(id: string): string[] {
  return (connectorEvidenceValue(id)?.dimensions ?? []).map((d) => DIMENSION_LABEL[d]);
}

/** The catalogue provider ids that map onto a registry row (the Integrations page uses `ga4` for Google Analytics). */
export const CATALOGUE_PROVIDER_TO_EVIDENCE: Record<string, EvidenceConnectorId> = {
  github: "github",
  stripe: "stripe",
  ga4: "ga4",
  xero: "xero",
  abr: "abr",
  linkedin: "linkedin",
  analytics: "ga4",
  google_analytics: "ga4",
};
