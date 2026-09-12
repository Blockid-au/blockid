// DNS-pinned outbound fetch (S20-B review P2-3).
//
// `checkOutboundUrl` validates every address a hostname resolves to, but a
// plain `fetch` resolves the name AGAIN when it opens the socket — a
// short-TTL record can flip to 169.254.169.254 / 10.x in between (DNS
// rebinding). `pinnedFetch(url, init, addresses)` runs undici's fetch on an
// `Agent` whose connector uses `makePinnedLookup(addresses)`: the socket is
// opened to one of the addresses the check already validated (re-checked
// with `isPrivateIp`), TLS still verifies against the URL's hostname
// (undici passes `servername` separately), and with no pinned list the
// lookup re-resolves and refuses any private answer.
//
// Consumers: lib/webhooks/dispatch.ts (every delivery + ping) and
// lib/funding/fetch-source.ts (every redirect hop). Tests inject their own
// `fetch` and never reach this module's network path; `makePinnedLookup`
// itself is unit-tested in outbound-url.test.ts.
//
// undici is a declared dependency (package.json) and listed in
// next.config.ts `serverExternalPackages` so the standalone build loads the
// real package — Node's bundled copy is not importable as a module.

import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { makePinnedLookup, type OutboundUrlOptions } from "./outbound-url";

export interface PinnedFetchOptions extends Pick<OutboundUrlOptions, "resolve"> {
  /** Socket connect timeout. Default 8 s. */
  connectTimeoutMs?: number;
}

/** Build a one-shot dispatcher whose connects are pinned to `addresses`. Close it when done. */
export function pinnedDispatcher(addresses: readonly string[], opts: PinnedFetchOptions = {}): Dispatcher {
  return new Agent({
    connect: {
      lookup: makePinnedLookup(addresses, { resolve: opts.resolve }),
      timeout: opts.connectTimeoutMs ?? 8_000,
    },
    // One request per call — no reason to keep sockets to subscriber hosts.
    pipelining: 0,
  });
}

/**
 * `fetch` pinned to `addresses`. Same call shape as the global fetch (the
 * returned Response is undici's, structurally identical for status /
 * headers / body). Never follows redirects on its own — callers pass
 * `redirect: "manual"` and re-check every hop.
 */
export async function pinnedFetch(url: string, init: RequestInit, addresses: readonly string[], opts: PinnedFetchOptions = {}): Promise<Response> {
  const dispatcher = pinnedDispatcher(addresses, opts);
  try {
    // undici's RequestInit mirrors the DOM one; only `dispatcher` is extra.
    const res = await undiciFetch(url, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher });
    return res as unknown as Response;
  } finally {
    // Sockets close once the (already-consumed or cancelled) body settles.
    dispatcher.close().catch(() => undefined);
  }
}
