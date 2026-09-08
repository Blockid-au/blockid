// Context-aware backend intake pipeline — Block 1.
//
// Classifies free-form founder input into one of four shapes:
//   - pitch_deck (PDF or PPTX buffer/file)
//   - website (URL string)
//   - idea_text (short free text)
//   - existing_company_text (longer text describing a real running company)
//
// Fast-path regex first (URL / DOMAIN via `rnd-input.detectInputType`);
// ambiguous free text falls back to ONE Haiku 4.5 JSON call.

import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectInputType, scrapeUrl } from "@/lib/rnd-input";
import { splitDeckToSections, type DeckSections } from "./deck-sections";
import { extractSignals, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { detectContext, type IntakeContext } from "./detect-context";
import { extractFileText } from "@/lib/guest-analysis/runner";
import { callAI } from "@/lib/ai-client";

export type InputKind =
  | "pitch_deck"
  | "website"
  | "idea_text"
  | "existing_company_text";

export interface IntakeFileInput {
  /** Original filename (used for extension sniffing). */
  filename: string;
  /** Raw file bytes. */
  buffer: Buffer;
  /** Optional MIME hint. */
  mimeType?: string;
}

export interface IntakeInput {
  text?: string;
  url?: string;
  file?: IntakeFileInput;
}

export interface IntakeStructured {
  slides?: string[];
  pages?: { url: string; text: string }[];
  deckSections?: DeckSections;
}

export interface IntakeResult {
  inputKind: InputKind;
  confidence: number;               // 0..1
  rawText: string;                  // canonical text used downstream
  structured: IntakeStructured;
  signals: SVIExtractedSignals;
  /**
   * Composite context derived from signals + maturity + growth-phase.
   * Attached by `analyzeInput` before returning so downstream callers
   * (agent selector, cost estimator) can pick the right wave.
   */
  context?: IntakeContext;
  /** Optional next-step suggestion for the caller. */
  suggestedNext?: string;
  /** Debug / observability. */
  classifierMode: "regex" | "file" | "llm" | "hybrid";
  warnings?: string[];
}

// ─── Regex heuristics ──────────────────────────────────────────────────────

const URL_LIKE = /^\s*(https?:\/\/|www\.)|(\.(com|au|io|co|ai|net|org|app|dev|xyz|nz|uk)(\/|$))/i;
const IDEA_HINTS =
  /\b(idea|concept|thinking of building|we plan|we want to build|pre-?revenue|pre-?product|early stage|building an?|going to build|would like to|aim to build)\b/i;
const EXISTING_HINTS =
  /\b(founded in|incorporated|abn\s*\d|our customers|our users|mrr|arr|revenue of|paying customers|series [abcde]|raised \$|hired|team of \d+|employees|our platform is live|launched in|since 20\d{2})\b/i;

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
}

function isPptxBuffer(buf: Buffer): boolean {
  // PPTX is a zip container → starts with PK\x03\x04
  if (buf.length < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

// ─── File extractors ───────────────────────────────────────────────────────

async function writeBufferToTemp(buffer: Buffer, filename: string): Promise<string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "intake-"));
  const p = path.join(tmpDir, safe || "upload.bin");
  await fs.writeFile(p, buffer);
  return p;
}

async function extractPptxSlides(buffer: Buffer): Promise<string[]> {
  try {
    // node-pptx-parser has an async loader; import dynamically so a missing
    // dep never breaks type-check or dev boot.
    const mod = (await import("node-pptx-parser")) as {
      default?: unknown;
      PPTXParser?: unknown;
    };
    // The package exports a default class in most versions.
    const Ctor = (mod as { default?: new (path: string) => unknown }).default
      ?? (mod as { PPTXParser?: new (path: string) => unknown }).PPTXParser;
    if (typeof Ctor !== "function") return [];
    const tmpPath = await writeBufferToTemp(buffer, "deck.pptx");
    const parser = new (Ctor as new (p: string) => {
      extractText?: () => Promise<Array<{ text?: string; slideNumber?: number }>>;
    })(tmpPath);
    if (typeof parser.extractText !== "function") return [];
    const slides = await parser.extractText();
    return slides.map(s => (s?.text ?? "").trim()).filter(Boolean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[intake] pptx parse failed", msg);
    return [];
  }
}

async function extractPdfSlides(buffer: Buffer): Promise<{ text: string; slides: string[] }> {
  const tmpPath = await writeBufferToTemp(buffer, "deck.pdf");
  const text = await extractFileText(tmpPath, "deck.pdf");
  // Rough slide split: pdf-parse joins pages with \f (form feed) when present;
  // otherwise fall back to blank-line clusters of >= 40 chars.
  const byFormFeed = text.split(/\f/g).map(s => s.trim()).filter(s => s.length > 20);
  if (byFormFeed.length >= 3) return { text, slides: byFormFeed };
  const byBlank = text
    .split(/\n{2,}/g)
    .map(s => s.trim())
    .filter(s => s.length >= 40);
  return { text, slides: byBlank.slice(0, 40) };
}

// ─── LLM classifier fallback ───────────────────────────────────────────────

interface LlmClassification {
  kind: InputKind;
  confidence: number;
  reason: string;
}

async function classifyWithHaiku(text: string): Promise<LlmClassification | null> {
  const sample = text.trim().slice(0, 800);
  if (!sample) return null;
  const system = [
    "You classify short founder inputs into ONE of four categories.",
    "Categories:",
    "- pitch_deck: extracted slide text from a pitch deck",
    "- website: a URL, domain, or 'we ship at foo.com'-style URL statement",
    "- idea_text: an early-stage IDEA the founder is exploring; pre-revenue, pre-product, exploratory language",
    "- existing_company_text: a description of a REAL running company with product, customers, employees, or revenue",
    "Return ONLY JSON: {\"kind\":\"...\",\"confidence\":0..1,\"reason\":\"<12 words\"}",
  ].join("\n");
  try {
    const res = await callAI({
      system,
      user: `INPUT:\n${sample}`,
      maxTokens: 120,
      temperature: 0,
      agentId: "intake-classifier",
      // Prefer Haiku 4.5 for cheap classification when available.
    });
    // Try to salvage JSON even if wrapped in markdown fencing.
    const match = res.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      kind?: string;
      confidence?: number;
      reason?: string;
    };
    const validKinds: InputKind[] = ["pitch_deck", "website", "idea_text", "existing_company_text"];
    if (!parsed.kind || !validKinds.includes(parsed.kind as InputKind)) return null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    return {
      kind: parsed.kind as InputKind,
      confidence,
      reason: (parsed.reason ?? "").slice(0, 120),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[intake] Haiku classifier failed", msg);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function analyzeInput(input: IntakeInput): Promise<IntakeResult> {
  const warnings: string[] = [];
  const text = (input.text ?? "").trim();

  // ── File path: pitch deck (PDF/PPTX) ───────────────────────────────────
  if (input.file) {
    const filename = input.file.filename.toLowerCase();
    const isPptx = filename.endsWith(".pptx") || isPptxBuffer(input.file.buffer);
    const isPdf = filename.endsWith(".pdf") || isPdfBuffer(input.file.buffer);

    let slides: string[] = [];
    let rawText = "";
    if (isPptx) {
      slides = await extractPptxSlides(input.file.buffer);
      rawText = slides.join("\n\n");
      if (!rawText) warnings.push("PPTX yielded no extractable text — consider OCR fallback");
    } else if (isPdf) {
      const out = await extractPdfSlides(input.file.buffer);
      slides = out.slides;
      rawText = out.text;
      if (!rawText.trim()) warnings.push("PDF yielded no extractable text — likely image-only, try /api/pitchdeck/ocr");
    } else if (/\.docx?$/.test(filename)) {
      const tmp = await writeBufferToTemp(input.file.buffer, input.file.filename);
      rawText = await extractFileText(tmp, input.file.filename);
      slides = rawText.split(/\n{2,}/g).map(s => s.trim()).filter(Boolean).slice(0, 40);
    } else {
      warnings.push(`Unrecognised file extension for ${input.file.filename}`);
      rawText = input.file.buffer.toString("utf-8").slice(0, 8000);
      slides = [rawText];
    }

    const deckSections = slides.length > 0 ? await splitDeckToSections(slides) : undefined;
    const combinedText = [rawText, text].filter(Boolean).join("\n\n");
    const signals = extractSignals({ rawText: combinedText, fileName: input.file.filename });
    const context = detectContext(signals, combinedText);

    return {
      inputKind: "pitch_deck",
      confidence: rawText.length > 200 ? 0.95 : 0.55,
      rawText: combinedText,
      structured: { slides, deckSections },
      signals,
      context,
      classifierMode: "file",
      suggestedNext: rawText.trim()
        ? "Run /api/svi/report-estimate with the returned `context` to price the deep dive."
        : "Try /api/pitchdeck/ocr — the PDF appears to be image-only.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ── URL path ───────────────────────────────────────────────────────────
  const urlCandidate = input.url ?? text;
  const detectedKind = detectInputType(urlCandidate);

  if (input.url || (detectedKind === "url" && URL_LIKE.test(urlCandidate))) {
    let scraped: { title: string; description: string; text: string; techHints: string[] } | null = null;
    try {
      scraped = await scrapeUrl(urlCandidate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Scrape failed: ${msg}`);
    }
    const rawText = scraped
      ? [scraped.title, scraped.description, scraped.text].filter(Boolean).join("\n\n")
      : urlCandidate;
    const signals = extractSignals({ rawText });
    const context = detectContext(signals, rawText, {
      url: urlCandidate,
      scraped: scraped
        ? { title: scraped.title, description: scraped.description, text: scraped.text }
        : undefined,
    });
    return {
      inputKind: "website",
      confidence: scraped ? 0.9 : 0.6,
      rawText,
      structured: scraped ? { pages: [{ url: urlCandidate, text: scraped.text }] } : {},
      signals,
      context,
      classifierMode: "regex",
      suggestedNext: "Run /api/site-crawl/stream for deeper BFS then request /api/svi/report-estimate.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ── Free text: decide idea vs existing-company ────────────────────────
  if (!text) {
    return {
      inputKind: "idea_text",
      confidence: 0,
      rawText: "",
      structured: {},
      signals: extractSignals({ rawText: "" }),
      classifierMode: "regex",
      suggestedNext: "No input received — pass `text`, `url`, or `file`.",
      warnings: ["empty input"],
    };
  }

  const shortText = text.length < 500;
  const looksLikeExisting = EXISTING_HINTS.test(text);
  const looksLikeIdea = IDEA_HINTS.test(text) || shortText;

  let kind: InputKind;
  let confidence: number;
  let mode: IntakeResult["classifierMode"] = "regex";

  if (looksLikeExisting && !looksLikeIdea) {
    kind = "existing_company_text";
    confidence = 0.75;
  } else if (looksLikeIdea && !looksLikeExisting) {
    kind = "idea_text";
    confidence = 0.75;
  } else {
    // Ambiguous → ONE Haiku call
    const llm = await classifyWithHaiku(text);
    if (llm) {
      kind = llm.kind;
      confidence = llm.confidence;
      mode = "llm";
    } else {
      kind = shortText ? "idea_text" : "existing_company_text";
      confidence = 0.4;
      mode = "hybrid";
      warnings.push("classifier fell back to length heuristic");
    }
  }

  const signals = extractSignals({ rawText: text });
  const context = detectContext(signals, text);
  return {
    inputKind: kind,
    confidence,
    rawText: text,
    structured: {},
    signals,
    context,
    classifierMode: mode,
    suggestedNext:
      kind === "idea_text"
        ? "Idea-stage input — recommend /api/svi/report-estimate with stage=idea (skips CFO valuation)."
        : "Existing company — run /api/svi/stage-classify then request the full estimate.",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
