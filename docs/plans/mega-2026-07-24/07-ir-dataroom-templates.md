# IR — Standardized Dataroom Template Pre-Seeding

**Owner:** Investor Relations agent
**Date:** 2026-07-24
**Status:** Design

## Problem

Founder ask (VI → EN): "Create standard templates in each startup's dataroom, placed in each user's drive when the startup is created."

Today `web/src/lib/dataroom/populate.ts` only seeds *placeholder rows* into `dataroom_files` (status = 'missing', mime = `application/vnd.blockid.template`). There are **no actual downloadable files** — the founder still has to hunt for a pitch deck template, a SAFE, a term sheet, etc.

## Goal

On startup creation, provision a full 10-doc **standardized dataroom template set** into Supabase storage at `startup-{project_id}/dataroom/*`, and back each file with a matching `dataroom_files` row so it renders in `/dashboard/data-room` — downloadable, editable, and versioned.

## Non-goals

- Not a replacement for the phase-ordered Atlassian placeholder set (that stays — it's the *comprehensive* checklist). The seeded 10 are the *minimum viable dataroom* an investor expects on Day 0.
- Not populating actual content (financials, cap table numbers). Templates are stubs with `[[PLACEHOLDER]]` tokens the founder fills in.

## The 10 Templates

Declared in `web/src/lib/dataroom/template-manifest.ts`:

| # | Filename | Category (DATA_ROOM_STRUCTURE) | Phase | Source of truth |
|---|---|---|---|---|
| 1 | `pitch-deck.docx` | 3. Product & Technology | 2 | `web/public/pitch/*` (existing) |
| 2 | `cap-table.xlsx` | 1. Corporate & Legal | 1 | New — 5-founder starter grid |
| 3 | `financial-model.xlsx` | 5. Financials | 3 | New — 3-yr P&L + burn |
| 4 | `term-sheet.docx` | 6. Fundraising | 4 | `legal-templates.ts` |
| 5 | `safe.docx` | 6. Fundraising | 4 | `legal-templates.ts` (YC AU) |
| 6 | `sha.docx` | 1. Corporate & Legal | 5 | `legal-templates.ts` |
| 7 | `esop-plan.docx` | 2. Team & HR | 5 | New — AU ESOP concessions |
| 8 | `ip-assignment.docx` | 3. Product & Technology | 1 | `legal-templates.ts` |
| 9 | `employment-contract.docx` | 2. Team & HR | 2 | `legal-templates.ts` |
| 10 | `board-consent.docx` | 1. Corporate & Legal | 3 | New — director resolution |

Each entry: `{ slug, filename, mime, category, phaseSlug, size_bytes_max: 200_000, version: 'v1' }`.

## Storage layout

Supabase storage bucket: `dataroom` (already exists). Path template:

```
dataroom/startup-{project_id}/templates/v1/{filename}
```

- Bucket is private; access mediated through signed URLs (24h) issued by `/api/dataroom/download/[id]`.
- `startup-{project_id}` prefix isolates tenants — RLS policy on `storage.objects` gates by `project_id ∈ user's projects`.

## Ingestion path (build-time → runtime)

1. **Source-of-truth files** committed to `web/public/templates/*` (small stub DOCX/XLSX < 200KB each). Cap total ≤ 2 MB checked-in.
2. `web/public/templates/README.md` is the human-readable inventory + edit instructions ("bump `version` in manifest, run deploy, existing startups get the new version on next report run").
3. `web/src/lib/dataroom/seed-templates.ts` reads a template file via `fs.readFile` (from `process.cwd() + '/public/templates/{filename}'`), uploads to `dataroom/startup-{id}/templates/v1/{filename}` via `supabase.storage.from('dataroom').upload(...)` with `upsert: false` (idempotent — second run no-ops on `Duplicate` error), then inserts a matching `dataroom_files` row with:
   - `status = 'present'` (not `missing` — the file exists)
   - `mime_type = manifest entry mime`
   - `drive_file_url = null`
   - `storage_path = 'startup-{id}/templates/v1/{filename}'` (new column, migration below)
   - `template_slug = manifest.slug`, `template_version = manifest.version`

## Wiring into startup creation

The only code path that mints a new `projects` row is:
`web/src/app/api/reseller/create-startup/route.ts` — step 6b (per route header comment). After the `projects` insert succeeds and `project_id` is known, before returning the response envelope, call:

```ts
await seedDataroomTemplates({
  projectId,
  userId,
  email: input.founder_email,
  supabase, // admin client
});
```

Failures are non-fatal — logged to `deploy-log.jsonl` + surfaced in the response envelope as `dataroom_seed: 'ok' | 'partial' | 'deferred'`. Founder sees the placeholder row set (from existing `populateFromAtlassian`) either way; the 10 real files just appear when seeding succeeds.

Retry via new endpoint `/api/dataroom/reseed-templates` (idempotent) for the founder to trigger manually if seeding was deferred.

## Migration

`0110_dataroom_storage_path.sql`:

```sql
alter table public.dataroom_files
  add column if not exists storage_path text,
  add column if not exists template_slug text,
  add column if not exists template_version text;

create index if not exists dataroom_files_template_slug_idx
  on public.dataroom_files (user_id, template_slug)
  where template_slug is not null;
```

Version pin lets the manifest bump (`v1 → v2`) trigger a re-seed for existing startups via a scheduled job that diffs `template_version` per row.

## Cost cap

10 files × ~150 KB avg = 1.5 MB per startup. At 10,000 startups → 15 GB. Supabase storage at USD $0.021/GB/mo → **USD $0.32/mo** at 10k tenants. Well under budget.

Guardrails:
- `size_bytes_max: 200_000` in manifest — CI check rejects any template > 200 KB.
- Manifest length capped at 10 in unit test.
- Total seed bytes per startup asserted < 2 MB in `seed-templates.test.ts`.
