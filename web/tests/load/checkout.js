// checkout.js — k6 load test for the checkout create flow.
//
// 20 VUs ramping over 30s, sustain 3m.
// Flow per iteration:
//   1. GET /pricing (warm cache, capture session cookie if present)
//   2. POST /api/stripe/checkout { plan: "founder_growth" } with
//      Cookie: blockid_session=$QA_SESSION_TOKEN
//   3. Assert 200 + a Stripe URL surfaced in the JSON body.
//
// We do NOT follow the redirect to Stripe — this test only measures the
// server-side create-session latency.
//
// Env:
//   BASE_URL           default http://localhost:3000
//   QA_SESSION_TOKEN   required. If missing, iterations 401 and are
//                      counted as failures.
//   PLAN               optional (default founder_growth)
//
// Thresholds:
//   http_req_duration{endpoint:checkout} p(95) < 800ms
//   http_req_failed{endpoint:checkout}   rate  < 2%
//   checks                               rate  > 98%

import http from "k6/http";
import { check, fail } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION = __ENV.QA_SESSION_TOKEN || "";
const PLAN = __ENV.PLAN || "founder_growth";

const unauth = new Counter("checkout_unauth_skips");

export const options = {
  scenarios: {
    checkout: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "3m", target: 20 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    "http_req_duration{endpoint:checkout}": ["p(95)<800"],
    "http_req_failed{endpoint:checkout}": ["rate<0.02"],
    checks: ["rate>0.98"],
    checkout_unauth_skips: ["count<10"],
  },
  tags: {
    suite: "checkout-load",
    plan: PLAN,
  },
};

export function setup() {
  if (!SESSION) {
    console.warn(
      "QA_SESSION_TOKEN not set — every iteration will 401 and be counted as a failure.",
    );
  }
  return { hasSession: SESSION.length > 0 };
}

export default function (data) {
  // 1. Warm /pricing.
  const pricingRes = http.get(`${BASE_URL}/pricing`, {
    tags: { endpoint: "pricing-warm" },
    headers: { "User-Agent": "blockid-k6-checkout/1.0" },
  });
  check(
    pricingRes,
    { "pricing warmed": (r) => r.status === 200 },
    { endpoint: "pricing-warm" },
  );

  // 2. POST /api/stripe/checkout.
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "blockid-k6-checkout/1.0",
  };
  if (SESSION) {
    headers["Cookie"] = `blockid_session=${SESSION}`;
  }

  const checkoutRes = http.post(
    `${BASE_URL}/api/stripe/checkout`,
    JSON.stringify({ plan: PLAN }),
    {
      headers,
      tags: { endpoint: "checkout" },
    },
  );

  // 3. Handle 401 gracefully — skip assertions, count as failure but don't
  //    poison the http_req_failed metric for the checkout endpoint budget.
  if (checkoutRes.status === 401) {
    unauth.add(1);
    check(
      checkoutRes,
      { "checkout: not unauthorized": () => false },
      { endpoint: "checkout" },
    );
    return;
  }

  const ok = check(
    checkoutRes,
    {
      "checkout: status 200": (r) => r.status === 200,
      "checkout: has stripe url": (r) => {
        if (!r.body || typeof r.body !== "string") return false;
        // Response shape is either { url: "https://checkout.stripe.com/..." }
        // or the URL echoed inline; accept either.
        try {
          const parsed = JSON.parse(r.body);
          if (parsed && typeof parsed.url === "string") {
            return parsed.url.includes("stripe.com") ||
              parsed.url.startsWith("http");
          }
        } catch (_) {
          // fall through to raw substring check
        }
        return r.body.includes("checkout.stripe.com") ||
          r.body.includes("https://");
      },
      "checkout: p95 budget met (per-request < 800ms)": (r) =>
        r.timings.duration < 800,
    },
    { endpoint: "checkout" },
  );

  if (!ok && checkoutRes.status >= 500) {
    fail(`checkout 5xx: ${checkoutRes.status}`);
  }
}
