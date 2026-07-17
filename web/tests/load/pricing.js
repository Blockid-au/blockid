// pricing.js — k6 load test for /pricing.
//
// Ramp 100 VUs over 30s, sustain 2m, ramp-down 30s.
// Tags each request with the QA segment via __ENV.SEGMENT so we can slice
// the Grafana dashboard per persona (founder / investor / advisor /
// accelerator).
//
// Run:
//   BASE_URL=https://staging.blockid.au SEGMENT=founder \
//     k6 run web/tests/load/pricing.js
//
// Thresholds:
//   http_req_duration{endpoint:pricing} p(95) < 400ms
//   http_req_failed{endpoint:pricing}   rate  < 1%
//   checks                              rate  > 99%

import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SEGMENT = __ENV.SEGMENT || "founder";
const VALID_SEGMENTS = ["founder", "investor", "advisor", "accelerator"];
const segment = VALID_SEGMENTS.includes(SEGMENT) ? SEGMENT : "founder";

export const options = {
  scenarios: {
    pricing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "2m", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
      tags: { segment: segment },
    },
  },
  thresholds: {
    "http_req_duration{endpoint:pricing}": ["p(95)<400"],
    "http_req_failed{endpoint:pricing}": ["rate<0.01"],
    checks: ["rate>0.99"],
  },
  tags: {
    segment: segment,
    suite: "pricing-load",
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/pricing?segment=${segment}`, {
    tags: { endpoint: "pricing", segment: segment },
    headers: {
      "User-Agent": "blockid-k6-pricing/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  check(
    res,
    {
      "status is 200": (r) => r.status === 200,
      "p95 budget met (per-request < 400ms)": (r) => r.timings.duration < 400,
      "body has pricing markup": (r) =>
        typeof r.body === "string" && r.body.length > 0,
    },
    { endpoint: "pricing", segment: segment },
  );
}
