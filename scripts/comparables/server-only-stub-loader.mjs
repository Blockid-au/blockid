// Node module-customization hook: resolve the Next-only `server-only`
// sentinel (next/dist/compiled/server-only, not installed as a package) to
// an empty module so web/src TS modules that carry it can be loaded by a
// plain `node` CLI through tsx. Registered by ingest-public-roundups.mjs
// before tsx's own hooks; everything else falls through to the default
// resolver.

const EMPTY = "data:text/javascript,export%20default%20%7B%7D%3B";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: EMPTY, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
