// S28-C — fixed AU small-business chart for bank-line categorisation.
//
// Aligned to the expense labels on the ATO company tax return (cost of
// sales, contractors, superannuation, rent, interest, depreciation-type
// equipment, R&D, …) so a founder can hand the monthly table to their
// accountant without re-mapping. Kept to 21 keys on purpose: the model is
// asked to pick ONE of these and anything outside the list is rejected.
//
// `gstDefault` is the USUAL GST treatment of the category for a GST-
// registered business buying from AU suppliers — an estimate the UI flags
// as such. It is general information, not tax advice; the BAS is prepared
// from the founder's own tax invoices, not from this table.
//
// Keep `CATEGORY_KEYS` in sync with the CHECK lists in migrations 0377 /
// 0378. Client-safe (no server imports).

export const CATEGORY_KEYS = [
  "revenue",
  "cost_of_sales",
  "contractors",
  "salaries_wages",
  "superannuation",
  "rent",
  "software_subscriptions",
  "cloud_hosting",
  "marketing_advertising",
  "travel",
  "meals_entertainment",
  "professional_fees",
  "insurance",
  "bank_fees",
  "interest",
  "equipment",
  "r_and_d",
  "government_grants",
  "owner_drawings",
  "transfer",
  "other",
] as const;

export type ExpenseCategory = (typeof CATEGORY_KEYS)[number];

export type GstTreatment = "gst" | "gst_free" | "input_taxed" | "unknown";

export type CategorySource = "rule" | "ai" | "manual";

/** How the category behaves in the monthly P&L. */
export type CategoryKind = "income" | "expense" | "neutral";

export interface CategoryMeta {
  key: ExpenseCategory;
  label: string;
  /** One line the UI shows in the select + the model sees in its prompt. */
  description: string;
  kind: CategoryKind;
  gstDefault: GstTreatment;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { key: "revenue", label: "Revenue", description: "Money in from customers — sales, subscriptions, invoices paid, Stripe / PayPal payouts.", kind: "income", gstDefault: "gst" },
  { key: "cost_of_sales", label: "Cost of sales", description: "Direct costs of what you sell — stock, materials, payment-processing fees, fulfilment.", kind: "expense", gstDefault: "gst" },
  { key: "contractors", label: "Contractors", description: "Freelancers, agencies and consultants paid per job or per hour (not employees).", kind: "expense", gstDefault: "gst" },
  { key: "salaries_wages", label: "Salaries & wages", description: "Net pay to employees, PAYG withholding remitted to the ATO, payroll runs.", kind: "expense", gstDefault: "gst_free" },
  { key: "superannuation", label: "Superannuation", description: "Super guarantee contributions paid to a fund or clearing house.", kind: "expense", gstDefault: "gst_free" },
  { key: "rent", label: "Rent & occupancy", description: "Office / co-working rent, outgoings, utilities for the premises.", kind: "expense", gstDefault: "gst" },
  { key: "software_subscriptions", label: "Software subscriptions", description: "SaaS tools — Xero, Slack, Notion, Google Workspace, Atlassian, Figma, GitHub.", kind: "expense", gstDefault: "gst" },
  { key: "cloud_hosting", label: "Cloud & hosting", description: "AWS, Google Cloud, Azure, Vercel, Cloudflare, domains, AI API usage.", kind: "expense", gstDefault: "gst" },
  { key: "marketing_advertising", label: "Marketing & advertising", description: "Google / Meta / LinkedIn ads, sponsorships, events, design and content spend.", kind: "expense", gstDefault: "gst" },
  { key: "travel", label: "Travel", description: "Flights, accommodation, rideshare, taxis, fuel, tolls, parking for business trips.", kind: "expense", gstDefault: "gst" },
  { key: "meals_entertainment", label: "Meals & entertainment", description: "Client meals, team events, coffee — usually not deductible and no GST credit.", kind: "expense", gstDefault: "gst" },
  { key: "professional_fees", label: "Professional fees", description: "Accountants, lawyers, bookkeepers, ASIC fees, registered agents.", kind: "expense", gstDefault: "gst" },
  { key: "insurance", label: "Insurance", description: "Public liability, professional indemnity, cyber, workers' compensation premiums.", kind: "expense", gstDefault: "gst" },
  { key: "bank_fees", label: "Bank fees", description: "Account keeping, merchant and FX fees charged by the bank or card provider.", kind: "expense", gstDefault: "input_taxed" },
  { key: "interest", label: "Interest & loan repayments", description: "Loan interest, credit card interest, principal repayments.", kind: "expense", gstDefault: "input_taxed" },
  { key: "equipment", label: "Equipment", description: "Laptops, monitors, phones, furniture — assets that may be depreciated.", kind: "expense", gstDefault: "gst" },
  { key: "r_and_d", label: "Research & development", description: "Spend you would claim under the R&D Tax Incentive — dedicated engineering, prototypes, trials.", kind: "expense", gstDefault: "gst" },
  { key: "government_grants", label: "Government grants", description: "Grant money received — R&D tax offset refund, Accelerating Commercialisation, state grants.", kind: "income", gstDefault: "gst_free" },
  { key: "owner_drawings", label: "Owner drawings / capital", description: "Money moved to or from a founder personally — drawings, director loans, capital injected, investor funds.", kind: "neutral", gstDefault: "unknown" },
  { key: "transfer", label: "Transfer between accounts", description: "Movements between your own accounts — savings, term deposits, card top-ups. Not income or expense.", kind: "neutral", gstDefault: "unknown" },
  { key: "other", label: "Other / needs review", description: "Could not be categorised — please pick one so the P&L and GST estimate are right.", kind: "expense", gstDefault: "unknown" },
];

const BY_KEY: Readonly<Record<ExpenseCategory, CategoryMeta>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<ExpenseCategory, CategoryMeta>;

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
}

export function categoryMeta(key: ExpenseCategory): CategoryMeta {
  return BY_KEY[key];
}

export function categoryLabel(key: string): string {
  return isExpenseCategory(key) ? BY_KEY[key].label : key;
}

export function gstDefaultFor(key: ExpenseCategory): GstTreatment {
  return BY_KEY[key].gstDefault;
}

export function categoryKind(key: ExpenseCategory): CategoryKind {
  return BY_KEY[key].kind;
}

/** Keys the P&L treats as operating expense (kind = expense). */
export const EXPENSE_CATEGORY_KEYS: readonly ExpenseCategory[] = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.key);

/** Keys the P&L treats as income. */
export const INCOME_CATEGORY_KEYS: readonly ExpenseCategory[] = CATEGORIES.filter((c) => c.kind === "income").map((c) => c.key);
