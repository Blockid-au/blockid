// G21 P0-D — FI envelope + hooks (pure decisions; trackEvent is mocked).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn(async () => ({ ok: true })) }));
vi.mock("./events", async () => {
  const actual = await vi.importActual<typeof import("./events")>("./events");
  return { ...actual, trackEvent: trackEventMock };
});

import { FI_EVENT_ALIASES, FI_EVENT_CATALOGUE, FI_NATIVE_EVENTS, canonicalFiEvent } from "./events";
import {
  emitDeckUploaded,
  emitEvidenceAdded,
  emitEvidenceVerified,
  emitFiEvent,
  emitScoreRecalculated,
  emitWebsiteImported,
  evidenceAddedEnvelope,
  evidenceVerifiedEnvelope,
  normaliseFiEnvelope,
  onInvoicePaid,
  onPilotStarted,
  scoreRecalculatedEnvelope,
} from "./fi-events";

beforeEach(() => trackEventMock.mockClear());

describe("FI catalogue", () => {
  it("has 18 names: 10 aliases onto existing events + 8 native events, no overlap", () => {
    expect(FI_EVENT_CATALOGUE).toHaveLength(18);
    expect(Object.keys(FI_EVENT_ALIASES)).toHaveLength(10);
    expect(FI_NATIVE_EVENTS).toHaveLength(8);
    for (const a of Object.keys(FI_EVENT_ALIASES)) expect(FI_NATIVE_EVENTS as readonly string[]).not.toContain(a);
    for (const n of FI_EVENT_CATALOGUE) expect(typeof canonicalFiEvent(n)).toBe("string");
    expect(canonicalFiEvent("report_opened")).toBe("report_view");
    expect(canonicalFiEvent("payment_completed")).toBe("checkout_completed");
    expect(canonicalFiEvent("subscription_started")).toBe("subscription_created");
    expect(canonicalFiEvent("pilot_started")).toBe("pilot_started");
  });
});

describe("normaliseFiEnvelope", () => {
  it("keeps event params, mirrors startup → project_id, stamps fi_ts, tags aliases with fi_event, drops empties + reserved keys", () => {
    const now = new Date("2026-09-20T10:00:00.000Z");
    const p = normaliseFiEnvelope("report_opened", { startup: "proj-1", organisation: "org-9", plan: "accelerator_starter", channel: "", tier: "paid", email: "x@blockid.au", userId: "u1" }, now);
    expect(p).toEqual({ tier: "paid", organisation: "org-9", startup: "proj-1", project_id: "proj-1", plan: "accelerator_starter", fi_ts: "2026-09-20T10:00:00.000Z", fi_event: "report_opened" });
  });

  it("respects an explicit project_id, parses a supplied ts, derives qa from a qa-live e-mail, and does not tag native events", () => {
    const p = normaliseFiEnvelope("batch_scored", { startup: "proj-1", project_id: "explicit", ts: "2026-09-19T00:00:00Z", email: "qa-live-20260920-1200@blockid.au", batch_id: "b1", items: 3, failed: 0 });
    expect(p.project_id).toBe("explicit");
    expect(p.fi_ts).toBe("2026-09-19T00:00:00.000Z");
    expect(p.qa).toBe(true);
    expect(p.fi_event).toBeUndefined();
    expect(p.items).toBe(3);
  });
});

describe("emitFiEvent", () => {
  it("stores an alias under its canonical name with the envelope and the tracker options", () => {
    emitFiEvent("startup_created", { startup: "proj-2", channel: "intake_link", userId: "u2", sessionId: "s2", eventId: "e2", source: "server" });
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    const [name, params, opts] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>, Record<string, unknown>];
    expect(name).toBe("svi_analyze");
    expect(params.fi_event).toBe("startup_created");
    expect(params.project_id).toBe("proj-2");
    expect(params.channel).toBe("intake_link");
    expect(opts).toMatchObject({ userId: "u2", sessionId: "s2", eventId: "e2", source: "server", consentGranted: true });
  });
});

describe("onInvoicePaid", () => {
  it("emits subscription_renewed only for renewal billing reasons and only with an invoice id", () => {
    expect(onInvoicePaid({ id: "in_1", billing_reason: "subscription_create", amount_paid: 7900 }, { id: "u1", plan: "investor_angel" })).toBe(false);
    expect(onInvoicePaid({ id: null, billing_reason: "subscription_cycle", amount_paid: 7900 }, { id: "u1" })).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
    expect(onInvoicePaid({ id: "in_2", billing_reason: "subscription_cycle", amount_paid: 7900 }, { id: "u1", email: "a@b.co", plan: "investor_angel" })).toBe(true);
    const [name, params, opts] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>, Record<string, unknown>];
    expect(name).toBe("subscription_renewed");
    expect(params).toMatchObject({ invoice_id: "in_2", billing_reason: "subscription_cycle", gross_aud_cents: 7900, user_id: "u1", organisation: "u1", plan: "investor_angel", channel: "webhook:stripe" });
    expect(params.email).toBeUndefined();
    expect(opts).toMatchObject({ userId: "u1", source: "webhook:stripe" });
  });
});

describe("onPilotStarted / emitWebsiteImported / emitDeckUploaded", () => {
  it("pilot_started carries sku, cap, amount, source and the envelope", () => {
    onPilotStarted({ id: "p1", sku: "cohort_pilot_25", applicantsCap: 25, amountCents: 150000, source: "paid", userId: "u3", projectId: "proj-3", plan: "accelerator_starter" });
    const [name, params] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("pilot_started");
    expect(params).toMatchObject({ pilot_id: "p1", sku: "cohort_pilot_25", applicants_cap: 25, amount_cents: 150000, pilot_source: "paid", organisation: "u3", startup: "proj-3", project_id: "proj-3", channel: "checkout:pilot" });
  });

  it("website_imported keeps only the host; deck_uploaded aliases onto evidence_upload as a pitch_deck", () => {
    emitWebsiteImported({ userId: null, sessionId: "anon-1", analysisId: "a1", channel: "intake", url: "acme.com.au/about?x=1" });
    emitDeckUploaded({ userId: "u4", analysisId: "a2", channel: "intake", sizeBytes: 1234.7, mimeType: "application/pdf" });
    const [n1, p1] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    const [n2, p2] = trackEventMock.mock.calls[1] as unknown as [string, Record<string, unknown>];
    expect(n1).toBe("website_imported");
    expect(p1).toMatchObject({ url_host: "acme.com.au", analysis_id: "a1", startup: "a1", project_id: "a1", channel: "intake" });
    expect(JSON.stringify(p1)).not.toContain("?x=1");
    expect(n2).toBe("evidence_upload");
    expect(p2).toMatchObject({ evidence_kind: "pitch_deck", size_bytes: 1234, mime_type: "application/pdf", fi_event: "deck_uploaded", project_id: "a2" });
  });
});


describe("G21 P1-C evidence / score envelopes (pure)", () => {
  it("evidence_added: alias onto evidence_upload with organisation = owner, startup = project, plan + channel", () => {
    const env = evidenceAddedEnvelope({ ownerUserId: "owner-1", actorUserId: "editor-2", email: "e@x.io", plan: "founder_growth", projectId: "proj-1", channel: "workspace", evidenceId: "ev-1", dimension: "tre", evidenceType: "revenue_proof", confidenceLevel: "document_uploaded" });
    expect(env).toMatchObject({ evidence_id: "ev-1", dimension: "tre", evidence_type: "revenue_proof", confidence_level: "document_uploaded", organisation: "owner-1", startup: "proj-1", plan: "founder_growth", channel: "workspace", userId: "editor-2", email: "e@x.io" });
    emitEvidenceAdded({ ownerUserId: "owner-1", projectId: "proj-1", channel: "vault", dimension: null, evidenceType: "x", confidenceLevel: "self_declared" });
    const [name, params, opts] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>, Record<string, unknown>];
    expect(name).toBe("evidence_upload");
    expect(params).toMatchObject({ fi_event: "evidence_added", dimension: "general", organisation: "owner-1", startup: "proj-1", project_id: "proj-1", channel: "vault" });
    expect(opts.userId).toBe("owner-1");
  });

  it("evidence_verified: native name, reviewer + level, actor defaults to the reviewer", () => {
    const env = evidenceVerifiedEnvelope({ ownerUserId: "owner-1", projectId: "proj-1", channel: "admin_review", evidenceId: "ev-1", level: "third_party_verified", reviewerId: "admin-1", dimension: "tre", evidenceType: "revenue_proof" });
    expect(env).toEqual({ evidence_id: "ev-1", level: "third_party_verified", reviewer_id: "admin-1", dimension: "tre", evidence_type: "revenue_proof", project_id: "proj-1", organisation: "owner-1", startup: "proj-1", plan: null, channel: "admin_review", userId: "admin-1", email: null });
    emitEvidenceVerified({ ownerUserId: "owner-1", projectId: "proj-1", channel: "admin_review", evidenceId: "ev-1", level: "third_party_verified" });
    const [name, params] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("evidence_verified");
    expect(params.fi_event).toBeUndefined();
    expect(params.fi_ts).toBeTruthy();
  });

  it("score_recalculated: requires a project; carries reason, score, delta, stage, version", () => {
    expect(scoreRecalculatedEnvelope({ ownerUserId: "o", projectId: null, channel: "cron", reason: "evidence", score: 70 })).toBeNull();
    expect(emitScoreRecalculated({ ownerUserId: "o", projectId: null, channel: "cron", reason: "evidence", score: 70 })).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalled();
    const env = scoreRecalculatedEnvelope({ ownerUserId: "owner-1", plan: "free", projectId: "proj-1", channel: "connector", reason: "evidence", score: 72, previousScore: 64, stage: 2, sviVersion: "2.3.0" });
    expect(env).toEqual({ project_id: "proj-1", reason: "evidence", score: 72, delta: 8, stage: 2, svi_version: "2.3.0", organisation: "owner-1", startup: "proj-1", plan: "free", channel: "connector", userId: "owner-1", email: null });
    expect(emitScoreRecalculated({ ownerUserId: "owner-1", projectId: "proj-1", channel: "workspace", reason: "manual", score: 72 })).toBe(true);
    const [name, params] = trackEventMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("score_recalculated");
    expect(params).toMatchObject({ reason: "manual", score: 72, organisation: "owner-1", startup: "proj-1", channel: "workspace" });
  });
});
