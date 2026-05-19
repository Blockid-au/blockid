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

export async function scrapeUrl(url: string): Promise<{ title: string; description: string; text: string; techHints: string[] }> {
  let fullUrl = url.trim();
  if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

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
