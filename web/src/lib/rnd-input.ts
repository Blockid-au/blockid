import "server-only";

export type InputType = "idea" | "url" | "document";

const URL_REGEX = /^https?:\/\//i;
const DOMAIN_REGEX = /^(www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/;

export function detectInputType(rawText: string, fileName?: string): InputType {
  if (fileName && /\.(pdf|docx?|xlsx?)$/i.test(fileName)) return "document";
  const trimmed = rawText.trim();
  if (URL_REGEX.test(trimmed) || DOMAIN_REGEX.test(trimmed)) return "url";
  return "idea";
}

// ─── Deep Tech Audit Types ──────────────────────────────────────────────────

export interface SecurityAudit {
  ssl: { valid: boolean; issuer: string; protocol: string; expiresAt: string | null };
  headers: {
    csp: boolean;
    hsts: boolean;
    xFrameOptions: boolean;
    xContentType: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
  headerCount: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface PerformanceAudit {
  ttfbMs: number;
  pageSizeBytes: number;
  compressed: boolean;
  compressionType: string | null;  // gzip, br, deflate
  cacheControl: boolean;
  etag: boolean;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface TechStackAudit {
  frameworks: string[];       // React, Vue, Next.js, etc.
  cssFrameworks: string[];    // Tailwind, Bootstrap, etc.
  cms: string | null;         // WordPress, Shopify, Wix, etc.
  cdn: string | null;         // Cloudflare, Vercel, AWS, etc.
  analytics: string[];        // GA4, GTM, Mixpanel, etc.
  payments: string[];         // Stripe, PayPal, etc.
  customerTools: string[];    // Intercom, Crisp, etc.
  hosting: string | null;     // Vercel, Netlify, AWS, etc.
  serverTech: string | null;  // Express, nginx, etc.
}

export interface ProductMaturityAudit {
  hasSitemap: boolean;
  sitemapPageCount: number;
  hasRobotsTxt: boolean;
  hasStructuredData: boolean;  // JSON-LD, OpenGraph
  hasOpenGraph: boolean;
  hasTwitterCards: boolean;
  hasPWA: boolean;            // manifest.json or service worker
  hasViewportMeta: boolean;
  hasMultiLang: boolean;
  hasLoginForm: boolean;
  hasDashboard: boolean;
  hasTestimonials: boolean;
  hasCustomerLogos: boolean;
  socialLinks: string[];      // LinkedIn, Twitter, etc.
  githubLink: string | null;
}

export interface TechAuditResult {
  url: string;
  auditedAt: string;
  security: SecurityAudit;
  performance: PerformanceAudit;
  techStack: TechStackAudit;
  productMaturity: ProductMaturityAudit;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  // Pre-computed SVI signal boosts
  signalBoosts: {
    ptdBoost: number;
    svmBoost: number;
    treBoost: number;
    lcoBoost: number;
  };
  evidenceLabels: string[];   // Human-readable evidence summaries
}

// ─── SSRF Protection ────────────────────────────────────────────────────────

const PRIVATE_IP_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC1918
  /^192\.168\./,                     // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC1918
  /^169\.254\./,                     // link-local
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
];

function isSafeUrl(url: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return { ok: false, reason: "Loopback address not allowed" };
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return { ok: false, reason: "Private/internal address not allowed" };
    }
  }

  // Block metadata endpoints (AWS, GCP, Azure)
  if (["169.254.169.254", "metadata.google.internal", "169.254.170.2"].includes(hostname)) {
    return { ok: false, reason: "Metadata endpoint not allowed" };
  }

  return { ok: true };
}

// ─── In-memory Tech Audit Cache (TTL: 1 hour) ───────────────────────────────

const AUDIT_CACHE_TTL_MS = 60 * 60 * 1000;
const _auditCache = new Map<string, { result: TechAuditResult; expiresAt: number }>();

function getCachedAudit(url: string): TechAuditResult | null {
  const entry = _auditCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _auditCache.delete(url);
    return null;
  }
  return entry.result;
}

function setCachedAudit(url: string, result: TechAuditResult): void {
  _auditCache.set(url, { result, expiresAt: Date.now() + AUDIT_CACHE_TTL_MS });
  // Evict oldest entries if cache grows beyond 100 items
  if (_auditCache.size > 100) {
    const oldest = [..._auditCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) _auditCache.delete(oldest[0]);
  }
}

// ─── Scrape + Basic Tech Hints ──────────────────────────────────────────────

export async function scrapeUrl(url: string): Promise<{ title: string; description: string; text: string; techHints: string[] }> {
  let fullUrl = url.trim();
  if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

  const ssrf = isSafeUrl(fullUrl);
  if (!ssrf.ok) throw new Error(`SSRF blocked: ${ssrf.reason}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "BlockID-Bot/1.0 (+https://blockid.au)" },
    });
    const html = await res.text();

    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)?.[1]?.trim() ?? "";

    // Extract tech hints from script src
    const techHints: string[] = [];
    const scriptSrcs = html.matchAll(/src=["']([^"']*)/gi);
    for (const m of scriptSrcs) {
      const src = m[1].toLowerCase();
      if (src.includes("react")) techHints.push("React");
      if (src.includes("vue")) techHints.push("Vue");
      if (src.includes("angular")) techHints.push("Angular");
      if (src.includes("next")) techHints.push("Next.js");
      if (src.includes("stripe")) techHints.push("Stripe");
      if (src.includes("gtag") || src.includes("analytics")) techHints.push("Google Analytics");
      if (src.includes("intercom")) techHints.push("Intercom");
      if (src.includes("crisp")) techHints.push("Crisp");
      if (src.includes("hotjar")) techHints.push("Hotjar");
    }

    // Strip HTML tags for plain text (limit to 8000 chars)
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    return { title, description: desc, text, techHints: [...new Set(techHints)] };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Deep Tech Audit ────────────────────────────────────────────────────────

export async function deepTechAudit(url: string): Promise<TechAuditResult> {
  let fullUrl = url.trim();
  if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

  const ssrf = isSafeUrl(fullUrl);
  if (!ssrf.ok) return buildFailedAudit(fullUrl);

  const cached = getCachedAudit(fullUrl);
  if (cached) return cached;

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let html = "";
  let responseHeaders: Headers = new Headers();
  let statusCode = 0;
  let ttfbMs = 0;
  let pageSizeBytes = 0;

  try {
    const fetchStart = Date.now();
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "BlockID-Bot/1.0 (+https://blockid.au)" },
    });
    ttfbMs = Date.now() - fetchStart;
    statusCode = res.status;
    responseHeaders = res.headers;
    html = await res.text();
    pageSizeBytes = new TextEncoder().encode(html).length;
  } catch {
    // Return minimal audit on fetch failure
    return buildFailedAudit(fullUrl);
  } finally {
    clearTimeout(timeout);
  }

  const lowerHtml = html.toLowerCase();

  // ── 1. Security Audit ──────────────────────────────────────────────────
  const isHttps = fullUrl.startsWith("https://");
  const hstsHeader = responseHeaders.get("strict-transport-security");
  const cspHeader = responseHeaders.get("content-security-policy");
  const xfo = responseHeaders.get("x-frame-options");
  const xcto = responseHeaders.get("x-content-type-options");
  const refPolicy = responseHeaders.get("referrer-policy");
  const permPolicy = responseHeaders.get("permissions-policy");

  const secHeaders = {
    csp: !!cspHeader,
    hsts: !!hstsHeader,
    xFrameOptions: !!xfo,
    xContentType: !!xcto,
    referrerPolicy: !!refPolicy,
    permissionsPolicy: !!permPolicy,
  };
  const headerCount = Object.values(secHeaders).filter(Boolean).length;

  let secGrade: SecurityAudit["grade"] = "F";
  if (isHttps && headerCount >= 5) secGrade = "A";
  else if (isHttps && headerCount >= 3) secGrade = "B";
  else if (isHttps && headerCount >= 1) secGrade = "C";
  else if (isHttps) secGrade = "D";

  const security: SecurityAudit = {
    ssl: {
      valid: isHttps && statusCode < 400,
      issuer: responseHeaders.get("server") ?? "unknown",
      protocol: isHttps ? "TLS 1.2+" : "none",
      expiresAt: null,
    },
    headers: secHeaders,
    headerCount,
    grade: secGrade,
  };

  // ── 2. Performance Audit ───────────────────────────────────────────────
  const encoding = responseHeaders.get("content-encoding");
  const compressed = !!encoding;
  const cacheCtrl = responseHeaders.get("cache-control");
  const etag = responseHeaders.get("etag");

  let perfGrade: PerformanceAudit["grade"] = "C";
  if (ttfbMs < 300 && compressed) perfGrade = "A";
  else if (ttfbMs < 500) perfGrade = "B";
  else if (ttfbMs < 1000) perfGrade = "C";
  else if (ttfbMs < 2000) perfGrade = "D";
  else perfGrade = "F";

  const performance: PerformanceAudit = {
    ttfbMs,
    pageSizeBytes,
    compressed,
    compressionType: encoding,
    cacheControl: !!cacheCtrl,
    etag: !!etag,
    grade: perfGrade,
  };

  // ── 3. Tech Stack Detection ────────────────────────────────────────────
  const frameworks: string[] = [];
  const cssFrameworks: string[] = [];
  const analytics: string[] = [];
  const payments: string[] = [];
  const customerTools: string[] = [];

  // Frameworks (from HTML content, script srcs, meta generators)
  if (lowerHtml.includes("__next") || lowerHtml.includes("/_next/")) frameworks.push("Next.js");
  if (lowerHtml.includes("react") || lowerHtml.includes("__reactfiber") || lowerHtml.includes("data-reactroot")) frameworks.push("React");
  if (lowerHtml.includes("vue") || lowerHtml.includes("__vue")) frameworks.push("Vue");
  if (lowerHtml.includes("ng-") || lowerHtml.includes("angular")) frameworks.push("Angular");
  if (lowerHtml.includes("svelte") || lowerHtml.includes("__svelte")) frameworks.push("Svelte");
  if (lowerHtml.includes("nuxt") || lowerHtml.includes("__nuxt")) frameworks.push("Nuxt");
  if (lowerHtml.includes("gatsby")) frameworks.push("Gatsby");
  if (lowerHtml.includes("remix")) frameworks.push("Remix");

  // CSS Frameworks
  if (lowerHtml.includes("tailwind") || html.match(/class="[^"]*(?:flex|grid|px-|py-|bg-|text-)[^"]*"/)) cssFrameworks.push("Tailwind CSS");
  if (lowerHtml.includes("bootstrap")) cssFrameworks.push("Bootstrap");
  if (lowerHtml.includes("material") || lowerHtml.includes("mui")) cssFrameworks.push("Material UI");
  if (lowerHtml.includes("chakra")) cssFrameworks.push("Chakra UI");
  if (lowerHtml.includes("ant-") || lowerHtml.includes("antd")) cssFrameworks.push("Ant Design");

  // CMS Detection
  let cms: string | null = null;
  if (lowerHtml.includes("wp-content") || lowerHtml.includes("wordpress")) cms = "WordPress";
  else if (lowerHtml.includes("shopify") || lowerHtml.includes("cdn.shopify")) cms = "Shopify";
  else if (lowerHtml.includes("webflow")) cms = "Webflow";
  else if (lowerHtml.includes("wix.com") || lowerHtml.includes("wixstatic")) cms = "Wix";
  else if (lowerHtml.includes("squarespace")) cms = "Squarespace";
  else if (lowerHtml.includes("ghost")) cms = "Ghost";
  else if (lowerHtml.includes("framer")) cms = "Framer";

  // CDN Detection
  let cdn: string | null = null;
  const serverHeader = (responseHeaders.get("server") ?? "").toLowerCase();
  const viaHeader = (responseHeaders.get("via") ?? "").toLowerCase();
  const cfRay = responseHeaders.get("cf-ray");
  if (cfRay || serverHeader.includes("cloudflare")) cdn = "Cloudflare";
  else if (serverHeader.includes("vercel") || responseHeaders.get("x-vercel-id")) cdn = "Vercel";
  else if (viaHeader.includes("cloudfront") || responseHeaders.get("x-amz-cf-id")) cdn = "AWS CloudFront";
  else if (serverHeader.includes("netlify") || responseHeaders.get("x-nf-request-id")) cdn = "Netlify";
  else if (serverHeader.includes("fastly")) cdn = "Fastly";
  else if (serverHeader.includes("akamai")) cdn = "Akamai";

  // Hosting Detection
  let hosting: string | null = cdn;
  if (!hosting) {
    if (serverHeader.includes("gws") || serverHeader.includes("google")) hosting = "Google Cloud";
    else if (serverHeader.includes("amazons3") || serverHeader.includes("awselb")) hosting = "AWS";
    else if (serverHeader.includes("azure")) hosting = "Azure";
    else if (serverHeader.includes("heroku")) hosting = "Heroku";
    else if (serverHeader.includes("digitalocean")) hosting = "DigitalOcean";
    else if (serverHeader.includes("railway")) hosting = "Railway";
    else if (serverHeader.includes("render")) hosting = "Render";
  }

  // Server Tech
  const xPoweredBy = responseHeaders.get("x-powered-by");
  let serverTech: string | null = null;
  if (xPoweredBy) {
    if (xPoweredBy.toLowerCase().includes("express")) serverTech = "Express.js";
    else if (xPoweredBy.toLowerCase().includes("php")) serverTech = "PHP";
    else if (xPoweredBy.toLowerCase().includes("asp.net")) serverTech = "ASP.NET";
    else serverTech = xPoweredBy;
  } else if (serverHeader.includes("nginx")) {
    serverTech = "nginx";
  } else if (serverHeader.includes("apache")) {
    serverTech = "Apache";
  }

  // Analytics
  if (lowerHtml.includes("gtag") || lowerHtml.includes("google-analytics") || lowerHtml.includes("ga4")) analytics.push("Google Analytics");
  if (lowerHtml.includes("googletagmanager") || lowerHtml.includes("gtm.js")) analytics.push("Google Tag Manager");
  if (lowerHtml.includes("segment") || lowerHtml.includes("analytics.js")) analytics.push("Segment");
  if (lowerHtml.includes("mixpanel")) analytics.push("Mixpanel");
  if (lowerHtml.includes("amplitude")) analytics.push("Amplitude");
  if (lowerHtml.includes("hotjar") || lowerHtml.includes("hj(")) analytics.push("Hotjar");
  if (lowerHtml.includes("fullstory")) analytics.push("FullStory");
  if (lowerHtml.includes("clarity.ms") || lowerHtml.includes("microsoft clarity")) analytics.push("Microsoft Clarity");
  if (lowerHtml.includes("plausible")) analytics.push("Plausible");
  if (lowerHtml.includes("posthog")) analytics.push("PostHog");

  // Payments
  if (lowerHtml.includes("stripe") || lowerHtml.includes("js.stripe.com")) payments.push("Stripe");
  if (lowerHtml.includes("paypal")) payments.push("PayPal");
  if (lowerHtml.includes("square")) payments.push("Square");
  if (lowerHtml.includes("braintree")) payments.push("Braintree");
  if (lowerHtml.includes("paddle")) payments.push("Paddle");
  if (lowerHtml.includes("lemonsqueezy")) payments.push("Lemon Squeezy");

  // Customer Tools
  if (lowerHtml.includes("intercom")) customerTools.push("Intercom");
  if (lowerHtml.includes("crisp")) customerTools.push("Crisp");
  if (lowerHtml.includes("zendesk")) customerTools.push("Zendesk");
  if (lowerHtml.includes("freshdesk") || lowerHtml.includes("freshchat")) customerTools.push("Freshdesk");
  if (lowerHtml.includes("hubspot")) customerTools.push("HubSpot");
  if (lowerHtml.includes("drift")) customerTools.push("Drift");
  if (lowerHtml.includes("tawk.to") || lowerHtml.includes("tawk")) customerTools.push("Tawk.to");

  const techStack: TechStackAudit = {
    frameworks: [...new Set(frameworks)],
    cssFrameworks: [...new Set(cssFrameworks)],
    cms,
    cdn,
    analytics: [...new Set(analytics)],
    payments: [...new Set(payments)],
    customerTools: [...new Set(customerTools)],
    hosting,
    serverTech,
  };

  // ── 4. Product Maturity ────────────────────────────────────────────────
  const hasOpenGraph = lowerHtml.includes('property="og:') || lowerHtml.includes("property='og:");
  const hasTwitterCards = lowerHtml.includes('name="twitter:') || lowerHtml.includes("name='twitter:");
  const hasStructuredData = lowerHtml.includes("application/ld+json") || hasOpenGraph;
  const hasViewportMeta = lowerHtml.includes('name="viewport"') || lowerHtml.includes("name='viewport'");
  const hasPWA = lowerHtml.includes("manifest.json") || lowerHtml.includes("manifest.webmanifest") || lowerHtml.includes("serviceworker") || lowerHtml.includes("service-worker");
  const hasMultiLang = lowerHtml.includes('hreflang="') || lowerHtml.includes("hreflang='") || lowerHtml.includes('lang="en"') && lowerHtml.includes("lang=");
  const hasLoginForm = lowerHtml.includes('type="password"') || lowerHtml.includes("type='password'") || lowerHtml.includes("/login") || lowerHtml.includes("/signin") || lowerHtml.includes("/sign-in");
  const hasDashboard = lowerHtml.includes("/dashboard") || lowerHtml.includes("/admin") || lowerHtml.includes("/app") || lowerHtml.includes("/console");
  const hasTestimonials = lowerHtml.includes("testimonial") || lowerHtml.includes("review") || lowerHtml.includes("trusted by") || lowerHtml.includes("what our");
  const hasCustomerLogos = lowerHtml.includes("customer") && lowerHtml.includes("logo") || lowerHtml.includes("trusted by") || lowerHtml.includes("used by") || lowerHtml.includes("partners");

  // Social links
  const socialLinks: string[] = [];
  if (lowerHtml.includes("linkedin.com")) socialLinks.push("LinkedIn");
  if (lowerHtml.includes("twitter.com") || lowerHtml.includes("x.com")) socialLinks.push("Twitter/X");
  if (lowerHtml.includes("instagram.com")) socialLinks.push("Instagram");
  if (lowerHtml.includes("facebook.com")) socialLinks.push("Facebook");
  if (lowerHtml.includes("youtube.com")) socialLinks.push("YouTube");
  if (lowerHtml.includes("tiktok.com")) socialLinks.push("TikTok");
  if (lowerHtml.includes("discord.gg") || lowerHtml.includes("discord.com")) socialLinks.push("Discord");
  if (lowerHtml.includes("t.me") || lowerHtml.includes("telegram")) socialLinks.push("Telegram");

  // GitHub link
  const ghMatch = html.match(/href=["'](https?:\/\/github\.com\/[^"'#\s]+)/i);
  const githubLink = ghMatch ? ghMatch[1] : null;

  // Sitemap & robots (parallel fire-and-forget checks)
  let hasSitemap = false;
  let sitemapPageCount = 0;
  let hasRobotsTxt = false;

  const parsedUrl = new URL(fullUrl);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

  const [sitemapRes, robotsRes] = await Promise.allSettled([
    fetch(`${baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "BlockID-Bot/1.0" } }),
    fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "BlockID-Bot/1.0" } }),
  ]);

  if (sitemapRes.status === "fulfilled" && sitemapRes.value.ok) {
    hasSitemap = true;
    const sitemapText = await sitemapRes.value.text().catch(() => "");
    sitemapPageCount = (sitemapText.match(/<loc>/gi) || []).length;
  }
  if (robotsRes.status === "fulfilled" && robotsRes.value.ok) {
    hasRobotsTxt = true;
  }

  const productMaturity: ProductMaturityAudit = {
    hasSitemap,
    sitemapPageCount,
    hasRobotsTxt,
    hasStructuredData,
    hasOpenGraph,
    hasTwitterCards,
    hasPWA,
    hasViewportMeta,
    hasMultiLang,
    hasLoginForm,
    hasDashboard,
    hasTestimonials,
    hasCustomerLogos,
    socialLinks: [...new Set(socialLinks)],
    githubLink,
  };

  // ── 5. Compute Signal Boosts ──────────────────────────────────────────
  let ptdBoost = 0;
  let svmBoost = 0;
  let treBoost = 0;
  let lcoBoost = 0;

  // PTD boosts
  if (frameworks.length > 0) ptdBoost += 5;
  if (security.ssl.valid) ptdBoost += 3;
  if (headerCount >= 3) ptdBoost += 5;
  if (ttfbMs < 500) ptdBoost += 3;
  if (cdn) ptdBoost += 3;
  if (analytics.length > 0) ptdBoost += 2;
  if (payments.length > 0) ptdBoost += 5;
  if (hasPWA) ptdBoost += 3;
  if (hasSitemap) ptdBoost += 2;
  if (hasViewportMeta) ptdBoost += 2;

  // PTD penalties
  if (!isHttps) ptdBoost -= 8;
  if (headerCount === 0) ptdBoost -= 5;
  if (ttfbMs > 2000) ptdBoost -= 3;

  // SVM boosts — custom tech = higher moat
  const isGenericCMS = cms === "Wix" || cms === "Squarespace";
  if (!isGenericCMS && !cms) svmBoost += 5;
  if (lowerHtml.includes("graphql") || lowerHtml.includes("/api/v")) svmBoost += 5;
  if (analytics.length >= 2) svmBoost += 3;

  // SVM penalties
  if (isGenericCMS) svmBoost -= 3;

  // TRE boosts — social presence, testimonials = traction
  if (socialLinks.length >= 2) treBoost += 3;
  if (hasTestimonials || hasCustomerLogos) treBoost += 5;
  if (analytics.length > 0) treBoost += 2;

  // LCO boosts — security = compliance maturity
  if (isHttps && headerCount >= 3) lcoBoost += 3;

  // ── 6. Overall Grade ──────────────────────────────────────────────────
  const gradeMap: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const avgGrade = (gradeMap[secGrade] + gradeMap[perfGrade]) / 2;
  const techBonus = frameworks.length > 0 ? 0.5 : 0;
  const overallNum = avgGrade + techBonus;
  let overallGrade: TechAuditResult["overallGrade"] = "C";
  if (overallNum >= 3.5) overallGrade = "A";
  else if (overallNum >= 2.5) overallGrade = "B";
  else if (overallNum >= 1.5) overallGrade = "C";
  else if (overallNum >= 0.5) overallGrade = "D";
  else overallGrade = "F";

  // ── 7. Evidence Labels ────────────────────────────────────────────────
  const evidenceLabels: string[] = [];
  if (frameworks.length > 0) evidenceLabels.push(`Tech: ${[...frameworks, ...cssFrameworks].join(", ")}`);
  if (cms) evidenceLabels.push(`CMS: ${cms}`);
  if (cdn) evidenceLabels.push(`CDN: ${cdn}`);
  if (hosting && hosting !== cdn) evidenceLabels.push(`Hosting: ${hosting}`);
  evidenceLabels.push(`Security: Grade ${secGrade} (${headerCount}/6 headers)`);
  evidenceLabels.push(`Performance: TTFB ${ttfbMs}ms, Size ${Math.round(pageSizeBytes / 1024)}KB`);
  if (payments.length > 0) evidenceLabels.push(`Payments: ${payments.join(", ")}`);
  if (analytics.length > 0) evidenceLabels.push(`Analytics: ${analytics.join(", ")}`);
  if (customerTools.length > 0) evidenceLabels.push(`Support: ${customerTools.join(", ")}`);
  if (hasSitemap) evidenceLabels.push(`Sitemap: ${sitemapPageCount} pages`);

  const result: TechAuditResult = {
    url: fullUrl,
    auditedAt: new Date().toISOString(),
    security,
    performance,
    techStack,
    productMaturity,
    overallGrade,
    signalBoosts: { ptdBoost, svmBoost, treBoost, lcoBoost },
    evidenceLabels,
  };

  setCachedAudit(fullUrl, result);
  return result;
}

function buildFailedAudit(url: string): TechAuditResult {
  return {
    url,
    auditedAt: new Date().toISOString(),
    security: {
      ssl: { valid: false, issuer: "unknown", protocol: "none", expiresAt: null },
      headers: { csp: false, hsts: false, xFrameOptions: false, xContentType: false, referrerPolicy: false, permissionsPolicy: false },
      headerCount: 0,
      grade: "F",
    },
    performance: { ttfbMs: -1, pageSizeBytes: 0, compressed: false, compressionType: null, cacheControl: false, etag: false, grade: "F" },
    techStack: { frameworks: [], cssFrameworks: [], cms: null, cdn: null, analytics: [], payments: [], customerTools: [], hosting: null, serverTech: null },
    productMaturity: { hasSitemap: false, sitemapPageCount: 0, hasRobotsTxt: false, hasStructuredData: false, hasOpenGraph: false, hasTwitterCards: false, hasPWA: false, hasViewportMeta: false, hasMultiLang: false, hasLoginForm: false, hasDashboard: false, hasTestimonials: false, hasCustomerLogos: false, socialLinks: [], githubLink: null },
    overallGrade: "F",
    signalBoosts: { ptdBoost: -8, svmBoost: 0, treBoost: 0, lcoBoost: 0 },
    evidenceLabels: ["Website unreachable — audit failed"],
  };
}
