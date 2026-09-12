// S23-B — GA4 custom-dimension registry: pure diff / classify / operator
// steps, and the static tie to the typed event registries so a renamed
// param (e.g. `arm` → `variant` on hero_variant_shown) fails here before it
// silently breaks the hero A/B exploration.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GA4_ADMIN_API_ENABLE_URL,
  GA4_AUDIT_EVENTS,
  GA4_CUSTOM_DIMENSIONS,
  GA4_GCP_PROJECT_ID,
  GA4_LIMITS,
  HERO_VARIANT_DIMENSION,
  classifyGa4Error,
  diffDimensions,
  operatorSteps,
  validateDimensionSpec,
} from "./ga4-dimensions";
import { paramIndex, parseAnalyticsEventMap, parseServerEventUnion } from "./event-map-introspect";

const SRC = path.resolve(__dirname, "..", "..");
const clientMap = parseAnalyticsEventMap(readFileSync(path.join(SRC, "lib", "analytics.ts"), "utf8"));
const serverMap = parseServerEventUnion(readFileSync(path.join(SRC, "lib", "analytics", "events.ts"), "utf8"));
const params = paramIndex([clientMap, serverMap]);

describe("GA4_CUSTOM_DIMENSIONS — declarative list", () => {
  it("every spec is valid against the GA4 limits and unique per (param, scope)", () => {
    const keys = new Set<string>();
    for (const spec of GA4_CUSTOM_DIMENSIONS) {
      expect(validateDimensionSpec(spec), spec.parameterName).toEqual([]);
      const k = `${spec.scope}:${spec.parameterName}`;
      expect(keys.has(k), `duplicate ${k}`).toBe(false);
      keys.add(k);
    }
    expect(GA4_CUSTOM_DIMENSIONS.filter((d) => d.scope === "EVENT").length).toBeLessThanOrEqual(GA4_LIMITS.eventScopedDimensionsPerProperty);
  });

  it("covers the S23-B parameters", () => {
    const names = GA4_CUSTOM_DIMENSIONS.map((d) => d.parameterName);
    expect(names).toEqual(expect.arrayContaining(["arm", "variant", "plan", "segment", "kind", "step", "capital", "intent"]));
  });

  it("the hero dimension is the `arm` param (what hero_variant_shown actually sends), displayed as “Hero variant”", () => {
    expect(HERO_VARIANT_DIMENSION.parameterName).toBe("arm");
    expect(HERO_VARIANT_DIMENSION.displayName).toBe("Hero variant");
    expect(HERO_VARIANT_DIMENSION.scope).toBe("EVENT");
    expect(clientMap.events.get("hero_variant_shown")).toEqual(["arm"]);
    expect(clientMap.events.get("svi_submitted")).toContain("arm");
  });

  it("every dimension's parameterName is really sent by every event it lists (derived from AnalyticsEventMap / AnalyticsEvent)", () => {
    for (const spec of GA4_CUSTOM_DIMENSIONS) {
      const carriers = params.get(spec.parameterName) ?? [];
      expect(carriers.length, `${spec.parameterName} is not a param of any typed event`).toBeGreaterThan(0);
      for (const ev of spec.events) {
        expect(carriers, `${ev} does not send ${spec.parameterName}`).toContain(ev);
      }
    }
  });

  it("`variant` is only registered because typed events use it as a param (compare_viewed, radar_upsell_view)", () => {
    expect(params.get("variant")).toEqual(expect.arrayContaining(["compare_viewed", "radar_upsell_view"]));
  });

  it("USER-scoped plan_tier is registered iff the app actually sets user properties", () => {
    // Walk src/ for call sites of setUserProperties( / gtag("set", "user_properties"
    // outside the helper's own definition + tests.
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
          if (name !== "node_modules") walk(abs);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const src = readFileSync(abs, "utf8");
        const rel = path.relative(SRC, abs);
        if (rel === path.join("lib", "analytics.ts") || rel === path.join("lib", "analytics", "ga4-dimensions.ts")) continue;
        if (/setUserProperties\s*\(/.test(src) || /gtag\(\s*["']set["']\s*,\s*["']user_properties["']/.test(src)) callers.push(rel);
      }
    };
    walk(SRC);
    const userScoped = GA4_CUSTOM_DIMENSIONS.filter((d) => d.scope === "USER").map((d) => d.parameterName);
    if (callers.length === 0) {
      expect(userScoped, "no caller sets user properties — a USER-scoped dimension would never receive data").toEqual([]);
    } else {
      expect(userScoped, `user properties are set in ${callers.join(", ")} — register plan_tier (USER scope)`).toContain("plan_tier");
    }
  });

  it("GA4_AUDIT_EVENTS are all typed client events", () => {
    for (const ev of GA4_AUDIT_EVENTS) expect(clientMap.events.has(ev), ev).toBe(true);
    expect(GA4_AUDIT_EVENTS).toHaveLength(8);
  });
});

describe("diffDimensions (pure)", () => {
  it("splits wanted specs into existing / missing by (parameterName, scope) and reports unmanaged ones", () => {
    const existing = [
      { name: "properties/1/customDimensions/1", parameterName: "arm", scope: "EVENT", displayName: "Hero variant" },
      { name: "properties/1/customDimensions/2", parameterName: "plan", scope: "EVENT" },
      { name: "properties/1/customDimensions/3", parameterName: "plan", scope: "USER" }, // different scope ≠ ours
      { name: "properties/1/customDimensions/4", parameterName: "legacy_thing", scope: "EVENT" },
    ];
    const diff = diffDimensions(existing);
    expect(diff.existing.map((d) => d.parameterName)).toEqual(["arm", "plan"]);
    expect(diff.missing.map((d) => d.parameterName)).toEqual(["variant", "segment", "kind", "step", "capital", "intent"]);
    expect(diff.unmanaged).toEqual(["plan (USER)", "legacy_thing"]);
  });

  it("is a no-op when everything is registered and treats a missing scope as EVENT", () => {
    const existing = GA4_CUSTOM_DIMENSIONS.map((d) => ({ parameterName: d.parameterName }));
    const diff = diffDimensions(existing);
    expect(diff.missing).toEqual([]);
    expect(diff.existing).toHaveLength(GA4_CUSTOM_DIMENSIONS.length);
    expect(diff.unmanaged).toEqual([]);
  });

  it("an empty property means everything is missing", () => {
    const diff = diffDimensions([]);
    expect(diff.missing).toHaveLength(GA4_CUSTOM_DIMENSIONS.length);
    expect(diff.existing).toEqual([]);
  });
});

describe("operatorSteps + classifyGa4Error", () => {
  const disabled403 = {
    code: 403,
    message:
      "Google Analytics Admin API has not been used in project 990415480608 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608 then retry.",
    errors: [{ reason: "accessNotConfigured", message: "…" }],
  };

  it("prints exactly two steps: enable the Admin API (direct console URL, project 990415480608) and add the SA as Editor on the property", () => {
    const steps = operatorSteps({ serviceAccountEmail: "sa@longcare-495115.iam.gserviceaccount.com", propertyId: "123456789" });
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain(GA4_ADMIN_API_ENABLE_URL);
    expect(steps[0]).toContain(`project ${GA4_GCP_PROJECT_ID}`);
    expect(GA4_ADMIN_API_ENABLE_URL).toBe("https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608");
    expect(steps[1]).toContain("Property access management");
    expect(steps[1]).toContain("sa@longcare-495115.iam.gserviceaccount.com");
    expect(steps[1]).toContain("Editor");
    expect(steps[1]).toContain("property 123456789");
  });

  it("names the env var when no service-account email is known", () => {
    expect(operatorSteps()[1]).toContain("$GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL");
  });

  it("the Data API variant points at analyticsdata.googleapis.com", () => {
    expect(operatorSteps({ api: "data" })[0]).toContain("analyticsdata.googleapis.com");
  });

  it("classifies the real 403 accessNotConfigured as api_disabled with the steps", () => {
    const b = classifyGa4Error(disabled403, { serviceAccountEmail: "sa@x.iam.gserviceaccount.com" });
    expect(b?.reason).toBe("api_disabled");
    expect(b?.steps).toHaveLength(2);
    expect(b?.message).toContain("has not been used in project 990415480608");
  });

  it("classifies the gaxios response.data shape too", () => {
    const b = classifyGa4Error({
      response: { status: 403, data: { error: { status: "PERMISSION_DENIED", message: "x is disabled", errors: [{ reason: "accessNotConfigured" }] } } },
    });
    expect(b?.reason).toBe("api_disabled");
  });

  it("403 without accessNotConfigured → permission_denied; scope error → insufficient_scope; 401 → unauthenticated", () => {
    expect(classifyGa4Error({ code: 403, message: "The caller does not have permission" })?.reason).toBe("permission_denied");
    expect(classifyGa4Error({ code: 403, message: "Request had insufficient authentication scopes." })?.reason).toBe("insufficient_scope");
    expect(classifyGa4Error({ code: "401", message: "Request had invalid authentication credentials." })?.reason).toBe("unauthenticated");
  });

  it("returns null for non-access failures so callers surface them as errors, not operator steps", () => {
    expect(classifyGa4Error({ code: 400, message: "Field customEvent:arm is not a valid dimension." })).toBeNull();
    expect(classifyGa4Error(new Error("ECONNRESET"))).toBeNull();
    expect(classifyGa4Error(null)).toBeNull();
  });
});
