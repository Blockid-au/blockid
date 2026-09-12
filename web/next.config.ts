import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Exclude dirs that must never be bundled into standalone (prevents exponential
  // disk growth: each release would otherwise re-include all previous releases).
  outputFileTracingExcludes: {
    "**/*": ["releases/**", ".git/**", ".next-backup/**", "**/*.log", ".next/**"],
  },
  reactStrictMode: true,
  poweredByHeader: false, // Remove X-Powered-By: Next.js
  // Node process gzips HTML/JSON responses. nginx in front usually also
  // compresses, but this keeps compression when hitting :4001 directly
  // (health probes, curl checks, edge-bypass). Cheap CPU, big win on 130KB
  // homepages served uncompressed.
  compress: true,
  // Tree-shake per-icon deep imports for barrel packages. lucide-react is
  // imported from 247 files across the app — without this, a single icon
  // import can pull the full icon graph into the shared client chunk.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Include native/binary packages in standalone output
  // undici: S20-B review P2-3 — the DNS-pinned outbound fetch (lib/security/pinned-fetch.ts)
  // needs undici's Agent; kept external so the standalone build loads the real
  // package (Node's bundled copy is not importable as a module).
  serverExternalPackages: ["undici", "ioredis", "bcryptjs", "@anthropic-ai/sdk", "pptxgenjs", "node-pptx-parser", "unzipper", "tesseract.js", "@aws-sdk/client-s3", "@remotion/renderer", "@remotion/bundler", "@remotion/compositor-linux-x64-gnu", "@rspack/binding", "@rspack/core", "esbuild"],
  /**
   * Stage-3 sub-B3 (Master Upgrade Plan §7.1): legacy `/for/*` marketing
   * URLs migrate to `/solutions/*`. Only the /for/[segment] slugs that
   * actually exist today get a 301; `/for/vn-sme` was never live so no
   * redirect is registered for it (would produce a redirect chain to the
   * dynamic-route 404). `/for/advisor` joined the list on 2026-09-10 when
   * `/solutions/advisor` became a real page (T0274).
   */
  async redirects() {
    return [
      // B1 Task 3 — legacy `/for/*` marketing URLs return HTTP 301 (was 308).
      // Next.js's `permanent: true` emits a 308; `statusCode: 301` is the
      // explicit override for the classic SEO-friendly Moved Permanently.
      {
        source: "/for/founder",
        destination: "/solutions/founder",
        statusCode: 301,
      },
      {
        source: "/for/investor",
        destination: "/solutions/investor",
        statusCode: 301,
      },
      {
        source: "/for/accelerator",
        destination: "/solutions/accelerator",
        statusCode: 301,
      },
      // T0274 (G12-5, 2026-09-10) — `/solutions/advisor` is now a real page
      // (Firm A$149 for advisory firms). The old alias ran the other way and
      // landed advisors on `/for/advisor`, which sold them Growth A$69 and
      // said white-label was "Not yet". Every `/for/*` slug now 301s to its
      // `/solutions/*` twin; `/for/advisor` is no longer a segment-content
      // entry, so without this redirect it would 404.
      {
        source: "/for/advisor",
        destination: "/solutions/advisor",
        statusCode: 301,
      },
      // T0275 (2026-09-10) — one privacy policy. `/privacy` was a second,
      // older notice (dated 2026-08-23, listing a different provider set)
      // that contradicted `/legal/privacy`. The canonical policy lives at
      // `/legal/privacy` (content/legal/privacy-v2.mdx); the page at
      // `app/privacy/page.tsx` was deleted. The `#security` fragment the
      // site footer uses survives the redirect because the browser carries
      // it over when the Location has none of its own.
      {
        source: "/privacy",
        destination: "/legal/privacy",
        statusCode: 301,
      },
      // QA-3 commercial audit (2026-09-12) — the short-form `/terms` page
      // (`app/terms/page.tsx`, deleted) carried a refund clause that
      // contradicted `/legal/terms`. One Terms of Service now lives at
      // `/legal/terms` (content/legal/terms-v2.mdx v2.1); the refund policy
      // is clause 3A at `/legal/terms#refunds`.
      {
        source: "/terms",
        destination: "/legal/terms",
        statusCode: 301,
      },
      // Release QA-1 #5 (2026-09-12) — ONE canonical for the Startup Value
      // Index: `/startup-index`. Until today `/index` was rewritten to the
      // `/startup-index` route while `/startup-index` 301'd back to `/index`
      // and the page declared `canonical: /startup-index` — a canonical
      // loop Google resolves by dropping the page. `/startup-index` is the
      // physical route (Next 16 webpack cannot compile `app/index/page.tsx`),
      // so it is also the public URL now; `/index`, `/index/*` and `/svi`
      // 301 to it and the old rewrite is gone (redirects run first anyway).
      //
      // NOTE: `/score` is intentionally NOT redirected here — it hosts the
      // real Investor-Ready Score form (`app/score/page.tsx` +
      // `score-form.tsx`) that founders reach from every "Get your real
      // SVI" CTA on the estate. A prior version of this config redirected
      // /score → /index which silently shadowed the form and dumped users
      // on the marketing exchange page instead of the analyzer. Do not
      // add the redirect back.
      {
        source: "/svi",
        destination: "/startup-index",
        statusCode: 301,
      },
      {
        source: "/index",
        destination: "/startup-index",
        statusCode: 301,
      },
      {
        source: "/index/:path*",
        destination: "/startup-index/:path*",
        statusCode: 301,
      },
      // Release QA-1 #3 — `/founding-50` (Founding 100 promo landing) was
      // retired with the promo (`lib/founding-promo.ts`), but transactional
      // emails (`lib/email.ts`), CTA variants and the hero still link it.
      // Both promo aliases now land on /pricing instead of a 404.
      {
        source: "/founding-100",
        destination: "/pricing",
        statusCode: 301,
      },
      {
        source: "/founding-50",
        destination: "/pricing",
        statusCode: 301,
      },
      // Release QA-1 #3 — the other sitemap entries that never had a route.
      // `/company` → /about (the company profile hub is the About page),
      // `/api-pricing` → /developers (the API surface and its pricing live
      // there), `/live` → /startup-index (the live ticker is the index page).
      {
        source: "/company",
        destination: "/about",
        statusCode: 301,
      },
      {
        source: "/api-pricing",
        destination: "/developers",
        statusCode: 301,
      },
      {
        source: "/live",
        destination: "/startup-index",
        statusCode: 301,
      },
      // Release QA-1 #12 — duplicate article (identical <title> + topic).
      // `optimising-…` was removed from the manifest / topic queue; the
      // surviving `optimise-…` article keeps the ranking signal.
      {
        source: "/insights/optimising-startup-cap-table-for-acquisition-exit",
        destination: "/insights/optimise-startup-cap-table-for-acquisition-exit",
        statusCode: 301,
      },
      {
        source: "/login",
        destination: "/auth/login",
        permanent: false,
      },
      // /auth/signup — legacy path referenced by nav/CTA copy that predates
      // the top-level /signup route. QA sweep Sep 2026 found 404 here.
      {
        source: "/auth/signup",
        destination: "/signup",
        permanent: false,
      },
      // /tools/svi-score — QA sweep Sep 2026: this path is referenced by
      // marketing cards but was never a route. The SVI scoring tool lives
      // at /score. 301 so search engines forget the old path.
      // (Next.js requires exactly one of `permanent` or `statusCode`.)
      {
        source: "/tools/svi-score",
        destination: "/score",
        statusCode: 301,
      },
      // Block 2 (2026-09-08) — unified `/analyze` entry point supersedes the
      // legacy free-text / URL surfaces. Preserve SEO on `/score` by
      // 301-ing it to /analyze with the free tier hint.
      // The earlier "do not redirect /score" note above (2026-08 QA) is
      // superseded by this consolidation — /analyze now hosts the actual
      // analyser form.
      //
      // REVENUE GUARD (2026-09-08): `/one-click-report` MUST NOT be
      // redirected. It is the only page that drives the A$3 guest purchase
      // (`one-click-form.tsx` → /api/guest-analysis/upload-pitch →
      // /api/guest-analysis/create-order → Stripe). A 301 to
      // `/analyze?tier=paid` shipped earlier today and silently killed the
      // guest revenue path, because /analyze never calls the guest API.
      // Do not re-add a redirect for this source.
      {
        source: "/score",
        destination: "/analyze?tier=free",
        statusCode: 301,
      },
      // Fintech v2 (2026-09-08): consolidate subscription + blockchain
      // marketing entry points. `/subscribe` and `/plans` are common
      // discovery URLs that never had their own page; both land on
      // `/pricing`. `/blockchain` and `/onchain` are the two most
      // guessed URLs for the tokenization pillar and now 301 to the
      // canonical `/tokenize` shelf.
      {
        source: "/subscribe",
        destination: "/pricing",
        statusCode: 301,
      },
      {
        source: "/plans",
        destination: "/pricing",
        statusCode: 301,
      },
      {
        source: "/blockchain",
        destination: "/tokenize",
        statusCode: 301,
      },
      {
        source: "/onchain",
        destination: "/tokenize",
        statusCode: 301,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Content-Security-Policy moved to middleware for per-request nonce;
          // see web/src/proxy.ts. A static CSP here would clobber the dynamic
          // one and prevent 'unsafe-inline'/'unsafe-eval' from being dropped.
        ],
      },
      {
        // No-cache on auth API responses
        source: "/api/auth/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        // Long-cache public static image/icon assets. Default Next serves these
        // with max-age=14400 (4h) which forces daily-visitor refetches even
        // though the files rarely change. Bump to 30d + SWR for CF + browsers.
        source: "/:path*.(png|jpg|jpeg|webp|avif|svg|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  images: {
    // Allow images from upload subdomain and external sources
    remotePatterns: [
      { protocol: "https", hostname: "upload.blockid.au" },
      { protocol: "https", hostname: "blockid.au" },
      // Wildcard: startup profile subdomains (e.g. aurora-health.blockid.au)
      { protocol: "https", hostname: "*.blockid.au" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
    // Serve modern formats automatically
    formats: ["image/avif", "image/webp"],
    // Responsive breakpoints for srcSet
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Minimize quality for speed
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
};

export default nextConfig;
