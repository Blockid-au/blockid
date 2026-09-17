// Report pipeline version — a leaf module so the public /methodology page
// (G14-S36) can print it without importing the orchestrator (AI client,
// prompts, auditor). Re-exported from ./orchestrator for every existing
// importer. Bumped whenever the generator's output shape / prompts change —
// the `svi_deck_cache` key is `deck_hash + pipeline_version`.

export const PIPELINE_VERSION = "pipeline-v2.1-s-r3";
