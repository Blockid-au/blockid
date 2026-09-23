import { extractDocumentVisuals, type DocumentVisualResult } from "./visual-document";
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

import { detectInputType } from "@/lib/rnd-input";
import { splitDeckToSections, type DeckSections } from "./deck-sections";
import { extractSignals, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { detectContext, type IntakeContext } from "./detect-context";
import { extractPdfTextFromBuffer } from "@/lib/pdf/extract-text";
import { extractFileText } from "@/lib/guest-analysis/runner";
import { callAI } from "@/lib/ai-client";
import { captureInvestorIntent, type InvestorIntentSnapshot } from "./investor-intent";
import {
  createBusinessInputSnapshot,
  type BusinessInputSnapshot,
  type SnapshotSourceInput,
  type SnapshotUnitStatus,
} from "./input-snapshot";
import { extractVisualTranscript, visualTranscriptContext, VISUAL_TRANSCRIPT_WARNING, type VisualTranscriptSource } from "./visual-transcript";
import { acquireWebsiteCorpus, type WebsiteCorpus } from "./website-corpus";

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
  extractedUnits?: Array<{ locator: string; text: string; kind: "page" | "slide" | "text" }>;
  imageSource?: VisualTranscriptSource;
  documentVisuals?: Omit<DocumentVisualResult, "text">;
  pages?: {
    url: string;
    text: string;
    status?: SnapshotUnitStatus;
    title?: string;
    error?: string | null;
  }[];
  deckSections?: DeckSections;
}

export interface IntakeResult {
  aiBudgetScope?: string;
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
  /** Metadata-only input lineage. Raw content retention stays separately authorised. */
  inputSnapshot?: BusinessInputSnapshot;
  /** User decision request, kept separate from business claims and fetched content. */
  investorIntent?: InvestorIntentSnapshot;
}

// ─── Regex heuristics ──────────────────────────────────────────────────────

const URL_LIKE = /^\s*(https?:\/\/|www\.)|(\.(com|au|io|co|ai|net|org|app|dev|xyz|nz|uk)(\/|$))/i;
const IDEA_HINTS =
  /\b(idea|concept|thinking of building|we plan|we want to build|pre-?revenue|pre-?product|early stage|building an?|going to build|would like to|aim to build)\b/i;
const EXISTING_HINTS =
  /\b(founded in|incorporated|abn\s*\d|our customers|our users|mrr|arr|revenue of|paying customers|series [abcde]|raised \$|hired|team of \d+|employees|our platform is live|launched in|since 20\d{2})\b/i;

function isRasterBuffer(bytes: Buffer): boolean {
  const start = bytes.subarray(0, 12);
  return (start[0] === 0x89 && start.toString("ascii", 1, 4) === "PNG") ||
    (start[0] === 0xff && start[1] === 0xd8) ||
    (start.toString("ascii", 0, 4) === "RIFF" && start.toString("ascii", 8, 12) === "WEBP") ||
    /^GIF8/.test(start.toString("ascii")) ||
    (start[0] === 73 && start[1] === 73 && start[2] === 42) ||
    (start[0] === 77 && start[1] === 77 && start[3] === 42);
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
}

function isPptxBuffer(buf: Buffer): boolean {
  // PPTX is a zip container → starts with PK\x03\x04
  if (buf.length < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

// ─── File extractors ───────────────────────────────────────────────────────

type NativeUnit = { locator: string; text: string; kind: "page" | "slide" | "text" };

async function withTemporaryDocument<T>(buffer: Buffer, filename: string, read: (file: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "intake-"));
  try {
    await fs.chmod(directory, 0o700);
    const file = path.join(directory, filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "upload.bin");
    await fs.writeFile(file, buffer, { mode: 0o600 });
    return await read(file);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function extractPptxUnits(buffer: Buffer): Promise<NativeUnit[]> {
  try {
    const { default: Parser } = await import("node-pptx-parser");
    return await withTemporaryDocument(buffer, "deck.pptx", async file => {
      const slides = await new Parser(file).extractText();
      // Package order is relationship order, not guaranteed presentation order.
      // Cite the actual part path; never relabel it as an inferred slide number.
      return slides.map(slide => ({ locator: slide.path, kind: "slide" as const,
        text: Array.isArray(slide.text) ? slide.text.filter(t => typeof t === "string").join("\n").trim() : "" }));
    });
  } catch {
    console.warn("[intake] pptx extraction unavailable");
    return [];
  }
}

async function extractPdfUnits(buffer: Buffer): Promise<{ text: string; units: NativeUnit[] }> {
  const result = await extractPdfTextFromBuffer(buffer, { byteScanFallback: false });
  return { text: result.text, units: result.pageTexts?.length
    ? result.pageTexts.map(page => ({ locator: `page=${page.page}`, kind: "page", text: page.text }))
    : result.text.trim() ? [{ locator: "document", kind: "text", text: result.text }] : [] };
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
  const submittedAt = new Date().toISOString();
  // Only the caller's own text is authority. Never parse fetched pages or
  // uploaded document content as instructions or investor intent.
  const investorIntent = captureInvestorIntent({ userText: text, submittedAt });

  // ── File path: pitch deck (PDF/PPTX) ───────────────────────────────────
  if (input.file) {
    const filename = input.file.filename.toLowerCase();
    const isImage = /\.(png|jpe?g|webp|gif|heic|tiff?|bmp|svg)$/i.test(filename) || (input.file.mimeType ?? "").startsWith("image/") || isRasterBuffer(input.file.buffer);
    const isPptx = filename.endsWith(".pptx") || (!/\.docx$/i.test(filename) && isPptxBuffer(input.file.buffer));
    const isPdf = filename.endsWith(".pdf") || isPdfBuffer(input.file.buffer);

    let slides: string[] = [];
    let extractedUnits: NativeUnit[] = [];
    let rawText = "";
    let imageSource: VisualTranscriptSource | undefined;
    if (isImage) {
      const transcript = await extractVisualTranscript(input.file.buffer);
      imageSource = transcript.source;
      rawText = visualTranscriptContext(transcript.text);
      slides = [rawText];
      extractedUnits = [{ locator: "image=1", kind: "text", text: rawText }];
      warnings.push(VISUAL_TRANSCRIPT_WARNING, ...(transcript.source.limitations ?? []));
    } else if (isPptx) {
      extractedUnits = await extractPptxUnits(input.file.buffer);
      slides = extractedUnits.map(unit => unit.text);
      warnings.push("PPTX references identify slide parts, not presentation-order slide numbers.");
      rawText = extractedUnits.filter(unit => unit.text.trim()).map(unit => `[Source ${unit.locator}]\n${unit.text}`).join("\n\n");
      if (!rawText) warnings.push("PPTX yielded no extractable text — consider OCR fallback");
    } else if (isPdf) {
      const out = await extractPdfUnits(input.file.buffer);
      extractedUnits = out.units;
      slides = extractedUnits.map(unit => unit.text);
      rawText = extractedUnits.filter(unit => unit.text.trim()).map(unit => `[Source ${unit.locator}]\n${unit.text}`).join("\n\n") || out.text;
      if (!rawText.trim()) warnings.push("PDF yielded no extractable text — export a text-selectable PDF or upload individual PNG/JPEG/WebP pages for OCR");
    } else if (/\.docx?$/.test(filename)) {
      rawText = await withTemporaryDocument(input.file.buffer, input.file.filename, file => extractFileText(file, input.file!.filename));
      slides = rawText.trim() ? [rawText] : [];
      extractedUnits = [{ locator: "document", kind: "text", text: rawText }];
    } else {
      warnings.push(`Unrecognised file extension for ${input.file.filename}`);
      rawText = input.file.buffer.toString("utf-8").slice(0, 8000);
      slides = [rawText];
      extractedUnits = [{ locator: "document", kind: "text", text: rawText }];
    }

    let documentVisuals: DocumentVisualResult | undefined;
    if (!isImage && (isPdf || /\.(pptx|docx)$/i.test(filename))) {
      documentVisuals = await extractDocumentVisuals(input.file.buffer, input.file.filename);
      if (documentVisuals.text) rawText = [rawText, documentVisuals.text].filter(Boolean).join("\n\n");
      warnings.push(...documentVisuals.warnings);
    }
    if (!rawText.trim()) throw Error("needs_input");
    const deckSections = slides.length > 0 ? await splitDeckToSections(slides) : undefined;
    const combinedText = [rawText, text].filter(Boolean).join("\n\n");
    const signals = extractSignals({ rawText: combinedText, fileName: input.file.filename });
    const context = detectContext(signals, combinedText);
    const snapshotSources: SnapshotSourceInput[] = extractedUnits.length > 0
      ? extractedUnits.map(unit => ({
          id: `native:${unit.locator}`, kind: unit.kind,
          locator: `${input.file!.filename}#${unit.locator}`,
          status: unit.text.trim() ? "available" : "unsupported",
          ...(unit.text.trim() ? { text: unit.text } : {}),
        }))
      : [{ id: "document:0", kind: "text", locator: input.file.filename, status: "failed" }];
    if (text) snapshotSources.push({ id: "user-context", kind: "text", locator: "user-input", status: "available", text });
    const inputSnapshot = createBusinessInputSnapshot({
      inputKind: "pitch_deck",
      createdAt: submittedAt,
      sources: snapshotSources,
    });

    return {
      inputKind: "pitch_deck",
      confidence: rawText.length > 200 ? 0.95 : 0.55,
      rawText: combinedText,
      structured: { slides, extractedUnits, deckSections, ...(imageSource ? { imageSource } : {}), ...(documentVisuals ? { documentVisuals: { documentSha256: documentVisuals.documentSha256, units: documentVisuals.units, warnings: documentVisuals.warnings } } : {}) },
      signals,
      context,
      classifierMode: "file",
      suggestedNext: rawText.trim()
        ? "Run /api/svi/report-estimate with the returned `context` to price the deep dive."
        : "Upload a text-selectable PDF, paste the text or upload individual PNG/JPEG/WebP pages.",
      warnings: warnings.length > 0 ? warnings : undefined,
      inputSnapshot,
      investorIntent,
    };
  }

  // ── URL path ───────────────────────────────────────────────────────────
  const urlCandidate = input.url ?? text;
  const detectedKind = detectInputType(urlCandidate);

  if (input.url || (detectedKind === "url" && URL_LIKE.test(urlCandidate))) {
    let corpus: WebsiteCorpus | null = null;
    try {
      corpus = await acquireWebsiteCorpus(urlCandidate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Website acquisition failed: ${msg}`);
    }
    const availablePages = corpus?.pages.filter((page) => page.status === "available") ?? [];
    if (corpus && !corpus.complete) warnings.push("Website acquisition was partial — unavailable pages are recorded in the input snapshot");
    const rawText = corpus?.combinedText || urlCandidate;
    const signals = extractSignals({ rawText });
    const root = availablePages[0] ?? null;
    const context = detectContext(signals, rawText, {
      url: urlCandidate,
      scraped: root
        ? { title: root.title, description: root.description, text: root.text }
        : undefined,
    });
    const inputSnapshot = createBusinessInputSnapshot({
      inputKind: "website",
      createdAt: submittedAt,
      sources: corpus?.pages.length
        ? corpus.pages.map((page) => ({
            id: page.id,
            kind: "page" as const,
            locator: page.finalUrl,
            status: page.status,
            observedAt: page.observedAt,
            ...(page.status === "available" ? { text: page.text } : {}),
          }))
        : [{ id: "page:root", kind: "page", locator: urlCandidate, status: "failed" }],
    });
    return {
      inputKind: "website",
      confidence: availablePages.length > 0 ? 0.9 : 0.6,
      rawText,
      structured: corpus
        ? {
            pages: corpus.pages.map((page) => ({
              url: page.finalUrl,
              text: page.text,
              status: page.status,
              title: page.title,
              error: page.error,
            })),
          }
        : {},
      signals,
      context,
      classifierMode: "regex",
      suggestedNext: "Use this versioned website corpus for the report, then plan independent research for material investor questions.",
      warnings: warnings.length > 0 ? warnings : undefined,
      inputSnapshot,
      investorIntent,
    };
  }

  // ── Free text: decide idea vs existing-company ────────────────────────
  if (!text) {
    const inputSnapshot = createBusinessInputSnapshot({
      inputKind: "idea_text",
      createdAt: submittedAt,
      sources: [{ id: "text:0", kind: "text", locator: "user-input", status: "unsupported" }],
    });
    return {
      inputKind: "idea_text",
      confidence: 0,
      rawText: "",
      structured: {},
      signals: extractSignals({ rawText: "" }),
      classifierMode: "regex",
      suggestedNext: "No input received — pass `text`, `url`, or `file`.",
      warnings: ["empty input"],
      inputSnapshot,
      investorIntent,
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
  const inputSnapshot = createBusinessInputSnapshot({
    inputKind: kind,
    createdAt: submittedAt,
    sources: [{ id: "text:0", kind: "text", locator: "user-input", status: "available", text }],
  });
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
    inputSnapshot,
    investorIntent,
  };
}
