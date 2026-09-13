// S25-review — typed non-2xx from a connector's own API (Stripe Connect /
// Xero) during a metrics pull.
//
// Before this the resync fetchers swallowed a non-OK response as an empty
// list / empty report, so a revoked token (401), a rate limit (429) or a
// provider outage (5xx) came back as "MRR 0, 0 customers" — which the worker
// then stored as a dated snapshot, overwrote `svi_signals.mrr_aud` with,
// and rescored the account DOWN on. A pull that did not succeed must not
// produce a number. The worker maps 401/403 to `needs_reconnect` (one
// throttled notification) and everything else to `failed` (nothing written,
// retried next tick).
//
// The message carries the provider, the path family and the status only —
// never a token, never the response body.

export type ConnectorHttpProvider = "stripe" | "xero";

export class ConnectorHttpError extends Error {
  readonly code = "connector_http_error";
  constructor(
    public readonly provider: ConnectorHttpProvider,
    public readonly status: number,
    /** Short, token-free description of what was requested (e.g. "subscriptions"). */
    public readonly resource: string,
  ) {
    super(`${provider} ${resource} responded ${status}`);
    this.name = "ConnectorHttpError";
  }

  /** 401 / 403 — the connected account revoked us or the token is dead. */
  get isAuthRejected(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function isConnectorHttpError(err: unknown): err is ConnectorHttpError {
  return err instanceof ConnectorHttpError || (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "connector_http_error");
}
