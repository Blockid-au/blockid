// Canonical public origin of the site, for links we hand to users
// (invites, share links, emails).
//
// Release QA-2 F3: `new URL(request.url).origin` inside a route handler is
// the *upstream bind address* behind nginx (`https://0.0.0.0:4001`), not the
// public host — the invite "Copy link" shipped exactly that. Never derive a
// user-facing absolute URL from `request.url` or `Host`; use this helper.

const FALLBACK = "https://blockid.au";

export function canonicalSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    FALLBACK;
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a site-relative path (leading slash optional). */
export function absoluteSiteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${canonicalSiteUrl()}${p}`;
}
