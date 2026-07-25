/**
 * Runtime machine-translation engine (T-1403).
 *
 * Engine: Google Gemini 2.5 Flash via REST — same fetch pattern as
 * `src/lib/ai-client.ts` (workerFetch is only needed there because of
 * Next's fetch cache patches; we use plain fetch here since the
 * translate endpoint is `no-store` by construction).
 *
 * Coverage: strings that are NOT in the hand-authored VI catalog are
 * routed through this engine. The result is written to
 * `content/i18n/vi-cache.json` (see translate-cache.ts) so subsequent
 * calls resolve in-memory without an API hop.
 *
 * Reserved-terms guard: the system prompt enumerates the AU statutory
 * shorthand + brand names that MUST NOT be translated. Post-check:
 * `containsReservedDrift(en, out)` — if any reserved token disappeared
 * we discard the translation and fall back to EN. This satisfies the
 * house rule in docs/goal-5d-t1400-i18n-notes.md §2.
 *
 * Server-only.
 */

import "server-only";
import type { Locale } from "./locales";
import { DEFAULT_LOCALE } from "./locales";
import { RESERVED_TERMS, containsReservedDrift } from "./reserved-terms";
import { cacheGetMany, cacheSetMany } from "./translate-cache";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CALL_TIMEOUT_MS = 15_000;
const MAX_BATCH = 40;

const LOCALE_LABEL: Readonly<Record<Locale, string>> = {
  en: "English (Australian, en-AU)",
  vi: "Vietnamese (tiếng Việt) written in natural business register for Vietnamese-Australian founders",
};

function apiKey(): string {
  return process.env.GOOGLE_GEMINI_API_KEY ?? "";
}

/**
 * Translate a batch of strings from EN to `target`. Returns a map keyed
 * by the input string. Strings that resolve from cache never hit the
 * network. Strings that fail translation (network error, drift, empty
 * response) are returned unchanged so the caller always gets a full
 * result set.
 */
export async function translateBatch(
  ens: string[],
  target: Locale,
): Promise<Record<string, string>> {
  if (target === DEFAULT_LOCALE) {
    // Identity: EN → EN is a no-op.
    const out: Record<string, string> = {};
    for (const s of ens) out[s] = s;
    return out;
  }

  const unique = dedupe(ens.filter((s) => shouldTranslate(s)));
  if (unique.length === 0) {
    const out: Record<string, string> = {};
    for (const s of ens) out[s] = s;
    return out;
  }

  const cached = await cacheGetMany(target, unique);
  const missing = unique.filter((s) => !(s in cached));

  const fresh: Record<string, string> = {};
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const slice = missing.slice(i, i + MAX_BATCH);
    const translated = await callGeminiBatch(slice, target).catch(() => null);
    if (!translated) continue;
    for (const [en, vi] of Object.entries(translated)) {
      const drift = containsReservedDrift(en, vi);
      if (drift.length > 0) continue; // reject: reserved token was translated away
      if (!vi || vi === en) continue;
      fresh[en] = vi;
    }
  }

  if (Object.keys(fresh).length > 0) {
    await cacheSetMany(target, fresh).catch(() => {});
  }

  const out: Record<string, string> = {};
  for (const s of ens) {
    if (!shouldTranslate(s)) {
      out[s] = s;
      continue;
    }
    out[s] = fresh[s] ?? cached[s] ?? s;
  }
  return out;
}

export async function translateText(en: string, target: Locale): Promise<string> {
  const result = await translateBatch([en], target);
  return result[en] ?? en;
}

/**
 * Filter: skip strings that are too short, all-numeric, URLs, or
 * mostly whitespace — translating them wastes API budget and often
 * corrupts (e.g. a version tag "v2.0" translated as "phiên bản 2.0"
 * breaks CSS selectors and analytics filters).
 */
export function shouldTranslate(s: string): boolean {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;
  if (trimmed.length > 4000) return false; // model context guard
  if (/^[\d\s.,+\-*/=()%$€£¥₫]+$/.test(trimmed)) return false; // pure numeric/formula
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^[\w-]+@[\w.-]+$/.test(trimmed)) return false; // email
  if (!/[a-zA-Z]/.test(trimmed)) return false; // no letters
  return true;
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

async function callGeminiBatch(
  ens: string[],
  target: Locale,
): Promise<Record<string, string> | null> {
  const key = apiKey();
  if (!key) return null;

  const system = [
    `You are a professional translator. Translate each of the numbered items from English (Australian) to ${LOCALE_LABEL[target]}.`,
    `Preserve ALL of the following terms VERBATIM (do NOT translate, do NOT re-case, do NOT expand): ${RESERVED_TERMS.join(", ")}.`,
    `Also preserve verbatim: any all-uppercase acronym; any dollar amount ("$99", "AUD 1,000"); any section reference like "s708", "Regulation 7.1.29"; any URL; any inline code inside backticks.`,
    `Register: pragmatic business Vietnamese. Do NOT translate the meaning literally when a natural business idiom exists. Write for a Vietnamese-Australian founder who reads business Vietnamese.`,
    `Output: ONLY a JSON object mapping the input index (as a string) to the translated string. No commentary, no code fences. Example: {"1":"…","2":"…"}`,
  ].join("\n");

  const user = ens.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  let raw: string;
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) return null;
    raw = await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  let data: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data.error) return null;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) return null;

  let indexed: Record<string, string>;
  try {
    indexed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < ens.length; i++) {
    const v = indexed[String(i + 1)];
    if (typeof v === "string" && v.length > 0) out[ens[i]!] = v;
  }
  return out;
}

function stripFences(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}
