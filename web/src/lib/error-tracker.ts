/**
 * Lightweight error tracker using Sentry's HTTP Store API (no SDK required).
 *
 * Set SENTRY_DSN in environment to enable. Format:
 *   https://{public_key}@{host}/{project_id}
 *   e.g. https://abc123@o123.ingest.sentry.io/456789
 *
 * Errors are captured client-side via global-error.tsx and server-side
 * via captureException(). Falls back to console.error if DSN not set.
 */

interface SentryEvent {
  event_id?: string;
  level: "error" | "warning" | "info";
  message?: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename?: string; lineno?: number; colno?: number; function?: string }> };
    }>;
  };
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
  environment?: string;
  release?: string;
  platform: string;
}

function parseDSN(dsn: string): { publicKey: string; host: string; projectId: string } | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    const host = url.hostname;
    if (!publicKey || !projectId || !host) return null;
    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

function errToEvent(err: unknown, extra?: Record<string, unknown>): SentryEvent {
  const error = err instanceof Error ? err : new Error(String(err));
  const frames = error.stack
    ?.split("\n")
    .slice(1)
    .map((line) => {
      const m = line.trim().match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (!m) return { filename: line };
      return { function: m[1] ?? "<anonymous>", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) };
    })
    .filter(Boolean) ?? [];

  return {
    level: "error",
    platform: "javascript",
    environment: process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    exception: {
      values: [{ type: error.name, value: error.message, stacktrace: { frames } }],
    },
    extra,
  };
}

export async function captureException(err: unknown, extra?: Record<string, unknown>): Promise<void> {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  // Always log to console
  console.error("[error-tracker]", err, extra ?? "");

  if (!dsn) return;

  const parsed = parseDSN(dsn);
  if (!parsed) {
    console.warn("[error-tracker] Invalid SENTRY_DSN format");
    return;
  }

  const event = errToEvent(err, extra);
  const endpoint = `https://${parsed.host}/api/${parsed.projectId}/store/`;
  const authHeader = `Sentry sentry_version=7, sentry_client=blockid/1.0, sentry_key=${parsed.publicKey}`;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": authHeader,
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Fail silently — error tracking must never break the app
  }
}

export function captureExceptionSync(err: unknown, extra?: Record<string, unknown>): void {
  void captureException(err, extra);
}
