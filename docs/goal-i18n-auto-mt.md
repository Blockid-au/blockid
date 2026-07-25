# Goal — Full EN↔VI runtime auto-translation (T-1403)

**Owner:** CPO / CTO (T-1403, follow-on to T-1400 scaffold).
**Ships as of:** 2026-07-25.
**Consumers:** every user-facing route in `web/src/app/**` — no per-page code change required.

---

## 1. Problem statement

T-1400 shipped a hand-authored EN/VI catalog + two `/vi/*` mirror pages
(home + pricing). Clicking the VI switcher on any of the other **253**
route files either 404'd or showed EN. Building 253 mirror pages by
hand is not tractable and would drift the moment any EN page is edited.

The user asked for the industry-standard "click a language button and
the whole site translates" behaviour, powered by an online translation
engine (Google Translate or equivalent), for both static and dynamic
text.

## 2. Chosen architecture — client DOM walker + server-side MT cache

```
┌────────────────────────────────────────────────────────┐
│  Root Layout (Server Component)                        │
│    reads x-blockid-locale from proxy header            │
│    wraps children in <TranslationProvider locale=vi>   │
│    passes seed = buildSeedCatalog(vi)                  │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│  TranslationProvider (Client Component)                │
│    on mount + on every DOM mutation                    │
│    walks TextNodes under document.body                 │
│    skips <code>/<pre>/<script>/[data-i18n-skip]        │
│    pre-swaps from seed catalog (nav/hero/pricing)      │
│    batches new strings → POST /api/i18n/translate      │
│    swaps node.nodeValue in place, preserves whitespace │
│    stores original EN on parent.dataset.i18nOrig       │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│  POST /api/i18n/translate                              │
│    { locale, strings[] }  →  { translations }          │
│    server: translateBatch(strings, locale)             │
│      1. cacheGetMany() — disk cache hits               │
│      2. callGeminiBatch() — indexed JSON prompt        │
│      3. containsReservedDrift() — reject bad outputs   │
│      4. cacheSetMany() — persist to vi-cache.json      │
└────────────────────────────────────────────────────────┘
```

### Why runtime DOM translation over per-page mirrors

- **Zero copy cost** — one file (`TranslationProvider`) covers 255 pages.
- **Zero drift** — the moment a component's EN text changes, the VI
  translation refreshes on next request (cache miss → fresh Gemini call).
- **Works for dynamic content** — SVI reports, agent output, streamed
  AI responses all render through the same DOM the walker observes.
- **SEO-preserving for priority pages** — the two hand-crafted `/vi/*`
  mirrors (home + pricing) remain. Anything else serves EN to crawlers
  and translates for VI-cookie users only.
- **No new SaaS dependency** — Gemini is already wired (`GOOGLE_GEMINI_API_KEY`).

### Why Gemini, not Google Cloud Translate v3

- API key already provisioned + used by 3 other subsystems.
- Free tier covers our expected volume (< 100k tokens/day post-warm-up).
- Prompt-driven reserved-terms enforcement — Google Translate v3
  requires an uploaded glossary and doesn't guarantee case preservation
  on statutory shorthand like `s708`.
- Post-check `containsReservedDrift()` catches any prompt escape.

## 3. Files added / changed

- **NEW** `web/src/lib/i18n/reserved-terms.ts` — RESERVED_TERMS list
  (s708, ACN, ABN, GST, AFSL, ESIC, ESVCLP, AUD, ASIC, APRA, AUSTRAC,
  ATO, ACL, SOC2, Auschain PTY LTD, BlockID, BlockID.au, SVI, SCN,
  ESOP) + drift detector.
- **NEW** `web/src/lib/i18n/translate-cache.ts` — disk-backed JSON cache
  at `content/i18n/<locale>-cache.json`, debounced writes, sha-256 keys.
- **NEW** `web/src/lib/i18n/translate.ts` — Gemini 2.5 Flash caller,
  batches of ≤40, JSON output mode, drift-reject fallback to EN.
- **NEW** `web/src/lib/i18n/seed-catalog.ts` — converts the hand-authored
  key-based catalog into an EN-value-keyed map for the DOM walker.
- **NEW** `web/src/app/api/i18n/translate/route.ts` — POST batch endpoint,
  nodejs runtime, force-dynamic, hard `no-store` headers.
- **NEW** `web/src/components/i18n/translation-provider.tsx` — client-side
  TreeWalker + MutationObserver, 150-string batches, 120ms debounce,
  restores EN on switch back.
- **NEW** `web/content/i18n/vi-cache.json` — seeded with the 29 existing
  hand-authored VI values so first VI visitor pays zero API cost.
- **EDIT** `web/src/app/layout.tsx` — reads `x-blockid-locale`, sets
  `<html lang>` accordingly, wraps children in `<TranslationProvider>`.
- **EDIT** `web/src/components/landing/locale-switcher.tsx` —
  cookie-only toggle (no navigation, no 404), visible on mobile too,
  `data-i18n-skip` so "EN | VI" labels stay untranslated.
- **EDIT** `docs/goal-i18n-auto-mt.md` — this doc.

## 4. Reserved-terms invariant

The house rule in `docs/goal-5d-t1400-i18n-notes.md §2` is enforced at
two layers:

1. **Prompt** — the Gemini system message enumerates RESERVED_TERMS and
   instructs verbatim preservation, correct case.
2. **Post-check** — `containsReservedDrift(en, translated)` compares
   the two strings. Any reserved term that appeared in EN but is
   missing from the translation ⇒ discard, fall back to EN, do not
   cache the bad output.

New reserved terms belong in `reserved-terms.ts` — a single edit
propagates to every future translation call.

## 5. Sub-tasks — checklist for the incremental rollout

- [x] T-1403.1 — reserved-terms guard list + drift detector
- [x] T-1403.2 — Gemini translate engine + disk cache
- [x] T-1403.3 — `/api/i18n/translate` batch endpoint
- [x] T-1403.4 — `<TranslationProvider>` DOM walker (client)
- [x] T-1403.5 — mount in root layout gated on VI locale
- [x] T-1403.6 — switcher no longer navigates; visible on mobile
- [x] T-1403.7 — seed `vi-cache.json` from existing hand-authored VI
- [x] T-1403.8 — goal doc (this file)
- [x] T-1403.9 — CI lint: `scripts/i18n/lint-cache.mjs` reads
      `vi-audit.jsonl` and fails if any entry loses a reserved term.
- [x] T-1403.10 — in-memory counters (`translate-stats.ts`) exposed at
      `GET /api/i18n/stats` behind `x-admin-key` + `INTERNAL_ADMIN_KEY`.
- [x] T-1403.11 — migration `0117_preferred_locale.sql` adds
      `founder_profiles.preferred_locale`; switcher fires
      `POST /api/founder-profile/locale` when the user is signed in.
- [x] T-1403.12 — `/admin/i18n/review` browse + inline-edit UI with
      `POST /api/i18n/cache` override endpoint.

### Audit + review data flow

```
translate-cache.ts  cacheSetMany() ─► vi-cache.json   (sha-keyed)
                                    └► vi-audit.jsonl (append EN/VI/ts)
                                             │
                                             ├─► scripts/i18n/lint-cache.mjs   (CI drift check)
                                             │
                                             └─► /admin/i18n/review  (human QA)
                                                       │
                                                       └─► POST /api/i18n/cache
                                                                 → cacheSetMany() (loop)
```

## 6. Cost / quota model

- Cold visit to any VI page: N text nodes × O(1) Gemini call, batched
  ≤150 per API call. Typical marketing page = ~1 batch = 1 Gemini call.
- Warm visit: 0 Gemini calls (disk cache hits for every string).
- Per-string cache is persistent (committed to git) so warm-up amortises
  across all users and all deploys.
- Free-tier ceiling on `gemini-2.5-flash` is comfortably above our
  expected first-week volume (< 100k tokens/day). Post-cache, near zero.

## 7. Out of scope for T-1403

- Automatic language detection from browser `Accept-Language`.
- URL-based locale prefix for arbitrary pages (only home + pricing
  mirror routes remain — SEO-priority pages).
- Non-VI locales (zh, ko, id) — trivially added via the procedure in
  `docs/goal-5d-t1400-i18n-notes.md §4`.
- MDX content localisation (still EN — a future T-1404 that runs the
  MDX through the same engine at build time).

---

_Business entity:_ Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111.
