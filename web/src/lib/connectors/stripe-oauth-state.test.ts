import { describe, expect, it } from "vitest";
import { createStripeOAuthState, verifyStripeOAuthState } from "./stripe-oauth-state";

const env = { OAUTH_TOKEN_ENCRYPTION_KEY: "test-only-state-key" };
const scope = { userId: "member", projectId: "project-a", ownerUserId: "owner-a" };
describe("Stripe OAuth scope binding", () => {
  it("binds encrypted cookie to random challenge, principal, project and owner", () => {
    const grant = createStripeOAuthState(scope, 1000, env);
    expect(grant.state).toHaveLength(32);
    expect(grant.cookie).not.toContain(scope.projectId);
    expect(verifyStripeOAuthState(grant.cookie, grant.state, scope, 2000, env)).toBe(true);
    for (const changed of [{ ...scope, userId: "other" }, { ...scope, projectId: "project-b" }, { ...scope, ownerUserId: "new-owner" }, { ...scope, projectId: null }]) {
      expect(verifyStripeOAuthState(grant.cookie, grant.state, changed, 2000, env)).toBe(false);
    }
  });
  it("rejects altered cookie, challenge, key, legacy plaintext and expired/future grants", () => {
    const grant = createStripeOAuthState(scope, 1000, env);
    expect(verifyStripeOAuthState(grant.cookie + "x", grant.state, scope, 2000, env)).toBe(false);
    expect(verifyStripeOAuthState(grant.cookie, "x".repeat(32), scope, 2000, env)).toBe(false);
    expect(verifyStripeOAuthState(grant.cookie, grant.state, scope, 2000, { OAUTH_TOKEN_ENCRYPTION_KEY: "different-test-key" })).toBe(false);
    expect(verifyStripeOAuthState(grant.state, grant.state, scope, 2000, env)).toBe(false);
    expect(verifyStripeOAuthState(grant.cookie, grant.state, scope, 601000, env)).toBe(false);
    expect(verifyStripeOAuthState(grant.cookie, grant.state, scope, 999, env)).toBe(false);
    expect(verifyStripeOAuthState(grant.cookie, grant.state, scope, NaN, env)).toBe(false);
  });
  it("refuses to issue an unsealed grant when no encryption key exists", () => {
    expect(() => createStripeOAuthState(scope, 1000, {})).toThrow("stripe_state_key_unavailable");
  });
});
