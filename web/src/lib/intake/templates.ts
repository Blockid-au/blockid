// templates — CRUD over `intake_templates` (G21 P2-A, migration 0422).
//
// Owner-scoped: every write and every list keys on `owner_user_id`; the one
// unscoped read (`getTemplateById`) serves the public /apply/<slug> page,
// which already resolved the intake by its unguessable slug. Every reader
// tolerates a missing table (42P01 → `not_migrated`, the 0405 pattern) so
// the editor page renders its empty state until 0422 is applied.
//
// Persistence goes through `TemplateStore` so the colocated test runs
// against the in-memory store; the Supabase client is imported lazily (no
// `server-only` for the same reason — the shared types live in
// ./templates-shared.ts which the client bundle imports instead).

import {
  mapTemplateRow,
  normaliseTemplateInput,
  type IntakeTemplate,
  type NormalisedTemplateInput,
  type TemplateInput,
} from "./templates-shared";

export type { IntakeTemplate, TemplateInput, TemplateQuestion } from "./templates-shared";

export type TemplateErrorCode = "invalid_input" | "not_found" | "not_migrated" | "service_unavailable" | "db_error";

export class TemplateStoreError extends Error {
  code: TemplateErrorCode;
  constructor(code: TemplateErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export const TEMPLATE_COLUMNS = "id, owner_user_id, name, description, questions, rubric_weights, consent_text, created_at, updated_at";

export interface TemplateStore {
  insert(ownerUserId: string, input: NormalisedTemplateInput): Promise<IntakeTemplate>;
  getForOwner(ownerUserId: string, id: string): Promise<IntakeTemplate | null>;
  getById(id: string): Promise<IntakeTemplate | null>;
  listForOwner(ownerUserId: string): Promise<IntakeTemplate[]>;
  update(ownerUserId: string, id: string, input: NormalisedTemplateInput): Promise<IntakeTemplate | null>;
  remove(ownerUserId: string, id: string): Promise<boolean>;
}

type Row = Record<string, unknown>;

function toStoreError(error: { code?: string; message?: string } | null | undefined): TemplateStoreError {
  const code = error?.code ?? "";
  if (code === "42P01") return new TemplateStoreError("not_migrated", "migration 0422 not applied");
  return new TemplateStoreError("db_error", error?.message ?? "db_error");
}

function toRow(input: NormalisedTemplateInput): Row {
  return {
    name: input.name,
    description: input.description,
    questions: input.questions,
    rubric_weights: input.rubricWeights,
    consent_text: input.consentText,
  };
}

export async function supabaseTemplateStore(): Promise<TemplateStore | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  return {
    async insert(ownerUserId, input) {
      const { data, error } = await supabase.from("intake_templates").insert({ owner_user_id: ownerUserId, ...toRow(input) }).select(TEMPLATE_COLUMNS).single();
      if (error || !data) throw toStoreError(error);
      return mapTemplateRow(data as Row);
    },
    async getForOwner(ownerUserId, id) {
      const { data, error } = await supabase.from("intake_templates").select(TEMPLATE_COLUMNS).eq("id", id).eq("owner_user_id", ownerUserId).maybeSingle();
      if (error) throw toStoreError(error);
      return data ? mapTemplateRow(data as Row) : null;
    },
    async getById(id) {
      const { data, error } = await supabase.from("intake_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw toStoreError(error);
      return data ? mapTemplateRow(data as Row) : null;
    },
    async listForOwner(ownerUserId) {
      const { data, error } = await supabase.from("intake_templates").select(TEMPLATE_COLUMNS).eq("owner_user_id", ownerUserId).order("updated_at", { ascending: false }).limit(100);
      if (error) throw toStoreError(error);
      return ((data ?? []) as Row[]).map(mapTemplateRow);
    },
    async update(ownerUserId, id, input) {
      const { data, error } = await supabase
        .from("intake_templates")
        .update({ ...toRow(input), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_user_id", ownerUserId)
        .select(TEMPLATE_COLUMNS)
        .maybeSingle();
      if (error) throw toStoreError(error);
      return data ? mapTemplateRow(data as Row) : null;
    },
    async remove(ownerUserId, id) {
      const { data, error } = await supabase.from("intake_templates").delete().eq("id", id).eq("owner_user_id", ownerUserId).select("id");
      if (error) throw toStoreError(error);
      return Array.isArray(data) && data.length > 0;
    },
  };
}

export interface TemplateDeps {
  store?: TemplateStore | null;
}

async function resolveStore(deps: TemplateDeps): Promise<TemplateStore> {
  const store = deps.store === undefined ? await supabaseTemplateStore() : deps.store;
  if (!store) throw new TemplateStoreError("service_unavailable", "Supabase not configured");
  return store;
}

export type TemplateResult = { ok: true; template: IntakeTemplate } | { ok: false; error: TemplateErrorCode; message: string };

function fail(err: unknown, fallback: string): { ok: false; error: TemplateErrorCode; message: string } {
  if (err instanceof TemplateStoreError) return { ok: false, error: err.code, message: err.message };
  console.error("[blockid:intake:templates]", fallback, err);
  return { ok: false, error: "db_error", message: fallback };
}

export async function createTemplate(ownerUserId: string, raw: TemplateInput, deps: TemplateDeps = {}): Promise<TemplateResult> {
  const parsed = normaliseTemplateInput(raw);
  if (!parsed.ok) return { ok: false, error: "invalid_input", message: parsed.message };
  try {
    const store = await resolveStore(deps);
    return { ok: true, template: await store.insert(ownerUserId, parsed.value) };
  } catch (err) {
    return fail(err, "Failed to create the template");
  }
}

export async function updateTemplate(ownerUserId: string, id: string, raw: TemplateInput, deps: TemplateDeps = {}): Promise<TemplateResult> {
  const parsed = normaliseTemplateInput(raw);
  if (!parsed.ok) return { ok: false, error: "invalid_input", message: parsed.message };
  try {
    const store = await resolveStore(deps);
    const template = await store.update(ownerUserId, id, parsed.value);
    if (!template) return { ok: false, error: "not_found", message: "Template not found" };
    return { ok: true, template };
  } catch (err) {
    return fail(err, "Failed to update the template");
  }
}

export async function deleteTemplate(ownerUserId: string, id: string, deps: TemplateDeps = {}): Promise<{ ok: true } | { ok: false; error: TemplateErrorCode; message: string }> {
  try {
    const store = await resolveStore(deps);
    const removed = await store.remove(ownerUserId, id);
    if (!removed) return { ok: false, error: "not_found", message: "Template not found" };
    return { ok: true };
  } catch (err) {
    return fail(err, "Failed to delete the template");
  }
}

/** The evaluator's templates, newest first; `[]` when 0422 is not applied. */
export async function listTemplates(ownerUserId: string, deps: TemplateDeps = {}): Promise<IntakeTemplate[]> {
  try {
    const store = await resolveStore(deps);
    return await store.listForOwner(ownerUserId);
  } catch (err) {
    if (!(err instanceof TemplateStoreError && (err.code === "not_migrated" || err.code === "service_unavailable"))) {
      console.error("[blockid:intake:templates] list failed", err);
    }
    return [];
  }
}

export async function getTemplate(ownerUserId: string, id: string, deps: TemplateDeps = {}): Promise<IntakeTemplate | null> {
  try {
    const store = await resolveStore(deps);
    return await store.getForOwner(ownerUserId, id);
  } catch {
    return null;
  }
}

/** Unscoped read for the public apply page / the invite e-mail (null when unknown or not migrated). */
export async function getTemplateById(id: string | null | undefined, deps: TemplateDeps = {}): Promise<IntakeTemplate | null> {
  if (!id) return null;
  try {
    const store = await resolveStore(deps);
    return await store.getById(id);
  } catch {
    return null;
  }
}

// ── In-memory store (tests) ─────────────────────────────────────────────────

export function memoryTemplateStore(opts: { migrated?: boolean } = {}): TemplateStore & { templates: IntakeTemplate[] } {
  const migrated = opts.migrated !== false;
  const guard = () => {
    if (!migrated) throw new TemplateStoreError("not_migrated");
  };
  let seq = 0;
  const templates: IntakeTemplate[] = [];
  const now = () => new Date().toISOString();
  return {
    templates,
    async insert(ownerUserId, input) {
      guard();
      const t: IntakeTemplate = { id: `tpl-${++seq}`, ownerUserId, ...input, createdAt: now(), updatedAt: now() };
      templates.push(t);
      return { ...t };
    },
    async getForOwner(ownerUserId, id) {
      guard();
      const t = templates.find((x) => x.id === id && x.ownerUserId === ownerUserId);
      return t ? { ...t } : null;
    },
    async getById(id) {
      guard();
      const t = templates.find((x) => x.id === id);
      return t ? { ...t } : null;
    },
    async listForOwner(ownerUserId) {
      guard();
      return templates.filter((x) => x.ownerUserId === ownerUserId).map((x) => ({ ...x })).reverse();
    },
    async update(ownerUserId, id, input) {
      guard();
      const t = templates.find((x) => x.id === id && x.ownerUserId === ownerUserId);
      if (!t) return null;
      Object.assign(t, input, { updatedAt: now() });
      return { ...t };
    },
    async remove(ownerUserId, id) {
      guard();
      const i = templates.findIndex((x) => x.id === id && x.ownerUserId === ownerUserId);
      if (i < 0) return false;
      templates.splice(i, 1);
      return true;
    },
  };
}
