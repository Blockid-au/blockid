import { expect, it } from "vitest";
import { selectResearchModel, admitBraveResearch, type ResearchModelCandidate, type ResearchPaidGrant, type BraveResearchBudget } from "./research-cost-policy";
const now = Date.parse("2026-09-22T12:00:00Z"), observedAt = new Date(now).toISOString(), expiresAt = new Date(now + 60000).toISOString();
const task = { id: "competitor-research", capabilities: ["cited-research"], minimumQuality: .8, maximumTokens: 1000 };
const candidate = (id = "free1"): ResearchModelCandidate => ({ id, provider: "fixture", status: "healthy", observedAt, expiresAt, fit: { taskId: task.id, capabilities: task.capabilities, quality: .9, verified: true }, entitlement: { kind: "verified_free", verified: true, remainingRequests: 1, remainingTokens: 1000 } });
const paid = (): ResearchModelCandidate => ({ ...candidate("paid1"), entitlement: { ...candidate().entitlement, kind: "paid" } });
const grant = (): ResearchPaidGrant => ({ id: "owner-policy", taskId: task.id, modelId: "paid1", canSpend: true, observedAt, expiresAt, currency: "USD", budgetMicroUnits: 100, quote: { id: "quote", grantId: "owner-policy", taskId: task.id, modelId: "paid1", maximumTokens: 1000, costMicroUnits: 10, expiresAt } });
const budget = (): BraveResearchBudget => ({ provider: "brave", accountId: "provider-account", observedAt, expiresAt, providerPolicyConfirmed: true, questionId: "question", batchId: "batch", day: "2026-09-22", month: "2026-09", used: { question: 0, batch: 0, day: 0, month: 0 }, remainingFreeQueries: 3 });
const request = { questionId: "question", batchId: "batch", queries: 3 };
it("chooses suitable free model before paid, by quality; never permits execution", () => {
  expect(selectResearchModel(task, [paid(), candidate()], grant(), now)).toMatchObject({ ok: true, modelId: "free1", costMicroUnits: 0, executionAllowed: false });
  expect(selectResearchModel(task, [candidate(), { ...candidate("better"), fit: { ...candidate().fit, quality: 1 } }], undefined, now)).toMatchObject({ modelId: "better" });
});
it("fails closed rather than downgrade missing capability, quality, verification, quota, health or freshness", () => {
  for (const change of [{ status: "unhealthy" }, { observedAt: new Date(now - 300001).toISOString() }, { observedAt: new Date(now + 1).toISOString() }, { expiresAt: observedAt }, { fit: { ...candidate().fit, verified: false } }, { fit: { ...candidate().fit, quality: .5 } }, { fit: { ...candidate().fit, capabilities: [] } }, { fit: { ...candidate().fit, taskId: "other" } }, { entitlement: { ...candidate().entitlement, verified: false } }, { entitlement: { ...candidate().entitlement, remainingTokens: 999 } }, { entitlement: { ...candidate().entitlement, remainingRequests: 0 } }]) expect(selectResearchModel(task, [{ ...candidate(), ...change }], undefined, now).ok).toBe(false);
});
it("defaults paid budget to zero and binds owner grant/quote/budget", () => {
  expect(selectResearchModel(task, [paid()], undefined, now).ok).toBe(false);
  expect(selectResearchModel(task, [paid()], grant(), now)).toMatchObject({ ok: true, costMicroUnits: 10, executionAllowed: false });
  for (const change of [{ budgetMicroUnits: 9 }, { canSpend: false }, { taskId: "other" }, { modelId: "other" }, { expiresAt: observedAt }, { quote: { ...grant().quote, grantId: "other" } }, { quote: { ...grant().quote, maximumTokens: 999 } }, { quote: { ...grant().quote, expiresAt: observedAt } }]) expect(selectResearchModel(task, [paid()], { ...grant(), ...change }, now).ok).toBe(false);
});
it("bounds model inputs and rejects ambiguous identity", () => {
  expect(selectResearchModel(task, Array(65).fill(candidate()), undefined, now).ok).toBe(false);
  expect(selectResearchModel(task, [candidate(), candidate()], undefined, now).ok).toBe(false);
  expect(selectResearchModel({ ...task, capabilities: [] }, [], undefined, now).ok).toBe(false);
});
it("Brave uses authoritative free allowance first without charging customer credits", () => {
  expect(admitBraveResearch(request, budget(), now)).toMatchObject({ ok: true, freeQueries: 3, paidQueries: 0, costMicroUsd: 0, executionAllowed: false, customerCreditConsent: false });
});
it("Brave enforces question/batch/day/month caps including existing consumption", () => {
  for (const [key, used] of [["question", 1], ["batch", 4], ["day", 28], ["month", 898]] as const) expect(admitBraveResearch(request, { ...budget(), used: { ...budget().used, [key]: used } }, now)).toMatchObject({ reason: "brave_query_limit" });
  expect(admitBraveResearch({ ...request, queries: 4 }, budget(), now).ok).toBe(false);
});
it("Brave rejects missing policy, stale snapshot and wrong scope or UTC period", () => {
  for (const change of [{ providerPolicyConfirmed: false }, { observedAt: new Date(now - 300001).toISOString() }, { observedAt: new Date(now + 1).toISOString() }, { expiresAt: observedAt }, { questionId: "other" }, { batchId: "other" }, { day: "2026-09-21" }, { month: "2026-08" }]) expect(admitBraveResearch(request, { ...budget(), ...change }, now).ok).toBe(false);
});
const paidPolicy = { ownerPolicyId: "founder-policy", currency: "USD" as const, monthlyCapMicroUsd: 5000000, committedMicroUsd: 0, reservedMicroUsd: 0, pricePerQueryMicroUsd: 5000, quoteExpiresAt: expiresAt };
it("Brave automatically admits paid remainder only under configured owner policy", () => {
  expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: 1 }, now)).toMatchObject({ reason: "brave_paid_policy_unavailable" });
  expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: 1, paid: paidPolicy }, now)).toMatchObject({ ok: true, freeQueries: 1, paidQueries: 2, costMicroUsd: 10000, providerOwnerPolicyId: "founder-policy", customerCreditConsent: false, executionAllowed: false });
});
it("Brave stops at $5 paid monthly cap accounting for reservations, with no free-credit offset", () => {
  for (const change of [{ monthlyCapMicroUsd: 5000001 }, { monthlyCapMicroUsd: 0 }, { committedMicroUsd: 4990001 }, { reservedMicroUsd: 4990001 }, { committedMicroUsd: 3000000, reservedMicroUsd: 1990001 }, { quoteExpiresAt: observedAt }]) expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: 1, paid: { ...paidPolicy, ...change } }, now).ok).toBe(false);
  expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: 1, paid: { ...paidPolicy, committedMicroUsd: 4990000 } }, now).ok).toBe(true);
});

it("unknown free allowance reserves full provider list price without inventing credits", () => {
  expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: null, paid: paidPolicy }, now)).toMatchObject({ ok: true, freeQueries: 0, paidQueries: 3, costMicroUsd: 15000 });
  expect(admitBraveResearch(request, { ...budget(), remainingFreeQueries: null }, now).ok).toBe(false);
});
