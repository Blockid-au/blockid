// BreadcrumbList JSON-LD — small server component that emits a
// schema.org BreadcrumbList so Google renders the breadcrumb trail in the
// SERP result. Added 2026-09 as part of the P1 SEO backlog closure.
//
// Absolute URLs are recommended by Google's Rich Results test; callers
// pass a leading-slash path and we prefix SITE_URL for them.

import { headers } from "next/headers";

const SITE_URL = "https://blockid.au";

export interface BreadcrumbItem {
  /** Display name shown in the crumb (e.g. "Trust reports"). */
  name: string;
  /** Absolute URL or leading-slash path (e.g. "/reports"). */
  href: string;
}

async function readNonce(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}

function absolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${SITE_URL}${path}`;
}

/**
 * Emit a BreadcrumbList JSON-LD block. Pass items in root → current order,
 * e.g. `[{name: "Home", href: "/"}, {name: "Pricing", href: "/pricing"}]`.
 * The final item should be the current page.
 */
export async function BreadcrumbListJsonLd({
  items,
}: {
  items: BreadcrumbItem[];
}) {
  const nonce = await readNonce();
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absolute(it.href),
    })),
  };
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
