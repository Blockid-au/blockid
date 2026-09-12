// GA4 Admin API — custom-dimension registration (S23-B).
//
// Shared by scripts/ga4-register-dimensions.mjs (CLI) and
// POST /api/admin/ga4/register-dimensions (admin route). Idempotent: lists
// the property's custom dimensions, diffs against GA4_CUSTOM_DIMENSIONS and
// creates only the missing ones (never edits or archives). `dryRun` (the
// default) lists + diffs without creating.
//
// Access failures are classified, not thrown: a 403 "Google Analytics Admin
// API has not been used in project 990415480608 … or it is disabled" — what
// the project's service account gets today — comes back as
// `blocked: { reason: "api_disabled", steps }` with the two operator steps
// the service account cannot perform itself (enable the API, grant Editor).
//
// googleapis is imported lazily so importing this module never touches the
// Google auth stack (keeps builds + tests light); tests inject `client`.

import {
  GA4_CUSTOM_DIMENSIONS,
  classifyGa4Error,
  diffDimensions,
  operatorSteps,
  type Ga4Blocked,
  type Ga4DimensionSpec,
  type ExistingDimension,
} from "./ga4-dimensions";
import { GA4_SCOPE_EDIT, ga4PropertyId, ga4PropertyPath, ga4ServiceAccount, type Ga4Env } from "./ga4-credentials";

/** The slice of analyticsadmin_v1beta we use — injectable for tests. */
export interface Ga4AdminClient {
  properties: {
    customDimensions: {
      list: (args: { parent: string; pageSize?: number; pageToken?: string }) => Promise<{
        data: { customDimensions?: ExistingDimension[]; nextPageToken?: string | null };
      }>;
      create: (args: {
        parent: string;
        requestBody: { parameterName: string; displayName: string; scope: string; description?: string };
      }) => Promise<{ data: ExistingDimension }>;
    };
  };
}

export interface RegisterDimensionsOptions {
  /** Default true — list + diff only. */
  dryRun?: boolean;
  env?: Ga4Env;
  /** Injected client (tests); otherwise built from the service account with `analytics.edit`. */
  client?: Ga4AdminClient;
  wanted?: readonly Ga4DimensionSpec[];
}

export interface RegisterDimensionsResult {
  ok: boolean;
  dryRun: boolean;
  property: string | null;
  serviceAccount: string | null;
  /** Created this run (empty on dry-run). */
  created: string[];
  /** Already on the property. */
  existing: string[];
  /** Would be created (dry-run) / still missing after a partial failure. */
  missing: string[];
  /** Dimensions on the property we do not manage — reported, never touched. */
  unmanaged: string[];
  blocked: Ga4Blocked | null;
  /** Non-access failures (network, 400 on create …). */
  error: string | null;
}

async function buildClient(env: Ga4Env): Promise<Ga4AdminClient> {
  const sa = ga4ServiceAccount(env);
  if (!sa) throw new Error("service account not configured");
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: [GA4_SCOPE_EDIT] });
  return google.analyticsadmin({ version: "v1beta", auth }) as unknown as Ga4AdminClient;
}

async function listAll(client: Ga4AdminClient, parent: string): Promise<ExistingDimension[]> {
  const out: ExistingDimension[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const res = await client.properties.customDimensions.list({ parent, pageSize: 200, pageToken });
    out.push(...(res.data.customDimensions ?? []));
    const next = res.data.nextPageToken ?? undefined;
    if (!next) break;
    pageToken = next;
  }
  return out;
}

export async function registerCustomDimensions(opts: RegisterDimensionsOptions = {}): Promise<RegisterDimensionsResult> {
  const env = opts.env ?? (process.env as Ga4Env);
  const dryRun = opts.dryRun ?? true;
  const wanted = opts.wanted ?? GA4_CUSTOM_DIMENSIONS;
  const property = ga4PropertyPath(env);
  const sa = ga4ServiceAccount(env);
  const stepOpts = { serviceAccountEmail: sa?.client_email ?? null, propertyId: ga4PropertyId(env), api: "admin" as const };
  const base: RegisterDimensionsResult = {
    ok: false,
    dryRun,
    property,
    serviceAccount: sa?.client_email ?? null,
    created: [],
    existing: [],
    missing: wanted.map((w) => w.parameterName),
    unmanaged: [],
    blocked: null,
    error: null,
  };

  if (!property || (!sa && !opts.client)) {
    const what = !property ? "GA4_PROPERTY_ID" : "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY";
    return {
      ...base,
      blocked: { reason: "not_configured", steps: operatorSteps(stepOpts), message: `${what} not set` },
    };
  }

  let client: Ga4AdminClient;
  try {
    client = opts.client ?? (await buildClient(env));
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }

  let existing: ExistingDimension[];
  try {
    existing = await listAll(client, property);
  } catch (e) {
    const blocked = classifyGa4Error(e, stepOpts);
    if (blocked) return { ...base, blocked };
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }

  const diff = diffDimensions(existing, wanted);
  const result: RegisterDimensionsResult = {
    ...base,
    existing: diff.existing.map((d) => d.parameterName),
    missing: diff.missing.map((d) => d.parameterName),
    unmanaged: diff.unmanaged,
  };
  if (dryRun) return { ...result, ok: true };

  const created: string[] = [];
  const stillMissing: string[] = [];
  for (const spec of diff.missing) {
    try {
      await client.properties.customDimensions.create({
        parent: property,
        requestBody: {
          parameterName: spec.parameterName,
          displayName: spec.displayName,
          scope: spec.scope,
          description: spec.description,
        },
      });
      created.push(spec.parameterName);
    } catch (e) {
      const blocked = classifyGa4Error(e, stepOpts);
      if (blocked) {
        return { ...result, created, missing: diff.missing.map((d) => d.parameterName).filter((n) => !created.includes(n)), blocked };
      }
      // A 409 (already exists — racing a manual add) is fine; anything else is recorded.
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists|ALREADY_EXISTS|409/.test(msg)) {
        created.push(spec.parameterName);
        continue;
      }
      stillMissing.push(spec.parameterName);
      result.error = `${result.error ? `${result.error}; ` : ""}${spec.parameterName}: ${msg.slice(0, 200)}`;
    }
  }
  return { ...result, ok: stillMissing.length === 0, created, missing: stillMissing };
}
