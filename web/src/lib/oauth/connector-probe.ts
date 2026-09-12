// "Is this OAuth connector configured?" probe shared by the five
// /api/oauth/<provider> HEAD handlers and their client callers
// (ConnectButtons, ConnectorStatus, EvidenceWizard).
//
// Release QA-2 F11: the handlers used to answer 503 when the provider's
// client id was unset. That is a *state*, not a failure, yet every load of
// /workspace/evidence logged four red "503 (Service Unavailable)" lines,
// uptime tooling counts 5xx, and a real outage became indistinguishable
// from "Xero is not set up on this deployment". Now: HEAD always answers
// 204 and carries `X-Connector-Configured: true|false`; the client reads
// the header. The browser only logs a console error for 4xx/5xx, so the
// page is quiet. Kept dependency-free so both sides can import it.

export const CONNECTOR_CONFIGURED_HEADER = "X-Connector-Configured";

/** Headers for the HEAD response. `Cache-Control` keeps the probe cheap. */
export function connectorProbeHeaders(configured: boolean): Record<string, string> {
  return {
    [CONNECTOR_CONFIGURED_HEADER]: configured ? "true" : "false",
    "Cache-Control": "private, max-age=300",
  };
}

/**
 * Interpret a probe response. Header first; a 503 (older deploy, or a
 * proxy in front of it) still reads as "not configured"; anything else
 * without the header is treated as configured, matching the previous
 * `status !== 503` rule.
 */
export function isConnectorConfigured(res: { status: number; headers: { get(name: string): string | null } }): boolean {
  const flag = res.headers.get(CONNECTOR_CONFIGURED_HEADER);
  if (flag === "true") return true;
  if (flag === "false") return false;
  return res.status !== 503;
}

/** Fire the HEAD probe; network errors read as "not configured". */
export async function probeConnector(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { method: "HEAD", redirect: "manual" });
    return isConnectorConfigured(res);
  } catch {
    return false;
  }
}
