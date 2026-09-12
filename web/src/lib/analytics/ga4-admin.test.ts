// S23-B — registerCustomDimensions against a mocked googleapis
// analyticsadmin client. Pins: dry-run never creates; apply creates only the
// missing specs with the exact requestBody GA4 expects; the real 403
// "Admin API … disabled" becomes blocked.api_disabled + the two operator
// steps (never a throw); a 409 race is tolerated; unconfigured env is
// blocked.not_configured; the lazily-imported googleapis client is built with
// the `analytics.edit` scope.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA4_CUSTOM_DIMENSIONS } from "./ga4-dimensions";
import { registerCustomDimensions, type Ga4AdminClient } from "./ga4-admin";
import { ga4PropertyId, ga4PropertyPath, ga4ServiceAccount } from "./ga4-credentials";

const googleapisMock = vi.hoisted(() => ({
  GoogleAuth: vi.fn(),
  analyticsadmin: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: googleapisMock.GoogleAuth },
    analyticsadmin: googleapisMock.analyticsadmin,
  },
}));

const ENV = {
  GA4_PROPERTY_ID: "123456789",
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: "sa@longcare-495115.iam.gserviceaccount.com",
  GOOGLE_DRIVE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
};

const DISABLED_403 = Object.assign(new Error("Google Analytics Admin API has not been used in project 990415480608 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608 then retry."), {
  code: 403,
  errors: [{ reason: "accessNotConfigured" }],
});

function fakeClient(existing: Array<{ parameterName: string; scope?: string }>, opts: { createError?: unknown; listError?: unknown } = {}) {
  const list = vi.fn(async () => {
    if (opts.listError) throw opts.listError;
    return { data: { customDimensions: existing.map((d, i) => ({ name: `properties/123456789/customDimensions/${i}`, scope: "EVENT", ...d })) } };
  });
  const create = vi.fn(async (args: { requestBody: { parameterName: string } }) => {
    if (opts.createError) throw opts.createError;
    return { data: { name: `properties/123456789/customDimensions/new-${args.requestBody.parameterName}`, ...args.requestBody } };
  });
  const client: Ga4AdminClient = { properties: { customDimensions: { list, create } } };
  return { client, list, create };
}

describe("ga4-credentials", () => {
  it("reads the Drive service-account pair and unescapes the key", () => {
    const sa = ga4ServiceAccount(ENV);
    expect(sa?.client_email).toBe(ENV.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL);
    expect(sa?.private_key).toContain("\nabc\n");
    expect(ga4PropertyId(ENV)).toBe("123456789");
    expect(ga4PropertyPath(ENV)).toBe("properties/123456789");
  });
  it("prefers GOOGLE_APPLICATION_CREDENTIALS_JSON when valid, falls back otherwise", () => {
    expect(ga4ServiceAccount({ ...ENV, GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({ client_email: "j@x", private_key: "k" }) })?.client_email).toBe("j@x");
    expect(ga4ServiceAccount({ ...ENV, GOOGLE_APPLICATION_CREDENTIALS_JSON: "{not json" })?.client_email).toBe(ENV.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL);
    expect(ga4ServiceAccount({})).toBeNull();
  });
  it("accepts properties/<id>, falls back to GA_PROPERTY_ID and rejects non-numeric ids", () => {
    expect(ga4PropertyId({ GA4_PROPERTY_ID: "properties/42" })).toBe("42");
    expect(ga4PropertyId({ GA_PROPERTY_ID: "77" })).toBe("77");
    expect(ga4PropertyId({ GA4_PROPERTY_ID: "G-ABC123" })).toBeNull();
    expect(ga4PropertyId({})).toBeNull();
  });
});

describe("registerCustomDimensions", () => {
  beforeEach(() => {
    googleapisMock.GoogleAuth.mockReset();
    googleapisMock.analyticsadmin.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("dry-run (default): lists, diffs, creates nothing", async () => {
    const { client, list, create } = fakeClient([{ parameterName: "arm" }, { parameterName: "plan" }, { parameterName: "old_one" }]);
    const r = await registerCustomDimensions({ env: ENV, client });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.property).toBe("properties/123456789");
    expect(r.existing).toEqual(["arm", "plan"]);
    expect(r.missing).toEqual(["variant", "segment", "kind", "step", "capital", "intent"]);
    expect(r.unmanaged).toEqual(["old_one"]);
    expect(r.created).toEqual([]);
    expect(r.blocked).toBeNull();
    expect(list).toHaveBeenCalledWith({ parent: "properties/123456789", pageSize: 200, pageToken: undefined });
    expect(create).not.toHaveBeenCalled();
  });

  it("apply: creates exactly the missing specs with parameterName/displayName/scope/description", async () => {
    const { client, create } = fakeClient([{ parameterName: "arm" }]);
    const r = await registerCustomDimensions({ env: ENV, client, dryRun: false });
    expect(r.ok).toBe(true);
    expect(r.created).toEqual(["variant", "plan", "segment", "kind", "step", "capital", "intent"]);
    expect(r.existing).toEqual(["arm"]);
    expect(r.missing).toEqual([]);
    expect(create).toHaveBeenCalledTimes(GA4_CUSTOM_DIMENSIONS.length - 1);
    expect(create.mock.calls[0][0]).toEqual({
      parent: "properties/123456789",
      requestBody: {
        parameterName: "variant",
        displayName: "Page / copy variant",
        scope: "EVENT",
        description: expect.stringContaining("compare_viewed"),
      },
    });
  });

  it("is idempotent: a second apply against a fully registered property creates nothing", async () => {
    const { client, create } = fakeClient(GA4_CUSTOM_DIMENSIONS.map((d) => ({ parameterName: d.parameterName, scope: d.scope })));
    const r = await registerCustomDimensions({ env: ENV, client, dryRun: false });
    expect(r.ok).toBe(true);
    expect(r.created).toEqual([]);
    expect(r.existing).toHaveLength(GA4_CUSTOM_DIMENSIONS.length);
    expect(create).not.toHaveBeenCalled();
  });

  it("the real 403 (Admin API disabled in project 990415480608) → blocked.api_disabled with the two operator steps, no throw", async () => {
    const { client, create } = fakeClient([], { listError: DISABLED_403 });
    const r = await registerCustomDimensions({ env: ENV, client, dryRun: false });
    expect(r.ok).toBe(false);
    expect(r.blocked?.reason).toBe("api_disabled");
    expect(r.blocked?.steps).toHaveLength(2);
    expect(r.blocked?.steps[0]).toContain("https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608");
    expect(r.blocked?.steps[1]).toContain("sa@longcare-495115.iam.gserviceaccount.com");
    expect(r.blocked?.steps[1]).toContain("Editor");
    expect(r.missing).toHaveLength(GA4_CUSTOM_DIMENSIONS.length);
    expect(r.error).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("a 403 on create (Viewer, not Editor) → blocked.permission_denied, partial progress reported", async () => {
    const { client } = fakeClient([{ parameterName: "arm" }], {
      createError: Object.assign(new Error("The caller does not have permission"), { code: 403 }),
    });
    const r = await registerCustomDimensions({ env: ENV, client, dryRun: false });
    expect(r.blocked?.reason).toBe("permission_denied");
    expect(r.created).toEqual([]);
    expect(r.existing).toEqual(["arm"]);
    expect(r.missing).toHaveLength(GA4_CUSTOM_DIMENSIONS.length - 1);
  });

  it("a 409 already-exists race counts as created; other create errors are recorded and leave the spec missing", async () => {
    const list = vi.fn(async () => ({ data: { customDimensions: [] } }));
    const create = vi.fn(async (args: { requestBody: { parameterName: string } }) => {
      if (args.requestBody.parameterName === "variant") throw Object.assign(new Error("ALREADY_EXISTS: custom dimension"), { code: 409 });
      if (args.requestBody.parameterName === "step") throw Object.assign(new Error("Invalid argument: description too long"), { code: 400 });
      return { data: args.requestBody };
    });
    const r = await registerCustomDimensions({ env: ENV, client: { properties: { customDimensions: { list, create } } }, dryRun: false });
    expect(r.ok).toBe(false);
    expect(r.created).toContain("variant");
    expect(r.missing).toEqual(["step"]);
    expect(r.error).toMatch(/^step: Invalid argument/);
    expect(r.blocked).toBeNull();
  });

  it("non-access list failures surface as error, not blocked", async () => {
    const { client } = fakeClient([], { listError: new Error("ECONNRESET") });
    const r = await registerCustomDimensions({ env: ENV, client });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBeNull();
    expect(r.error).toBe("ECONNRESET");
  });

  it("missing property id / service account → blocked.not_configured (steps still printed)", async () => {
    const noProp = await registerCustomDimensions({ env: { ...ENV, GA4_PROPERTY_ID: "" } });
    expect(noProp.blocked?.reason).toBe("not_configured");
    expect(noProp.blocked?.message).toContain("GA4_PROPERTY_ID");
    expect(noProp.blocked?.steps).toHaveLength(2);
    const noSa = await registerCustomDimensions({ env: { GA4_PROPERTY_ID: "1" } });
    expect(noSa.blocked?.reason).toBe("not_configured");
    expect(noSa.blocked?.message).toContain("GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL");
  });

  it("without an injected client it builds googleapis analyticsadmin v1beta with the analytics.edit scope", async () => {
    const { client } = fakeClient([{ parameterName: "arm" }]);
    googleapisMock.GoogleAuth.mockImplementation(function (this: unknown) {
      return { kind: "auth" };
    });
    googleapisMock.analyticsadmin.mockReturnValue(client);
    const r = await registerCustomDimensions({ env: ENV });
    expect(r.ok).toBe(true);
    expect(r.existing).toEqual(["arm"]);
    expect(googleapisMock.GoogleAuth).toHaveBeenCalledWith({
      credentials: { client_email: ENV.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, private_key: expect.stringContaining("BEGIN PRIVATE KEY") },
      scopes: ["https://www.googleapis.com/auth/analytics.edit"],
    });
    expect(googleapisMock.analyticsadmin).toHaveBeenCalledWith({ version: "v1beta", auth: { kind: "auth" } });
  });

  it("follows nextPageToken when listing", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: { customDimensions: [{ parameterName: "arm", scope: "EVENT" }], nextPageToken: "p2" } })
      .mockResolvedValueOnce({ data: { customDimensions: [{ parameterName: "plan", scope: "EVENT" }] } });
    const create = vi.fn();
    const r = await registerCustomDimensions({ env: ENV, client: { properties: { customDimensions: { list, create } } } });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][0]).toMatchObject({ pageToken: "p2" });
    expect(r.existing).toEqual(["arm", "plan"]);
  });
});
