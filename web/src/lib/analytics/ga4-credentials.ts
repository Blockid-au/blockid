// Service-account credentials + property id for the GA4 Admin / Data APIs
// (S23-B). Two credential shapes are accepted, matching what the repo
// already uses: the Drive service account pair
// (GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY — what the
// production .env carries) or a full JSON key in
// GOOGLE_APPLICATION_CREDENTIALS_JSON (what src/lib/ga4/data-api-client.ts
// reads). Pure env parsing — no googleapis import here so the .mjs CLI and
// the vitest suites can load it without the heavy dependency.

export interface Ga4ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface Ga4Env {
  GA4_PROPERTY_ID?: string;
  GA_PROPERTY_ID?: string;
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_DRIVE_PRIVATE_KEY?: string;
  GOOGLE_APPLICATION_CREDENTIALS_JSON?: string;
}

/** Numeric GA4 property id (no `properties/` prefix), or null. */
export function ga4PropertyId(env: Ga4Env = process.env as Ga4Env): string | null {
  const raw = (env.GA4_PROPERTY_ID ?? env.GA_PROPERTY_ID ?? "").trim().replace(/^properties\//, "");
  return /^\d+$/.test(raw) ? raw : null;
}

/** `properties/<id>` resource name, or null. */
export function ga4PropertyPath(env: Ga4Env = process.env as Ga4Env): string | null {
  const id = ga4PropertyId(env);
  return id ? `properties/${id}` : null;
}

export function ga4ServiceAccount(env: Ga4Env = process.env as Ga4Env): Ga4ServiceAccount | null {
  const json = env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<Ga4ServiceAccount>;
      if (parsed.client_email && parsed.private_key) {
        return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      /* fall through to the pair */
    }
  }
  const email = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = env.GOOGLE_DRIVE_PRIVATE_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!email || !key) return null;
  return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
}

/** Scopes: the Data API rejects `analytics.edit` ("insufficient authentication scopes"), the Admin API needs it. */
export const GA4_SCOPE_EDIT = "https://www.googleapis.com/auth/analytics.edit";
export const GA4_SCOPE_READONLY = "https://www.googleapis.com/auth/analytics.readonly";
