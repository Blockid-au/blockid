// G14-S38 — the scope catalogue is the contract between POST /api/keys, the
// settings pills and the v1 evaluator routes. Pins: the three names, the
// default, write ⇒ read, unknown scopes refused (never dropped), evaluator-
// only scopes refused for a founder account, normalisation keeps `analyze`.
import { describe, expect, it } from "vitest";
import { API_SCOPES, API_SCOPE_LABELS, DEFAULT_KEY_SCOPES, hasScope, isApiScope, normaliseScopes, parseScopesInput } from "./api-scopes";

describe("api-scopes", () => {
  it("catalogue = analyze · evaluations:read · evaluations:write, each labelled", () => {
    expect([...API_SCOPES]).toEqual(["analyze", "evaluations:read", "evaluations:write"]);
    for (const s of API_SCOPES) expect(API_SCOPE_LABELS[s].label).toBeTruthy();
    expect([...DEFAULT_KEY_SCOPES]).toEqual(["analyze"]);
    expect(isApiScope("evaluations:read")).toBe(true);
    expect(isApiScope("admin")).toBe(false);
  });

  it("hasScope: exact match, write implies read, nothing else implied", () => {
    expect(hasScope(["analyze"], "analyze")).toBe(true);
    expect(hasScope(["analyze"], "evaluations:read")).toBe(false);
    expect(hasScope(["evaluations:write"], "evaluations:read")).toBe(true);
    expect(hasScope(["evaluations:read"], "evaluations:write")).toBe(false);
    expect(hasScope(null, "analyze")).toBe(false);
  });

  it("normaliseScopes: catalogue order, unknown dropped, analyze always kept", () => {
    expect(normaliseScopes(["evaluations:write", "bogus", "evaluations:read"])).toEqual(["analyze", "evaluations:read", "evaluations:write"]);
    expect(normaliseScopes(null)).toEqual(["analyze"]);
  });

  it("parseScopesInput: absent → default; unknown → refused; evaluator-only needs an evaluator account", () => {
    expect(parseScopesInput(undefined, { evaluator: false })).toEqual({ ok: true, scopes: ["analyze"] });
    expect(parseScopesInput("x", { evaluator: true })).toEqual({ ok: false, error: "invalid_scopes" });
    expect(parseScopesInput(["nope"], { evaluator: true })).toEqual({ ok: false, error: "unknown_scope", detail: "nope" });
    expect(parseScopesInput(["evaluations:read"], { evaluator: false })).toEqual({ ok: false, error: "evaluator_scope_requires_evaluator_account", detail: "evaluations:read" });
    expect(parseScopesInput(["evaluations:write"], { evaluator: true })).toEqual({ ok: true, scopes: ["analyze", "evaluations:write"] });
  });
});
