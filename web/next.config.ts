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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://accounts.google.com https://apis.google.com https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://accounts.google.com https://oauth2.googleapis.com https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://chain.blockid.au https://explorer.blockid.au",
              "frame-src 'self' https://accounts.google.com https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join("; "),
          },
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
