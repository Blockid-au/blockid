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
  serverExternalPackages: ["ioredis", "bcryptjs", "@anthropic-ai/sdk", "pptxgenjs"],
  /**
   * Stage-3 sub-B3 (Master Upgrade Plan §7.1): legacy `/for/*` marketing
   * URLs migrate to `/solutions/*`. Only the /for/[segment] slugs that
   * actually exist today get a 301; `/for/vn-sme` was never live so no
   * redirect is registered for it (would produce a redirect chain to the
   * dynamic-route 404). Advisor stays on `/for/advisor` because there is
   * no `/solutions/advisor` in the plan's persona set.
   */
  async redirects() {
    return [
      {
        source: "/for/founder",
        destination: "/solutions/founder",
        permanent: true,
      },
      {
        source: "/for/investor",
        destination: "/solutions/investor",
        permanent: true,
      },
      {
        source: "/for/accelerator",
        destination: "/solutions/accelerator",
        permanent: true,
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
