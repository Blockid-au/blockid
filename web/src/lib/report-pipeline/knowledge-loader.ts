// knowledge-loader — the two knowledge sources `buildAgentPrompt` v2 injects
// (spec 12-product-ai-tbr-v2.md §C.2):
//
//   1. `.claude/knowledge-base/**.md` files, selected per dimension by
//      `DIMENSION_OWNERS[dim].knowledge`, read from disk once and memoised,
//      each capped at KNOWLEDGE_FILE tokens, at most KNOWLEDGE_FILES_MAX per
//      prompt. Missing files are silent (empty block) — the prompt must build
//      on a standalone deploy where the repo root is not shipped.
//   2. `agent_knowledge_base` rows (migration 0045 shape: agent, topic, data
//      jsonb, created_at) — the top KNOWLEDGE_ROWS_MAX approved rows for the
//      role, each capped at KNOWLEDGE_ROW tokens. `status='approved'` is the
//      0396 column; until it is applied the query falls back to every row,
//      matching the migration's default. Memoised per role for a few minutes
//      so 8 parallel chapter calls do not fan out into 8 identical selects.
//
// Both loaders never throw: a knowledge failure degrades the prompt, never
// the report.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { AgentRole } from "./types";
import { KNOWLEDGE_FILES, type DimKey, type KnowledgeKey, DIMENSION_OWNERS } from "./dimension-owners";
import { PROMPT_BLOCK_CAPS, capTokens, estimateTokens } from "./prompt-tokens";

// ── Knowledge files ─────────────────────────────────────────────────────────

/** Candidate roots, first hit wins. `KNOWLEDGE_BASE_DIR` env overrides. */
function knowledgeRoots(): string[] {
  const cwd = process.cwd();
  const env = process.env.KNOWLEDGE_BASE_DIR;
  const up = (n: number) => path.resolve(cwd, ...Array<string>(n).fill(".."), ".claude", "knowledge-base");
  // up(0) = repo root cwd, up(1) = web/, up(2..4) = .next/standalone/** layouts.
  // The live server runs from releases/<BUILD_ID> (a /data symlink, so the
  // lexical parents never reach the checkout) — REPO_CHECKOUT_DIR / the
  // production checkout path close that gap; KNOWLEDGE_BASE_DIR overrides all.
  const checkout = process.env.REPO_CHECKOUT_DIR;
  return [
    ...(env ? [env] : []),
    up(0),
    up(1),
    up(2),
    up(3),
    up(4),
    ...(checkout ? [path.join(checkout, ".claude", "knowledge-base")] : []),
    path.join("/home/dovanlong/blockid.au", ".claude", "knowledge-base"),
  ];
}

const fileCache = new Map<KnowledgeKey, string>();

/** Raw markdown for a knowledge key ("" when the file is not reachable). */
export function loadKnowledgeFile(key: KnowledgeKey): string {
  const cached = fileCache.get(key);
  if (cached !== undefined) return cached;
  const rel = KNOWLEDGE_FILES[key];
  let text = "";
  const hit = knowledgeRoots().map((r) => path.join(r, rel)).find((f) => existsSync(f));
  if (hit) {
    try {
      text = readFileSync(hit, "utf8");
    } catch {
      text = "";
    }
  }
  fileCache.set(key, text);
  return text;
}

/** Strip markdown noise the model does not need (fences, html comments, blank runs). */
function compactMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface KnowledgeFileBlock {
  key: KnowledgeKey;
  path: string;
  text: string;
  tokens: number;
}

/**
 * The capped knowledge blocks for a dimension: the first
 * `KNOWLEDGE_FILES_MAX` keys of `DIMENSION_OWNERS[dim].knowledge` that
 * resolve to a non-empty file, each trimmed to `KNOWLEDGE_FILE` tokens.
 */
export function knowledgeBlocksForDim(
  dim: DimKey,
  opts: { maxFiles?: number; maxTokensEach?: number } = {},
): KnowledgeFileBlock[] {
  const maxFiles = opts.maxFiles ?? PROMPT_BLOCK_CAPS.KNOWLEDGE_FILES_MAX;
  const maxTokens = opts.maxTokensEach ?? PROMPT_BLOCK_CAPS.KNOWLEDGE_FILE;
  const out: KnowledgeFileBlock[] = [];
  const keys = DIMENSION_OWNERS[dim]?.knowledge ?? [];
  keys.forEach((key) => {
    if (out.length >= maxFiles) return;
    const raw = loadKnowledgeFile(key);
    if (!raw.trim()) return;
    const text = capTokens(compactMarkdown(raw), maxTokens);
    out.push({ key, path: KNOWLEDGE_FILES[key], text, tokens: estimateTokens(text) });
  });
  return out;
}

/** Render knowledge file blocks as one prompt section (empty string when none). */
export function renderKnowledgeFiles(blocks: KnowledgeFileBlock[]): string {
  if (blocks.length === 0) return "";
  return blocks.map((b) => `### Knowledge: ${b.key} (${b.path})\n${b.text}`).join("\n\n");
}

// ── agent_knowledge_base rows ───────────────────────────────────────────────

export interface AgentKnowledgeRow {
  agent: string;
  topic: string;
  /** Compact one-paragraph rendering of `data`, capped at KNOWLEDGE_ROW tokens. */
  text: string;
  created_at: string;
}

/** Minimal Supabase-like query surface the loader needs (tests fake it). */
export interface KnowledgeDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): KnowledgeQuery;
    };
  };
}
interface KnowledgeQuery {
  eq(col: string, val: string): KnowledgeQuery;
  order(col: string, opts: { ascending: boolean }): KnowledgeQuery;
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

const ROW_TTL_MS = 5 * 60_000;
const rowCache = new Map<string, { at: number; rows: AgentKnowledgeRow[] }>();

/** Flatten a jsonb `data` payload into prose the model can use. */
export function renderKnowledgeData(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.trim();
  if (Array.isArray(data)) return data.map(renderKnowledgeData).filter(Boolean).join("; ");
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const preferred = ["summary", "findings", "insight", "insights", "recommendation", "recommendations", "keyPoints", "key_points"];
    const keys = [...preferred.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !preferred.includes(k))];
    return keys
      .map((k) => {
        const v = renderKnowledgeData(obj[k]);
        return v ? `${k}: ${v}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(data);
}

function isMissingStatusColumn(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("status") && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"));
}

/**
 * Top `KNOWLEDGE_ROWS_MAX` approved `agent_knowledge_base` rows for a role,
 * newest first. `db` is injected (the pipeline passes the admin client; tests
 * pass a fake); `null` → no rows.
 */
export async function loadAgentKnowledgeRows(
  role: AgentRole,
  db: KnowledgeDb | null | undefined,
  opts: { max?: number; maxTokensEach?: number; now?: number } = {},
): Promise<AgentKnowledgeRow[]> {
  if (!db) return [];
  const max = opts.max ?? PROMPT_BLOCK_CAPS.KNOWLEDGE_ROWS_MAX;
  const maxTokens = opts.maxTokensEach ?? PROMPT_BLOCK_CAPS.KNOWLEDGE_ROW;
  const now = opts.now ?? Date.now();
  const cacheKey = `${role}:${max}:${maxTokens}`;
  const cached = rowCache.get(cacheKey);
  if (cached && now - cached.at < ROW_TTL_MS) return cached.rows;

  const run = async (withStatus: boolean) => {
    let q = db.from("agent_knowledge_base").select("agent, topic, data, created_at").eq("agent", role);
    if (withStatus) q = q.eq("status", "approved");
    return q.order("created_at", { ascending: false }).limit(max);
  };

  let rows: AgentKnowledgeRow[] = [];
  try {
    let res = await run(true);
    if (res.error && isMissingStatusColumn(res.error.message)) res = await run(false);
    if (!res.error && Array.isArray(res.data)) {
      rows = (res.data as Array<Record<string, unknown>>)
        .map((r) => ({
          agent: String(r.agent ?? role),
          topic: String(r.topic ?? ""),
          text: capTokens(renderKnowledgeData(r.data), maxTokens),
          created_at: String(r.created_at ?? ""),
        }))
        .filter((r) => r.text.length > 0)
        .slice(0, max);
    }
  } catch {
    rows = [];
  }
  rowCache.set(cacheKey, { at: now, rows });
  return rows;
}

/** Render `agent_knowledge_base` rows as one prompt section (empty when none). */
export function renderKnowledgeRows(rows: AgentKnowledgeRow[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => `- **${r.topic}** (${r.created_at.slice(0, 10) || "undated"}): ${r.text}`).join("\n");
}

/** Test seam — drop both memo tables. */
export function __resetKnowledgeCaches(): void {
  fileCache.clear();
  rowCache.clear();
}
