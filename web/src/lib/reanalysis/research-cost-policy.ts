import { z } from "zod";

const id = z.string().min(1).max(200).refine(v => v === v.trim());
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const stamp = z.string().datetime();
const freshnessMs = 5 * 60_000;
const fresh = (observedAt: string, now: number) => Number.isFinite(now) && Date.parse(observedAt) <= now && now - Date.parse(observedAt) <= freshnessMs;
const active = (observedAt: string, expiresAt: string, now: number) => fresh(observedAt, now) && Date.parse(expiresAt) > now;
const taskSchema = z.object({ id, capabilities: z.array(id).min(1).max(32), minimumQuality: z.number().min(0).max(1), maximumTokens: count.refine(n => n > 0) }).strict();
const candidateSchema = z.object({
  id, provider: id, status: z.literal("healthy"), observedAt: stamp, expiresAt: stamp,
  fit: z.object({ taskId: id, capabilities: z.array(id).max(32), quality: z.number().min(0).max(1), verified: z.literal(true) }).strict(),
  entitlement: z.object({ kind: z.enum(["verified_free", "paid"]), verified: z.literal(true), remainingRequests: count, remainingTokens: count }).strict(),
}).strict();
const grantSchema = z.object({
  id, taskId: id, modelId: id, canSpend: z.literal(true), observedAt: stamp, expiresAt: stamp,
  currency: z.literal("USD"), budgetMicroUnits: count,
  quote: z.object({ id, grantId: id, taskId: id, modelId: id, maximumTokens: count, costMicroUnits: count, expiresAt: stamp }).strict(),
}).strict();
export type ResearchModelTask = z.infer<typeof taskSchema>;
export type ResearchModelCandidate = z.infer<typeof candidateSchema>;
export type ResearchPaidGrant = z.infer<typeof grantSchema>;

/** Pure server admission only. Inputs must come from trusted verification/quota readers, not request JSON. */
export function selectResearchModel(taskInput: unknown, candidates: unknown, paidGrant?: unknown, now = Date.now()) {
  const deny = (reason: string) => ({ ok: false as const, executionAllowed: false as const, reason });
  const task = taskSchema.safeParse(taskInput);
  if (!task.success || !Array.isArray(candidates) || candidates.length > 64 || !Number.isFinite(now)) return deny("invalid_policy_input");
  const eligible = candidates.flatMap(value => {
    const parsed = candidateSchema.safeParse(value);
    if (!parsed.success) return [];
    const c = parsed.data;
    return active(c.observedAt, c.expiresAt, now) && c.fit.taskId === task.data.id && c.fit.quality >= task.data.minimumQuality && task.data.capabilities.every(cap => c.fit.capabilities.includes(cap)) && c.entitlement.remainingRequests >= 1 && c.entitlement.remainingTokens >= task.data.maximumTokens ? [c] : [];
  });
  // Conflicting duplicate model identity cannot be resolved by array order.
  if (new Set(eligible.map(c => c.id)).size !== eligible.length) return deny("ambiguous_model_identity");
  eligible.sort((a, b) => b.fit.quality - a.fit.quality || a.id.localeCompare(b.id));
  const free = eligible.find(c => c.entitlement.kind === "verified_free");
  const admit = (c: ResearchModelCandidate, costMicroUnits: number, quoteId: string | null) => ({ ok: true as const, executionAllowed: false as const, requiredNext: "atomic_quota_and_budget_reservation" as const, modelId: c.id, provider: c.provider, taskId: task.data.id, maximumTokens: task.data.maximumTokens, costMicroUnits, currency: "USD" as const, quoteId, customerCreditConsent: false as const });
  if (free) return admit(free, 0, null);
  // No grant means a zero paid budget. UID/session access is not a spend grant.
  const grant = grantSchema.safeParse(paidGrant);
  if (!grant.success) return deny("no_suitable_free_model_or_paid_grant");
  const g = grant.data, q = g.quote;
  const paid = eligible.find(c => c.id === g.modelId && c.entitlement.kind === "paid");
  if (!paid || !active(g.observedAt, g.expiresAt, now) || g.taskId !== task.data.id || q.grantId !== g.id || q.taskId !== task.data.id || q.modelId !== paid.id || q.maximumTokens < task.data.maximumTokens || q.costMicroUnits <= 0 || q.costMicroUnits > g.budgetMicroUnits || Date.parse(q.expiresAt) <= now) return deny("paid_authorization_unavailable");
  return admit(paid, q.costMicroUnits, q.id);
}

export const BRAVE_FREE_QUERY_CAPS = Object.freeze({ question: 3, batch: 6, day: 30, month: 900 });
const braveRequestSchema = z.object({ questionId: id, batchId: id, queries: count.refine(n => n > 0) }).strict();
const braveBudgetSchema = z.object({
  provider: z.literal("brave"), accountId: id, observedAt: stamp, expiresAt: stamp,
  providerPolicyConfirmed: z.literal(true),
  paid: z.object({ ownerPolicyId: id, currency: z.literal("USD"), monthlyCapMicroUsd: count.max(5_000_000), committedMicroUsd: count, reservedMicroUsd: count, pricePerQueryMicroUsd: count.refine(n => n > 0), quoteExpiresAt: stamp }).strict().optional(),
  questionId: id, batchId: id, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), month: z.string().regex(/^\d{4}-\d{2}$/),
  used: z.object({ question: count, batch: count, day: count, month: count }).strict(),
  remainingFreeQueries: count.nullable(),
}).strict();
export type BraveResearchBudget = z.infer<typeof braveBudgetSchema>;
/** No API request, output retention, counter mutation or reservation occurs here. */
export function admitBraveResearch(requestInput: unknown, authoritativeBudget: unknown, now = Date.now()) {
  const deny = (reason: string) => ({ ok: false as const, executionAllowed: false as const, reason });
  const request = braveRequestSchema.safeParse(requestInput), budget = braveBudgetSchema.safeParse(authoritativeBudget);
  if (!request.success || !budget.success || !Number.isFinite(now)) return deny("brave_budget_unavailable");
  const r = request.data, b = budget.data;
  if (!active(b.observedAt, b.expiresAt, now)) return deny("brave_budget_stale");
  const day = new Date(now).toISOString().slice(0, 10);
  if (b.questionId !== r.questionId || b.batchId !== r.batchId || b.day !== day || b.month !== day.slice(0, 7)) return deny("brave_budget_scope_mismatch");
  if (Object.entries(BRAVE_FREE_QUERY_CAPS).some(([key, cap]) => b.used[key as keyof typeof BRAVE_FREE_QUERY_CAPS] > cap - r.queries)) return deny("brave_query_limit");
  const freeQueries = Math.min(b.remainingFreeQueries ?? 0, r.queries);
  const paidQueries = r.queries - freeQueries;
  let costMicroUsd = 0;
  if (paidQueries > 0) {
    const p = b.paid;
    if (!p || Date.parse(p.quoteExpiresAt) <= now) return deny("brave_paid_policy_unavailable");
    costMicroUsd = paidQueries * p.pricePerQueryMicroUsd;
    if (!Number.isSafeInteger(costMicroUsd) || p.reservedMicroUsd > p.monthlyCapMicroUsd || p.committedMicroUsd > p.monthlyCapMicroUsd - p.reservedMicroUsd || costMicroUsd > p.monthlyCapMicroUsd - p.reservedMicroUsd - p.committedMicroUsd) return deny("brave_paid_budget_exhausted");
  }
  return { ok: true as const, executionAllowed: false as const, requiredNext: "atomic_quota_and_budget_reservation" as const, provider: "brave" as const, accountId: b.accountId, questionId: r.questionId, batchId: r.batchId, queries: r.queries, freeQueries, paidQueries, costMicroUsd, providerOwnerPolicyId: paidQueries ? b.paid!.ownerPolicyId : null, customerCreditConsent: false as const };
}
