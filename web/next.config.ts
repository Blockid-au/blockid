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
  // Include native/binary packages in standalone output
  serverExternalPackages: ["ioredis", "bcryptjs", "@anthropic-ai/sdk", "pptxgenjs"],
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
