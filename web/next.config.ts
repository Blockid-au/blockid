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
  serverExternalPackages: ["ioredis", "bcryptjs", "@anthropic-ai/sdk", "pptxgenjs", "@remotion/renderer", "@remotion/bundler", "@remotion/compositor-linux-x64-gnu", "@rspack/binding", "@rspack/core", "esbuild"],
  /**
   * Stage-3 sub-B3 (Master Upgrade Plan §7.1): legacy `/for/*` marketing
   * URLs migrate to `/solutions/*`. Only the /for/[segment] slugs that
   * actually exist today get a 301; `/for/vn-sme` was never live so no
   * redirect is registered for it (would produce a redirect chain to the
   * dynamic-route 404). Advisor stays on `/for/advisor` because there is
   * no `/solutions/advisor` in the plan's persona set.
   */
  async rewrites() {
    return [
      // /index/* → /startup-index/* (internal rename to avoid Next.js 16 webpack
      // naming clash where `app/index/page.tsx` compiles to a doubled
      // `app/index/index/page.js` path with no client reference manifest).
      { source: "/index", destination: "/startup-index" },
      { source: "/index/:path*", destination: "/startup-index/:path*" },
    ];
  },
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
      // B1 Task 5 — consolidate 4 SVI landing routes onto a single canonical
      // `/index` URL. `/index` is served via the /startup-index rewrite (see
      // rewrites() above) because Next 16 webpack cannot compile an
      // `app/index/page.tsx` route. `/score` remains a functional search
      // entrypoint so we keep it as a 301 target too.
      {
        source: "/score",
        destination: "/index",
        statusCode: 301,
      },
      {
        source: "/svi",
        destination: "/index",
        statusCode: 301,
      },
      {
        source: "/startup-index",
        destination: "/index",
        statusCode: 301,
      },
      {
        source: "/founding-100",
        destination: "/founding-50",
        statusCode: 301,
      },
      {
        source: "/login",
        destination: "/auth/login",
        permanent: false,
      },
      // Cloudflare Email Obfuscation rewrites plain-text emails to
      // /cdn-cgi/l/email-protection. When JS is enabled the decoder runs
      // client-side, but the href fallback 404s if CF doesn't proxy the
      // path. Send those clicks to the contact page which lists emails.
      {
        source: "/cdn-cgi/l/email-protection",
        destination: "/contact",
        permanent: false,
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
