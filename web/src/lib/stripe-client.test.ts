// Colocated regression suite for `web/src/lib/stripe-client.ts` — the
// browser-side lazy loader for Stripe.js that every checkout / customer-portal
// / change-plan CTA path calls before redirecting the founder to Stripe. A
// silent regression here has an outsized blast radius on the paid-conversion
// funnel:
//   - drop the `if (!stripePromise)` singleton and every re-render re-injects
//     the Stripe.js `<script>` (loadStripe attaches to window.Stripe), which
//     the Stripe docs warn against because it multiplies PII fingerprinting
//     hooks + can double-fire pk_ init events;
//   - drop the `key ? loadStripe(key) : Promise.resolve(null)` fallback and
//     the CI/preview envs (which run without NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
//     will call loadStripe(undefined) which surfaces "Missing publishable key"
//     inline instead of the caller-owned "payments unavailable" state;
//   - flip the singleton to a per-call fresh Promise and a paying founder who
//     opens two Stripe surfaces in quick succession (e.g. checkout tab + a
//     billing-portal tab from the header) racing to load stripe.js can hit a
//     double-init warning in the console + duplicate the impression event.
//
// P9_ship autonomous-loop tick — first test coverage for stripe-client.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; we install a loadStripe spy that captures every
// invocation so we can pin the singleton contract (call count + arg identity).
// The resolved value is a lightweight object so `Awaited<ReturnType<...>>`
// stays test-usable without pulling in the real @stripe/stripe-js typings.
const { loadStripeSpy, fakeStripeInstance } = vi.hoisted(() => {
  const fakeStripeInstance = { __brand: "fake-stripe" as const };
  return {
    loadStripeSpy: vi.fn<(key: string) => Promise<typeof fakeStripeInstance | null>>(),
    fakeStripeInstance,
  };
});

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: loadStripeSpy,
}));

const ENV_KEY = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";
let savedEnv: string | undefined;

async function loadStripeClientMod() {
  // Force a fresh module so the module-scope `stripePromise` memo is a
  // pristine `null` for every test — the singleton is exactly the surface
  // under test and must not leak across cases.
  vi.resetModules();
  return await import("./stripe-client");
}

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  loadStripeSpy.mockReset();
  // Default happy resolution so the with-key cases don't need to re-mock in
  // every test. Individual tests override for rejection / null branches.
  loadStripeSpy.mockResolvedValue(fakeStripeInstance);
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe("stripe-client — public surface", () => {
  it("exports `getStripeClient` as a callable function", async () => {
    const mod = await loadStripeClientMod();
    expect(typeof mod.getStripeClient).toBe("function");
  });

  it("has arity 0 (takes no arguments — the key is env-driven)", async () => {
    const mod = await loadStripeClientMod();
    expect(mod.getStripeClient.length).toBe(0);
  });

  it("returns a Promise (thenable) on every invocation", async () => {
    process.env[ENV_KEY] = "pk_test_visible_pub_key";
    const mod = await loadStripeClientMod();
    const p = mod.getStripeClient();
    expect(p).toBeInstanceOf(Promise);
    // Drain so the pending microtask doesn't leak into the next test.
    await p;
  });
});

describe("stripe-client — missing / falsy publishable key", () => {
  it("resolves to null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is unset", async () => {
    const mod = await loadStripeClientMod();
    await expect(mod.getStripeClient()).resolves.toBeNull();
  });

  it("does NOT call loadStripe when the key is unset", async () => {
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    expect(loadStripeSpy).not.toHaveBeenCalled();
  });

  it("resolves to null when the key is the empty string (Boolean(\"\") === false)", async () => {
    process.env[ENV_KEY] = "";
    const mod = await loadStripeClientMod();
    await expect(mod.getStripeClient()).resolves.toBeNull();
    expect(loadStripeSpy).not.toHaveBeenCalled();
  });

  it("caches the null promise across calls (singleton also memos the missing-key branch)", async () => {
    const mod = await loadStripeClientMod();
    const first = mod.getStripeClient();
    const second = mod.getStripeClient();
    // Strict identity — the module returns THE SAME promise object, not a
    // fresh Promise.resolve(null) on every call. Otherwise a re-render loop
    // would allocate a new promise per frame.
    expect(second).toBe(first);
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(loadStripeSpy).not.toHaveBeenCalled();
  });
});

describe("stripe-client — happy path with publishable key", () => {
  it("calls loadStripe with the exact env key on first call", async () => {
    process.env[ENV_KEY] = "pk_test_the_real_key_123";
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
    expect(loadStripeSpy).toHaveBeenCalledWith("pk_test_the_real_key_123");
  });

  it("propagates the resolved Stripe instance from loadStripe verbatim", async () => {
    process.env[ENV_KEY] = "pk_live_xyz";
    const mod = await loadStripeClientMod();
    await expect(mod.getStripeClient()).resolves.toBe(fakeStripeInstance);
  });

  it("does NOT re-invoke loadStripe on subsequent calls (singleton contract)", async () => {
    process.env[ENV_KEY] = "pk_live_abc";
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    await mod.getStripeClient();
    await mod.getStripeClient();
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
  });

  it("returns the SAME promise instance across calls (strict identity)", async () => {
    process.env[ENV_KEY] = "pk_live_singleton";
    const mod = await loadStripeClientMod();
    const first = mod.getStripeClient();
    const second = mod.getStripeClient();
    expect(second).toBe(first);
    await first;
  });

  it("returns the same promise identity even for a call made BEFORE the first resolves (no race)", async () => {
    process.env[ENV_KEY] = "pk_live_race";
    // Hold the resolution pending so we can prove the second synchronous call
    // reuses the in-flight promise instead of triggering a second loadStripe.
    let release!: (value: typeof fakeStripeInstance) => void;
    loadStripeSpy.mockReturnValueOnce(
      new Promise<typeof fakeStripeInstance>((resolve) => {
        release = resolve;
      }),
    );
    const mod = await loadStripeClientMod();
    const inflight = mod.getStripeClient();
    const secondBeforeResolve = mod.getStripeClient();
    expect(secondBeforeResolve).toBe(inflight);
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
    release(fakeStripeInstance);
    await expect(inflight).resolves.toBe(fakeStripeInstance);
    await expect(secondBeforeResolve).resolves.toBe(fakeStripeInstance);
  });

  it("propagates a loadStripe null resolution (Stripe.js reports script-load failure) as null", async () => {
    process.env[ENV_KEY] = "pk_live_broken_cdn";
    loadStripeSpy.mockResolvedValueOnce(null);
    const mod = await loadStripeClientMod();
    await expect(mod.getStripeClient()).resolves.toBeNull();
  });

  it("caches a loadStripe null-resolution — second call yields the same null promise, no re-invoke", async () => {
    process.env[ENV_KEY] = "pk_live_broken_cdn";
    loadStripeSpy.mockResolvedValueOnce(null);
    const mod = await loadStripeClientMod();
    const first = mod.getStripeClient();
    const second = mod.getStripeClient();
    expect(second).toBe(first);
    await expect(first).resolves.toBeNull();
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
  });

  it("caches a loadStripe rejection — second call yields the same rejected promise, no re-invoke", async () => {
    process.env[ENV_KEY] = "pk_live_broken";
    const boom = new Error("stripe.js CDN unreachable");
    loadStripeSpy.mockRejectedValueOnce(boom);
    const mod = await loadStripeClientMod();
    const first = mod.getStripeClient();
    const second = mod.getStripeClient();
    expect(second).toBe(first);
    await expect(first).rejects.toBe(boom);
    // The rejected promise is still cached — re-awaiting `second` sees the
    // same rejection value without a fresh loadStripe call.
    await expect(second).rejects.toBe(boom);
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
  });

  it("captures the key at first call — mutating process.env after does NOT rotate the cached client", async () => {
    process.env[ENV_KEY] = "pk_live_frozen_at_first";
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    process.env[ENV_KEY] = "pk_live_rotated_later";
    await mod.getStripeClient();
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
    expect(loadStripeSpy).toHaveBeenCalledWith("pk_live_frozen_at_first");
  });
});

describe("stripe-client — module isolation & re-load semantics", () => {
  it("resetModules() + re-import yields a fresh singleton (test-isolation guarantee)", async () => {
    process.env[ENV_KEY] = "pk_live_first_mod";
    const modA = await loadStripeClientMod();
    await modA.getStripeClient();
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);

    process.env[ENV_KEY] = "pk_live_second_mod";
    const modB = await loadStripeClientMod();
    await modB.getStripeClient();
    // Fresh module, fresh singleton — loadStripe fires again with the new key.
    expect(loadStripeSpy).toHaveBeenCalledTimes(2);
    expect(loadStripeSpy).toHaveBeenLastCalledWith("pk_live_second_mod");
  });

  it("cross-module identity: two consumers importing the same module see the SAME singleton", async () => {
    process.env[ENV_KEY] = "pk_live_shared";
    vi.resetModules();
    // Two separate `import()` calls without an intervening resetModules() —
    // Node's ESM loader must hand back the same module namespace, so the
    // singleton is genuinely process-wide (not per-import).
    const [modA, modB] = await Promise.all([
      import("./stripe-client"),
      import("./stripe-client"),
    ]);
    const first = modA.getStripeClient();
    const second = modB.getStripeClient();
    expect(second).toBe(first);
    await first;
    expect(loadStripeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not touch process.env on the missing-key branch (no env writes)", async () => {
    // Snapshot the whole env to prove nothing leaks — the module is read-only
    // over process.env.
    const before = { ...process.env };
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    expect(process.env).toEqual(before);
  });

  it("does not touch process.env on the happy-path branch (no env writes)", async () => {
    process.env[ENV_KEY] = "pk_live_no_side_effects";
    const before = { ...process.env };
    const mod = await loadStripeClientMod();
    await mod.getStripeClient();
    expect(process.env).toEqual(before);
  });
});
