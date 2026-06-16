// Project name extraction from user input.
//
// Given the raw text, optional scraped website data, and optional filename,
// derive a clean, human-readable project name. Used to auto-name new
// SVI analyses so the founder doesn't have to type one.
//
// Strategy (best → fallback):
//   1. Scraped <title> → strip tagline noise ("BlockID — Tagline" → "BlockID")
//   2. og:site_name / explicit brand markers in scraped content
//   3. URL hostname root ("https://www.blockid.au/foo" → "BlockID")
//   4. First proper noun from rawText
//   5. Filename without extension
//   6. "Untitled Startup" (last resort)
//
// Output is title-cased, max 60 chars, no trailing punctuation.

export interface ProjectNameResult {
  name: string;
  confidence: "high" | "medium" | "low";
  source: "scraped-title" | "scraped-og" | "url-hostname" | "first-noun" | "filename" | "fallback";
}

const TAGLINE_SEPARATORS = [" — ", " – ", " | ", " :: ", " - ", ": ", ". "];

const NOISE_WORDS = new Set([
  "home", "homepage", "index", "untitled", "page", "welcome",
  "the", "a", "an", "for", "and", "or", "of", "with", "to",
]);

const COMMON_TLD_PARTS = new Set([
  "www", "app", "io", "ai", "co", "com", "net", "org", "au", "us", "uk", "nz",
]);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function cleanName(raw: string): string {
  return raw
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .slice(0, 60);
}

function isJunkName(s: string): boolean {
  const lower = s.toLowerCase().trim();
  if (lower.length < 2 || lower.length > 60) return true;
  if (NOISE_WORDS.has(lower)) return true;
  // Reject pure URLs / paths
  if (/^https?:\/\//.test(lower)) return true;
  if (/^[\d\s\-_.]+$/.test(lower)) return true;
  return false;
}

/** Strip common tagline suffixes like " — Best Tool for X" off a page title. */
function stripTagline(rawTitle: string): string {
  let title = rawTitle.trim();
  for (const sep of TAGLINE_SEPARATORS) {
    const idx = title.indexOf(sep);
    if (idx > 0 && idx < title.length / 2 + 5) {
      // Heuristic: brand name usually comes first if separator is in first half
      title = title.slice(0, idx).trim();
      break;
    }
  }
  return title;
}

function fromHostname(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const parts = u.hostname.split(".").filter((p) => !COMMON_TLD_PARTS.has(p));
    if (parts.length === 0) return null;
    // Take the most-specific non-TLD part
    const root = parts[0];
    if (root.length < 2) return null;
    // PascalCase if contains dashes, otherwise capitalize
    const name = root
      .split(/[-_]/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join("");
    return cleanName(name);
  } catch {
    return null;
  }
}

/** Extract og:site_name or application-name meta from scraped HTML if it's still raw. */
function fromOgMeta(scrapedText: string | undefined): string | null {
  if (!scrapedText) return null;
  // Already-stripped text won't have meta tags — only useful if we have raw HTML
  const ogMatch = scrapedText.match(/og:site_name["']?\s*content=["']([^"']+)/i);
  if (ogMatch?.[1]) {
    const cleaned = cleanName(ogMatch[1]);
    if (!isJunkName(cleaned)) return cleaned;
  }
  const appMatch = scrapedText.match(/application-name["']?\s*content=["']([^"']+)/i);
  if (appMatch?.[1]) {
    const cleaned = cleanName(appMatch[1]);
    if (!isJunkName(cleaned)) return cleaned;
  }
  return null;
}

/** Find the first capitalised proper-noun phrase in the text. */
function firstProperNoun(text: string): string | null {
  // Skip URLs, emails, IDs
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\b\d+\b/g, " ");

  // Look for capitalised sequence at start (1-3 words)
  const match = cleaned.match(/\b([A-Z][a-zA-Z0-9]{1,}(?:\s+[A-Z][a-zA-Z0-9]{1,}){0,2})\b/);
  if (!match) return null;
  const candidate = cleanName(match[1]);
  if (isJunkName(candidate)) return null;
  return candidate;
}

function fromFilename(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const cleaned = cleanName(titleCase(base));
  return isJunkName(cleaned) ? null : cleaned;
}

export interface ExtractInput {
  rawText: string;
  fileName?: string;
  scraped?: {
    title?: string;
    description?: string;
    rawHtml?: string; // optional raw HTML if we want meta extraction
  };
  url?: string;
}

export function extractProjectName(input: ExtractInput): ProjectNameResult {
  // 1. Scraped title (highest signal when present)
  if (input.scraped?.title) {
    const stripped = stripTagline(input.scraped.title);
    const cleaned = cleanName(stripped);
    if (!isJunkName(cleaned)) {
      return { name: cleaned, confidence: "high", source: "scraped-title" };
    }
  }

  // 2. og:site_name / application-name from raw HTML
  const ogName = fromOgMeta(input.scraped?.rawHtml);
  if (ogName) {
    return { name: ogName, confidence: "high", source: "scraped-og" };
  }

  // 3. URL hostname (medium confidence — brand might not match domain)
  const url = input.url ?? (input.rawText.match(/https?:\/\/\S+/)?.[0]);
  if (url) {
    const fromUrl = fromHostname(url);
    if (fromUrl && !isJunkName(fromUrl)) {
      return { name: fromUrl, confidence: "medium", source: "url-hostname" };
    }
  }

  // 4. First proper-noun phrase in text
  const fromText = firstProperNoun(input.rawText);
  if (fromText) {
    return { name: fromText, confidence: "low", source: "first-noun" };
  }

  // 5. Filename
  const fromFile = fromFilename(input.fileName);
  if (fromFile) {
    return { name: fromFile, confidence: "low", source: "filename" };
  }

  // 6. Fallback
  return { name: "Untitled Startup", confidence: "low", source: "fallback" };
}
