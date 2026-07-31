// Unit tests for the browser GA4 + GTM tracker at web/src/lib/analytics.ts.
//
// Pins the three runtime exports (trackEvent / setUserProperties /
// trackPurchase) plus the SSR-safety contract the GA4 measurement-plan
// template (docs/plans/atlassian-standard-mapping-goal.md §1 phase 7 P2
// gap "GA4 measurement plan template") depends on: every helper must
// no-op when `window` is undefined so a server-render call site cannot
// crash, and every event must land on BOTH `window.gtag` (for GA4) AND
// `window.dataLayer` (for GTM) without duplicating the payload.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  trackEvent,
  setUserProperties,
  trackPurchase,
} from "./analytics";

type GtagCall = [string, ...unknown[]];

interface FakeWindow {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: Record<string, unknown>[];
  __gtagCalls?: GtagCall[];
}

function makeGtagRecorder(): {
  gtag: (...args: unknown[]) => void;
  calls: GtagCall[];
} {
  const calls: GtagCall[] = [];
  return {
    gtag: (...args: unknown[]) => {
      calls.push(args as GtagCall);
    },
    calls,
  };
}

function install(opts?: {
  gtag?: FakeWindow["gtag"];
  dataLayer?: Record<string, unknown>[];
  withoutGtag?: boolean;
}): {
  win: FakeWindow;
  restore: () => void;
} {
  const g = globalThis as unknown as { window?: FakeWindow };
  const prev = g.window;
  const win: FakeWindow = {};
  if (!opts?.withoutGtag) {
    win.gtag = opts?.gtag ?? (() => {});
  }
  if (opts?.dataLayer) win.dataLayer = opts.dataLayer;
  g.window = win;
  return {
    win,
    restore() {
      if (prev === undefined) delete g.window;
      else g.window = prev;
    },
  };
}

function uninstall(): () => void {
  const g = globalThis as unknown as { window?: FakeWindow };
  const prev = g.window;
  delete g.window;
  return () => {
    if (prev !== undefined) g.window = prev;
  };
}

// ── SSR safety (no window) ────────────────────────────────────────────

describe("SSR safety — every helper no-ops when window is undefined", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = uninstall();
  });
  afterEach(() => {
    restore();
  });

  it("trackEvent does not throw and returns undefined", () => {
    expect(() =>
      trackEvent("svi_form_started", { method: "text" }),
    ).not.toThrow();
    expect(trackEvent("dashboard_viewed", {})).toBeUndefined();
  });

  it("setUserProperties does not throw and returns undefined", () => {
    expect(() =>
      setUserProperties({ plan: "growth", is_paying: true }),
    ).not.toThrow();
    expect(setUserProperties({ x: 1 })).toBeUndefined();
  });

  it("trackPurchase does not throw and returns undefined", () => {
    expect(() =>
      trackPurchase({
        transaction_id: "tx_1",
        value: 149,
        currency: "AUD",
        plan: "growth",
      }),
    ).not.toThrow();
    expect(
      trackPurchase({
        transaction_id: "tx_2",
        value: 0,
        currency: "AUD",
        plan: "free",
      }),
    ).toBeUndefined();
  });

  it("does not create a `window` global as a side-effect of any call", () => {
    trackEvent("dashboard_viewed", {});
    setUserProperties({ x: 1 });
    trackPurchase({ transaction_id: "t", value: 1, currency: "AUD", plan: "p" });
    const g = globalThis as unknown as { window?: unknown };
    expect(g.window).toBeUndefined();
  });
});

// ── trackEvent ────────────────────────────────────────────────────────

describe("trackEvent", () => {
  let ctx: ReturnType<typeof install>;
  let rec: ReturnType<typeof makeGtagRecorder>;
  beforeEach(() => {
    rec = makeGtagRecorder();
    ctx = install({ gtag: rec.gtag });
  });
  afterEach(() => {
    ctx.restore();
  });

  it("calls window.gtag with ('event', name, params)", () => {
    trackEvent("svi_submitted", { method: "text", has_file: false });
    expect(rec.calls).toEqual([
      ["event", "svi_submitted", { method: "text", has_file: false }],
    ]);
  });

  it("pushes { event, ...params } onto window.dataLayer", () => {
    trackEvent("svi_analysis_complete", { svi_score: 78, slug: "acme" });
    expect(ctx.win.dataLayer).toEqual([
      { event: "svi_analysis_complete", svi_score: 78, slug: "acme" },
    ]);
  });

  it("initializes window.dataLayer to [] when undefined", () => {
    expect(ctx.win.dataLayer).toBeUndefined();
    trackEvent("dashboard_viewed", {});
    expect(Array.isArray(ctx.win.dataLayer)).toBe(true);
    expect(ctx.win.dataLayer).toHaveLength(1);
  });

  it("appends to an existing dataLayer without clobbering prior entries", () => {
    ctx.win.dataLayer = [{ event: "seed", value: 1 }];
    trackEvent("dashboard_viewed", {});
    expect(ctx.win.dataLayer).toEqual([
      { event: "seed", value: 1 },
      { event: "dashboard_viewed" },
    ]);
  });

  it("does not throw when window.gtag is missing (GA not loaded yet)", () => {
    ctx.restore();
    ctx = install({ withoutGtag: true });
    expect(() =>
      trackEvent("svi_form_started", { method: "voice" }),
    ).not.toThrow();
    expect(ctx.win.dataLayer).toEqual([
      { event: "svi_form_started", method: "voice" },
    ]);
  });

  it("stacks multiple calls in dataLayer in call order", () => {
    trackEvent("dashboard_viewed", {});
    trackEvent("svi_form_started", { method: "file" });
    trackEvent("logout", {});
    expect(ctx.win.dataLayer?.map((r) => r.event)).toEqual([
      "dashboard_viewed",
      "svi_form_started",
      "logout",
    ]);
    expect(rec.calls.map((c) => c[1])).toEqual([
      "dashboard_viewed",
      "svi_form_started",
      "logout",
    ]);
  });

  it("preserves nested and non-primitive param values verbatim (reference-equal on dataLayer)", () => {
    const params = { code: "ABC", tier_pct: 25 };
    trackEvent("reseller_via_captured", { code: "ABC", source: "url" });
    // Structural equality — the tracker spreads params, so the dataLayer row
    // should carry every key.
    expect(ctx.win.dataLayer?.[0]).toEqual({
      event: "reseller_via_captured",
      code: "ABC",
      source: "url",
    });
    // The gtag call receives the params object as-is (third arg).
    expect(rec.calls[0][2]).toEqual({ code: "ABC", source: "url" });
    // The spread on dataLayer must NOT share identity with the params arg —
    // downstream mutations of the dataLayer entry cannot leak back into the
    // caller's payload.
    const dl = ctx.win.dataLayer?.[0] as Record<string, unknown>;
    expect(dl).not.toBe(params);
  });

  it("does not swallow the `event` key when params carry other keys", () => {
    trackEvent("plan_cta_clicked", { plan: "growth", label: "Buy" });
    const row = ctx.win.dataLayer?.[0];
    expect(row?.event).toBe("plan_cta_clicked");
    expect(row?.plan).toBe("growth");
    expect(row?.label).toBe("Buy");
  });
});

// ── setUserProperties ─────────────────────────────────────────────────

describe("setUserProperties", () => {
  let ctx: ReturnType<typeof install>;
  let rec: ReturnType<typeof makeGtagRecorder>;
  beforeEach(() => {
    rec = makeGtagRecorder();
    ctx = install({ gtag: rec.gtag });
  });
  afterEach(() => {
    ctx.restore();
  });

  it("calls window.gtag with ('set', 'user_properties', props)", () => {
    setUserProperties({ plan: "growth", is_paying: true, credits: 25 });
    expect(rec.calls).toEqual([
      [
        "set",
        "user_properties",
        { plan: "growth", is_paying: true, credits: 25 },
      ],
    ]);
  });

  it("pushes { event: 'user_properties_set', ...props } onto dataLayer", () => {
    setUserProperties({ locale: "en", plan: "founding50" });
    expect(ctx.win.dataLayer).toEqual([
      {
        event: "user_properties_set",
        locale: "en",
        plan: "founding50",
      },
    ]);
  });

  it("initializes dataLayer when undefined", () => {
    expect(ctx.win.dataLayer).toBeUndefined();
    setUserProperties({ x: 1 });
    expect(Array.isArray(ctx.win.dataLayer)).toBe(true);
    expect(ctx.win.dataLayer).toHaveLength(1);
  });

  it("appends to an existing dataLayer without clobbering", () => {
    ctx.win.dataLayer = [{ event: "prior", n: 1 }];
    setUserProperties({ plan: "seed" });
    expect(ctx.win.dataLayer?.map((r) => r.event)).toEqual([
      "prior",
      "user_properties_set",
    ]);
  });

  it("does not throw when window.gtag is missing", () => {
    ctx.restore();
    ctx = install({ withoutGtag: true });
    expect(() => setUserProperties({ plan: "growth" })).not.toThrow();
    expect(ctx.win.dataLayer).toEqual([
      { event: "user_properties_set", plan: "growth" },
    ]);
  });

  it("accepts string, number, and boolean prop values (union in the signature)", () => {
    setUserProperties({ s: "x", n: 42, b: false });
    const row = ctx.win.dataLayer?.[0];
    expect(row?.s).toBe("x");
    expect(row?.n).toBe(42);
    expect(row?.b).toBe(false);
  });

  it("accepts an empty props object without throwing or corrupting the row", () => {
    setUserProperties({});
    expect(ctx.win.dataLayer).toEqual([{ event: "user_properties_set" }]);
    expect(rec.calls[0]).toEqual(["set", "user_properties", {}]);
  });
});

// ── trackPurchase ─────────────────────────────────────────────────────

describe("trackPurchase", () => {
  let ctx: ReturnType<typeof install>;
  let rec: ReturnType<typeof makeGtagRecorder>;
  beforeEach(() => {
    rec = makeGtagRecorder();
    ctx = install({ gtag: rec.gtag });
  });
  afterEach(() => {
    ctx.restore();
  });

  it("calls window.gtag with the GA4-recommended 'purchase' shape", () => {
    trackPurchase({
      transaction_id: "cs_test_a1",
      value: 149,
      currency: "AUD",
      plan: "growth",
    });
    expect(rec.calls).toEqual([
      [
        "event",
        "purchase",
        {
          transaction_id: "cs_test_a1",
          value: 149,
          currency: "AUD",
          items: [{ item_name: "growth", price: 149, quantity: 1 }],
        },
      ],
    ]);
  });

  it("pushes the raw params (not the GA4-shaped payload) onto dataLayer", () => {
    trackPurchase({
      transaction_id: "cs_test_b2",
      value: 99,
      currency: "AUD",
      plan: "seed",
    });
    // dataLayer receives the caller-shaped params (spread), not the GA4
    // `items[]` wrapper. This is deliberate — GTM consumers can rebuild the
    // items array themselves; the raw shape stays stable.
    expect(ctx.win.dataLayer).toEqual([
      {
        event: "purchase",
        transaction_id: "cs_test_b2",
        value: 99,
        currency: "AUD",
        plan: "seed",
      },
    ]);
  });

  it("mirrors value + currency into both gtag purchase payload and dataLayer row", () => {
    trackPurchase({
      transaction_id: "cs_z",
      value: 25,
      currency: "USD",
      plan: "credit_pack_25",
    });
    const gtagArg = rec.calls[0][2] as Record<string, unknown>;
    expect(gtagArg.value).toBe(25);
    expect(gtagArg.currency).toBe("USD");
    const dlRow = ctx.win.dataLayer?.[0] as Record<string, unknown>;
    expect(dlRow.value).toBe(25);
    expect(dlRow.currency).toBe("USD");
  });

  it("builds items[] with quantity=1 and item_name=plan", () => {
    trackPurchase({
      transaction_id: "cs_x",
      value: 10,
      currency: "AUD",
      plan: "founding50",
    });
    const items = (rec.calls[0][2] as { items: unknown[] }).items;
    expect(items).toEqual([
      { item_name: "founding50", price: 10, quantity: 1 },
    ]);
  });

  it("initializes dataLayer to [] when undefined", () => {
    expect(ctx.win.dataLayer).toBeUndefined();
    trackPurchase({
      transaction_id: "t",
      value: 1,
      currency: "AUD",
      plan: "p",
    });
    expect(Array.isArray(ctx.win.dataLayer)).toBe(true);
    expect(ctx.win.dataLayer).toHaveLength(1);
  });

  it("appends to an existing dataLayer without clobbering", () => {
    ctx.win.dataLayer = [{ event: "checkout_started", plan: "growth" }];
    trackPurchase({
      transaction_id: "t2",
      value: 149,
      currency: "AUD",
      plan: "growth",
    });
    expect(ctx.win.dataLayer?.map((r) => r.event)).toEqual([
      "checkout_started",
      "purchase",
    ]);
  });

  it("does not throw when window.gtag is missing (still pushes to dataLayer)", () => {
    ctx.restore();
    ctx = install({ withoutGtag: true });
    expect(() =>
      trackPurchase({
        transaction_id: "t3",
        value: 5,
        currency: "AUD",
        plan: "p",
      }),
    ).not.toThrow();
    expect(ctx.win.dataLayer).toEqual([
      {
        event: "purchase",
        transaction_id: "t3",
        value: 5,
        currency: "AUD",
        plan: "p",
      },
    ]);
  });

  it("accepts a zero-value purchase (free-tier signal)", () => {
    trackPurchase({
      transaction_id: "free_1",
      value: 0,
      currency: "AUD",
      plan: "free",
    });
    const gtagArg = rec.calls[0][2] as Record<string, unknown>;
    expect(gtagArg.value).toBe(0);
    const items = gtagArg.items as { price: number }[];
    expect(items[0].price).toBe(0);
  });
});

// ── Interaction — multiple helpers in the same session ────────────────

describe("dataLayer is shared across all three helpers within one window", () => {
  let ctx: ReturnType<typeof install>;
  let rec: ReturnType<typeof makeGtagRecorder>;
  beforeEach(() => {
    rec = makeGtagRecorder();
    ctx = install({ gtag: rec.gtag });
  });
  afterEach(() => {
    ctx.restore();
  });

  it("stacks trackEvent, setUserProperties, and trackPurchase in call order on the same dataLayer", () => {
    trackEvent("login_page_viewed", {});
    setUserProperties({ plan: "growth" });
    trackPurchase({
      transaction_id: "tx_1",
      value: 149,
      currency: "AUD",
      plan: "growth",
    });
    expect(ctx.win.dataLayer?.map((r) => r.event)).toEqual([
      "login_page_viewed",
      "user_properties_set",
      "purchase",
    ]);
    expect(rec.calls.map((c) => c[0])).toEqual(["event", "set", "event"]);
  });
});
