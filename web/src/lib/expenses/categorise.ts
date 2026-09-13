// S28-C — bank-line categoriser: deterministic rules first, then the model.
//
//   categoriseRows(rows, { learned })          → rules only (free, sync)
//   categoriseWithAi(rows, { ai })             → model on the rows rules left
//   categoriseBatch(rows, { learned, ai })     → both
//
// Rules (in order, first match wins)
//   1. learned per-project rules (expense_rules, migration 0378) keyed on
//      `merchantKey(description)` — the founder's own manual decisions;
//   2. the built-in AU merchant keyword table (AWS, Google Cloud, Stripe
//      fees, Xero, ATO, super funds, Bunnings, …) with a sign guard
//      (revenue / grants must be money IN);
//   3. recurring-pattern detection across the batch: the same merchant
//      charged a near-identical small amount in ≥ 3 distinct months with no
//      keyword match is a subscription (0.6, no review).
// Anything left is batched ≤ MAX_AI_BATCH per model call with a JSON
// schema. A model answer is accepted ONLY when the category is in the enum,
// the sign agrees, and confidence ≥ MIN_AI_CONFIDENCE — otherwise the row
// stays `other` with `needsReview: true`. Pure: no I/O; `ai` is injected so
// the colocated test never touches a model.

import {
  CATEGORIES,
  CATEGORY_KEYS,
  categoryKind,
  gstDefaultFor,
  isExpenseCategory,
  type CategorySource,
  type ExpenseCategory,
  type GstTreatment,
} from "./categories";

export const MAX_AI_BATCH = 40;
export const MIN_AI_CONFIDENCE = 0.5;
export const RULE_CONFIDENCE = 0.9;
export const LEARNED_CONFIDENCE = 0.97;
export const RECURRING_CONFIDENCE = 0.6;
/** Recurring charges above this are not assumed to be a subscription (rent, loan, retainer). */
export const RECURRING_MAX_AUD = 1000;

export interface CategoriseInput {
  id: string;
  occurredOn: string;
  description: string;
  /** Signed: money OUT negative, money IN positive. */
  amountAud: number;
}

export interface CategoriseDecision {
  id: string;
  category: ExpenseCategory;
  source: CategorySource | null;
  confidence: number;
  needsReview: boolean;
  counterparty: string | null;
  gstTreatment: GstTreatment;
}

// ─── Merchant key ────────────────────────────────────────────────────────────

const NOISE_PREFIXES = [
  "visa purchase", "visa debit", "mastercard purchase", "eftpos purchase", "eftpos debit", "card purchase",
  "debit card purchase", "purchase", "direct debit", "direct credit", "bpay payment", "bpay", "osko payment",
  "osko deposit", "osko", "payid", "internet transfer", "internet banking", "online payment", "payment to",
  "payment from", "payment by authority to", "transfer to", "transfer from", "tfr to", "tfr from", "pos", "eft",
  "dd", "sp ", "sq *", "paypal *", "pp*", "apple.com/bill", "amzn mktp",
];

/**
 * Lower-case merchant token the rules and the learned table key on:
 * bank-narration prefixes, card numbers, receipt / reference numbers,
 * dates and locations are stripped; the first three words remain.
 *   "VISA PURCHASE 14/06 AWS EMEA aws.amazon.co 4534" → "aws emea"
 */
export function merchantKey(description: string): string {
  let s = (description ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const p of NOISE_PREFIXES) {
    if (s.startsWith(p + " ") || s.startsWith(p)) s = s.slice(p.length).trim();
  }
  s = s
    .replace(/\b(card|ref|reference|receipt|rcpt|inv|invoice|txn|id)\s*[:#]?\s*[a-z0-9-]*\d[a-z0-9-]*/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, " ")
    .replace(/\bx{2,}\d+\b/g, " ")
    .replace(/[*#:]/g, " ")
    .replace(/\b[a-z0-9.-]+\.(com|co|au|io|net|org)(\.[a-z]{2})?\b/g, " ")
    .replace(/\b[a-z]*\d[a-z0-9,.]*\b/g, " ")
    .replace(/\b(pty|ltd|limited|inc|llc|au|aus|australia|sydney|melbourne|brisbane|perth|adelaide|nsw|vic|qld|wa|sa|tas|act|nt)\b/g, " ")
    .replace(/[^a-z&' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ").filter((w) => w.length > 1 || w === "&").slice(0, 3);
  const key = words.join(" ").slice(0, 60).trim();
  return key.length >= 2 ? key : "unknown";
}

// ─── Keyword table ───────────────────────────────────────────────────────────

export type SignRule = "in" | "out" | "any";

export interface MerchantRule {
  /** Tested against the lower-cased, whitespace-collapsed narration. */
  pattern: RegExp;
  category: ExpenseCategory;
  /** Money direction the rule requires (default: any). */
  sign?: SignRule;
  confidence?: number;
  /** Flag for the founder even though the rule decided (ATO payments: split in the BAS). */
  review?: boolean;
}

// Order matters: specific before generic ("stripe fee" before "stripe",
// "uber eats" before "uber", "transfer" before anything that mentions one).
export const MERCHANT_RULES: readonly MerchantRule[] = [
  // ── Transfers / owner money first — they must never become P&L lines ──
  { pattern: /\b(internal transfer|transfer to (savings|term deposit|own account)|term deposit|sweep to|credit card (payment|repayment)|amex payment|payment to card)\b/, category: "transfer" },
  { pattern: /\b(drawings|director'?s? loan|loan from director|capital contribution|share capital|shareholder loan|founder (loan|contribution)|safe note|seed round|investment received|investor funds)\b/, category: "owner_drawings" },

  // ── Cost of sales / processing fees (before the revenue payout rules) ──
  { pattern: /\b(stripe|paypal|square|tyro|pin payments|gocardless|shopify( payments)?|afterpay|zip) (fee|fees|charges?)\b/, category: "cost_of_sales" },
  { pattern: /\b(merchant (service )?fee|eftpos fee|card acceptance fee)\b/, category: "cost_of_sales" },
  { pattern: /\b(auspost|australia post|sendle|shippit|startrack|dhl|fedex|tnt express|couriers please|aramex)\b/, category: "cost_of_sales" },

  // ── Revenue (money in) ──
  { pattern: /\b(stripe|paypal|square|tyro|pin payments|gocardless|shopify|afterpay|braintree|ezidebit)\b/, category: "revenue", sign: "in" },
  { pattern: /\b(payout|settlement|invoice (paid|payment)|inv(oice)? ?#?\d|payment received|customer payment|sales)\b/, category: "revenue", sign: "in" },

  // ── Government money in / ATO ──
  { pattern: /\b(ausindustry|department of industry|accelerating commercialisation|export market development|emdg|austrade|launchvic|jobs (and|&) skills|grant|r&d tax (offset|incentive) refund|innovation connections)\b/, category: "government_grants", sign: "in" },
  { pattern: /\b(ato|australian taxation office|taxation office)\b.*\b(payg ?w|payg withholding|withholding)\b/, category: "salaries_wages", sign: "out" },
  { pattern: /\b(ato|australian taxation office|taxation office)\b/, category: "government_grants", sign: "in" },
  { pattern: /\b(ato|australian taxation office|taxation office)\b/, category: "other", sign: "out", review: true },

  // ── Payroll & super ──
  { pattern: /\b(australiansuper|australian super|rest super|hostplus|sunsuper|aware super|cbus|hesta|unisuper|beam super|superchoice|quicksuper|super clearing|clearing house|smsf|superannuation|\bsuper\b)/, category: "superannuation", sign: "out" },
  { pattern: /\b(payroll|pay run|salary|salaries|wages?|keypay|employment hero|payg ?w)\b/, category: "salaries_wages", sign: "out" },

  // ── Cloud & hosting / AI usage ──
  { pattern: /\b(aws|amazon web services|amzn web|google cloud|gcp|microsoft azure|azure|vercel|cloudflare|digitalocean|digital ocean|heroku|linode|netlify|supabase|render\.com|fly\.io|hetzner|ovh)\b/, category: "cloud_hosting" },
  { pattern: /\b(openai|anthropic|claude\.ai|google ai|twilio|sendgrid|mailgun|postmark|godaddy|namecheap|crazy domains|ventraip|domain (renewal|registration)|auda)\b/, category: "cloud_hosting" },

  // ── Software subscriptions ──
  { pattern: /\b(xero|myob|quickbooks|slack|notion|atlassian|jira|confluence|github|gitlab|figma|canva|adobe|google workspace|gsuite|g suite|google (storage|one)|microsoft 365|office 365|zoom|hubspot|salesforce|intercom|mailchimp|dropbox|1password|lastpass|linkedin premium|zapier|calendly|docusign|loom|miro|asana|monday\.com|clickup|airtable|webflow|squarespace|wix|chatgpt|deputy|tanda|lucidchart|grammarly|apple\.com\/bill|itunes|google play)\b/, category: "software_subscriptions" },

  // ── Marketing ──
  { pattern: /\b(google ads|googleads|adwords|facebk|facebook|meta ads|meta platforms|instagram|linkedin ads|linkedin|tiktok|twitter|x corp|eventbrite|sponsorship|99designs|semrush|ahrefs|hootsuite|buffer)\b/, category: "marketing_advertising" },

  // ── Contractors ──
  { pattern: /\b(upwork|fiverr|freelancer\.com|toptal|contractor|consultant|agency invoice|expert360|airtasker)\b/, category: "contractors", sign: "out" },

  // ── Professional fees ──
  { pattern: /\b(asic|accountant|accounting|bookkeep\w*|lawyer|legal|solicitor|lawpath|sprintlaw|legalvision|ip australia|trade ?mark|auditor|registered agent|company secretary|notary|abn lookup)\b/, category: "professional_fees" },

  // ── Insurance ──
  { pattern: /\b(insurance|bizcover|allianz|qbe|aami|nrma|suncorp|youi|icare|worksafe|workcover|cgu|hiscox|upcover|coverwallet)\b/, category: "insurance" },

  // ── Interest & loans ──
  { pattern: /\b(interest|loan repayment|repayment|prospa|moula|lumi|bizcap|overdraft)\b/, category: "interest" },

  // ── Bank fees ──
  { pattern: /\b(account ?keeping|account fee|monthly fee|bank fee|service fee|fx fee|foreign (currency|transaction) fee|international transaction fee|overseas transaction fee|dishonour fee|overdrawn fee|card fee|atm fee|osko fee)\b/, category: "bank_fees" },

  // ── Meals (before travel: "uber eats" before "uber") ──
  { pattern: /\b(uber ?eats|menulog|doordash|deliveroo|cafe|caf[eé]|coffee|restaurant|mcdonald|hungry jack|kfc|domino'?s|guzman|grill'?d|starbucks|gloria jean|bistro|sushi|pizza|thai|bakery|bar\b|pub\b|hotel bar|woolworths|coles|aldi|iga\b|7-?eleven|catering)/, category: "meals_entertainment" },

  // ── Travel ──
  { pattern: /\b(qantas|virgin australia|jetstar|rex airlines|uber|didi|ola\b|13 ?cabs|taxi|cabcharge|airbnb|booking\.com|expedia|wotif|hilton|marriott|accor|ibis|hotel|opal|myki|translink|linkt|e-?toll|transurban|wilson parking|secure parking|parking|bp\b|caltex|ampol|shell\b|fuel)\b/, category: "travel" },

  // ── Rent & occupancy (incl. utilities + telco) ──
  { pattern: /\b(rent|lease|wework|regus|hub australia|fishburners|stone & chalk|body corporate|strata|outgoings|agl|origin energy|energyaustralia|energy australia|sydney water|telstra|optus|vodafone|tpg|aussie broadband|nbn|electricity|gas bill)\b/, category: "rent", sign: "out" },

  // ── Equipment ──
  { pattern: /\b(apple store|jb hi-?fi|officeworks|harvey norman|dell|lenovo|mwave|scorptec|pccasegear|umart|bunnings|ikea|kogan|amazon(\.com)?\.au|amazon au|amzn mktp)\b/, category: "equipment", sign: "out" },

  // ── R&D ──
  { pattern: /\b(r&d|research (and|&) development|csiro|prototype|clinical trial)\b/, category: "r_and_d", sign: "out" },

  // ── Generic transfer wording last (a "transfer from Stripe" was caught above) ──
  { pattern: /\b(transfer|tfr|savings|top ?up)\b/, category: "transfer" },
];

function signOk(rule: MerchantRule, amount: number): boolean {
  const s = rule.sign ?? "any";
  if (s === "in") return amount > 0;
  if (s === "out") return amount < 0;
  return true;
}

/** First built-in rule that matches the narration with the right sign. */
export function matchMerchantRule(description: string, amountAud: number): MerchantRule | null {
  const text = (description ?? "").toLowerCase().replace(/\s+/g, " ");
  for (const rule of MERCHANT_RULES) {
    if (rule.pattern.test(text) && signOk(rule, amountAud)) return rule;
  }
  return null;
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export function decision(
  row: CategoriseInput,
  category: ExpenseCategory,
  source: CategorySource | null,
  confidence: number,
  needsReview: boolean,
): CategoriseDecision {
  return {
    id: row.id,
    category,
    source,
    confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 1000) / 1000,
    needsReview,
    counterparty: merchantKey(row.description),
    gstTreatment: gstDefaultFor(category),
  };
}

export function undecided(row: CategoriseInput): CategoriseDecision {
  return decision(row, "other", null, 0, true);
}

export interface RulesOptions {
  /** merchantKey → category, from expense_rules (0378). */
  learned?: ReadonlyMap<string, ExpenseCategory> | Record<string, ExpenseCategory>;
}

function learnedLookup(learned: RulesOptions["learned"]): (key: string) => ExpenseCategory | undefined {
  if (!learned) return () => undefined;
  if (learned instanceof Map) return (k) => learned.get(k);
  const rec = learned as Record<string, ExpenseCategory>;
  return (k) => (Object.prototype.hasOwnProperty.call(rec, k) ? rec[k] : undefined);
}

/**
 * Recurring-pattern detection over one batch: merchants (by key) with ≥ 3
 * money-OUT lines in ≥ 3 distinct months whose amounts sit within ±10 % of
 * their mean and stay under RECURRING_MAX_AUD. Returns the keys.
 */
export function detectRecurringMerchants(rows: readonly CategoriseInput[]): Set<string> {
  const groups = new Map<string, CategoriseInput[]>();
  for (const r of rows) {
    if (!(r.amountAud < 0)) continue;
    const key = merchantKey(r.description);
    if (key === "unknown") continue;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const out = new Set<string>();
  for (const [key, g] of groups) {
    if (g.length < 3) continue;
    const months = new Set(g.map((r) => r.occurredOn.slice(0, 7)));
    if (months.size < 3) continue;
    const abs = g.map((r) => Math.abs(r.amountAud));
    const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
    if (mean <= 0 || mean > RECURRING_MAX_AUD) continue;
    if (abs.some((v) => Math.abs(v - mean) > mean * 0.1)) continue;
    out.add(key);
  }
  return out;
}

export interface RulesResult {
  decided: CategoriseDecision[];
  /** Rows no rule could place — the model's queue. */
  remaining: CategoriseInput[];
}

/** Rules layer only. Every input row appears in exactly one of the two lists. */
export function categoriseRows(rows: readonly CategoriseInput[], opts: RulesOptions = {}): RulesResult {
  const learned = learnedLookup(opts.learned);
  const recurring = detectRecurringMerchants(rows);
  const decided: CategoriseDecision[] = [];
  const remaining: CategoriseInput[] = [];
  for (const row of rows) {
    const key = merchantKey(row.description);
    const own = learned(key);
    if (own && isExpenseCategory(own)) {
      decided.push(decision(row, own, "rule", LEARNED_CONFIDENCE, false));
      continue;
    }
    const rule = matchMerchantRule(row.description, row.amountAud);
    if (rule) {
      decided.push(decision(row, rule.category, "rule", rule.confidence ?? RULE_CONFIDENCE, rule.review === true));
      continue;
    }
    if (recurring.has(key)) {
      decided.push(decision(row, "software_subscriptions", "rule", RECURRING_CONFIDENCE, false));
      continue;
    }
    remaining.push(row);
  }
  return { decided, remaining };
}

// ─── AI layer ────────────────────────────────────────────────────────────────

export type AiFn = (opts: { system: string; user: string }) => Promise<{ text: string }>;

export function aiSystemPrompt(): string {
  const lines = CATEGORIES.map((c) => `- ${c.key}: ${c.description}`);
  return [
    "You categorise bank-statement lines for an Australian startup's bookkeeping.",
    "Pick exactly ONE category key per line from this list (use the key, not the label):",
    ...lines,
    "Amounts are AUD and signed: negative = money out, positive = money in. Only money IN can be revenue or government_grants. Money moved between the business's own accounts is transfer; founder money is owner_drawings.",
    'Return ONLY a JSON array (no prose, no code fence). One element per input line, in the same order: { "i": <input index>, "category": <key>, "confidence": <0..1>, "counterparty": <short merchant name or null> }.',
    "confidence is how sure you are the key is right for THIS line. Use 0.3 or lower when the narration is a bare reference number or could be several things — the founder will review those by hand.",
    "Never invent a key outside the list.",
  ].join("\n");
}

export function aiUserPrompt(batch: readonly CategoriseInput[]): string {
  const lines = batch.map((r, i) => ({ i, date: r.occurredOn, amount: r.amountAud, description: r.description.slice(0, 160) }));
  return JSON.stringify(lines);
}

export interface AiAnswer {
  i: number;
  category: string;
  confidence: number;
  counterparty: string | null;
}

/** Strip a code fence and parse the array; null when the text is not a JSON array. */
export function parseAiAnswers(raw: string): AiAnswer[] | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: AiAnswer[] = [];
  for (const el of parsed) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const i = typeof o.i === "number" ? o.i : typeof o.i === "string" ? Number(o.i) : NaN;
    if (!Number.isInteger(i)) continue;
    const confidence = typeof o.confidence === "number" ? o.confidence : typeof o.confidence === "string" ? Number(o.confidence) : NaN;
    out.push({
      i,
      category: typeof o.category === "string" ? o.category.trim().toLowerCase() : "",
      confidence: Number.isFinite(confidence) ? confidence : 0,
      counterparty: typeof o.counterparty === "string" && o.counterparty.trim() ? o.counterparty.trim().slice(0, 80) : null,
    });
  }
  return out;
}

/**
 * Accept a model answer for `row` or fall back to `other` + review. Rejects:
 * a key outside the enum, confidence below MIN_AI_CONFIDENCE (or > 1 / NaN),
 * and a sign clash (income category on money out).
 */
export function acceptAiAnswer(row: CategoriseInput, answer: AiAnswer | undefined): CategoriseDecision {
  if (!answer) return decision(row, "other", "ai", 0, true);
  const cat = answer.category;
  if (!isExpenseCategory(cat)) return decision(row, "other", "ai", 0, true);
  const conf = answer.confidence;
  if (!(conf >= MIN_AI_CONFIDENCE && conf <= 1)) return decision(row, "other", "ai", Math.max(0, Math.min(conf, 1)) || 0, true);
  if (categoryKind(cat) === "income" && row.amountAud < 0) return decision(row, "other", "ai", 0, true);
  // `counterparty` stays the deterministic merchantKey (the learned-rule key);
  // the model's free-text merchant name is not stored.
  return decision(row, cat, "ai", conf, cat === "other");
}

export interface AiOptions {
  ai: AiFn;
  batchSize?: number;
}

export interface AiResult {
  decisions: CategoriseDecision[];
  batches: number;
  /**
   * Batches whose call threw or whose answer could not be parsed. S29-hardening
   * (S28 review #6): their rows stay UNDECIDED (`source: null`, review) —
   * the model never looked at them, so they are not "AI-categorised", keep
   * their place in the queue and are refunded pro rata by the route.
   */
  failedBatches: number;
  /** Rows inside the failed batches. */
  failedRows: number;
}

/** Model layer: `rows` in batches of ≤ MAX_AI_BATCH; a failed call never throws — its rows stay undecided (queued). */
export async function categoriseWithAi(rows: readonly CategoriseInput[], opts: AiOptions): Promise<AiResult> {
  const size = Math.max(1, Math.min(MAX_AI_BATCH, opts.batchSize ?? MAX_AI_BATCH));
  const decisions: CategoriseDecision[] = [];
  let batches = 0;
  let failedBatches = 0;
  let failedRows = 0;
  const system = aiSystemPrompt();
  for (let at = 0; at < rows.length; at += size) {
    const batch = rows.slice(at, at + size);
    batches++;
    let answers: AiAnswer[] | null = null;
    try {
      const res = await opts.ai({ system, user: aiUserPrompt(batch) });
      answers = parseAiAnswers(res.text);
    } catch {
      answers = null;
    }
    if (!answers) {
      failedBatches++;
      failedRows += batch.length;
      for (const row of batch) decisions.push(undecided(row));
      continue;
    }
    const byIndex = new Map<number, AiAnswer>();
    for (const a of answers) if (!byIndex.has(a.i)) byIndex.set(a.i, a);
    batch.forEach((row, i) => decisions.push(acceptAiAnswer(row, byIndex.get(i))));
  }
  return { decisions, batches, failedBatches, failedRows };
}

export interface BatchOptions extends RulesOptions {
  ai?: AiFn;
  batchSize?: number;
}

export interface BatchResult {
  decisions: CategoriseDecision[];
  ruleCount: number;
  aiCount: number;
  batches: number;
  failedBatches: number;
}

/** Rules, then the model on whatever is left (skipped when no `ai` is given — those rows stay undecided). */
export async function categoriseBatch(rows: readonly CategoriseInput[], opts: BatchOptions = {}): Promise<BatchResult> {
  const rules = categoriseRows(rows, opts);
  if (!opts.ai || rules.remaining.length === 0) {
    return {
      decisions: [...rules.decided, ...rules.remaining.map(undecided)],
      ruleCount: rules.decided.length,
      aiCount: 0,
      batches: 0,
      failedBatches: 0,
    };
  }
  const ai = await categoriseWithAi(rules.remaining, { ai: opts.ai, batchSize: opts.batchSize });
  return {
    decisions: [...rules.decided, ...ai.decisions],
    ruleCount: rules.decided.length,
    aiCount: ai.decisions.length,
    batches: ai.batches,
    failedBatches: ai.failedBatches,
  };
}

/** Default model call — the same `callAI` the CFO agent uses (dynamic import keeps this module test-light). */
export async function defaultAi(opts: { system: string; user: string }): Promise<{ text: string }> {
  const { callAI } = await import("@/lib/ai-client");
  const r = await callAI({ system: opts.system, user: opts.user, maxTokens: 2500, temperature: 0, timeoutMs: 90_000, agentId: "cfo" });
  return { text: r.text };
}

export const ALL_CATEGORY_KEYS = CATEGORY_KEYS;
