// Report pipeline version — a leaf module so the public /methodology page
// (G14-S36) can print it without importing the orchestrator (AI client,
// prompts, auditor). Re-exported from ./orchestrator for every existing
// importer. Bumped whenever the generator's output shape / prompts change —
// the `svi_deck_cache` key is `deck_hash + pipeline_version`.

export const PIPELINE_VERSION = "pipeline-v2.1-s-r8-public-attribution";

/**
 * G24-B — the semver the CODE-DEFAULT prompts are registered under in
 * `prompt_versions` (agent `report-<role>`) the first time the pipeline runs
 * without a prod row. Bump it whenever agent-prompts.ts changes what the
 * model sees, so `ai_runs` can be sliced by prompt generation.
 */
export const CODE_PROMPT_VERSION = "2.4.1";
