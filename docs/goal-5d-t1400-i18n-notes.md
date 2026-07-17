# T-1400 — i18n scaffold notes (Vietnamese-Australian founder cohort)

**Ships as of:** first-scaffold for Goal 5D.
**Consumers:** T-1401 (VI onboarding wizard variant), T-1402+ (VI email
templates, Zalo digest), and the CMO's VI SEO articles under
`/content/insights/` at a later phase.

This document explains the routing model, the human-translation rule, the
consumption contract for downstream tasks, and the procedure for adding a
new locale.

---

## 1. Why path-based (`/vi/*`) and not domain-based (`vi.blockid.au`)

Three practical reasons anchored the choice; none of the rejected options
are trivial to reverse if we change our minds later, but path-based is by
far the cheapest to unwind.

### 1.1 SEO signal parity

Google treats subdomains as a separate site for the purposes of a lot of
ranking heuristics (domain authority accrues to the subdomain, not the
parent). We already have a fully-indexed English tree at `blockid.au` —
minting `vi.blockid.au` would start the VI surface from zero authority
and force us to run two link-building campaigns. Path-based
`blockid.au/vi/*` inherits the parent domain's authority immediately and
is Google's preferred pattern for language variants of the same content
(see the Google Search Central "Managing multi-regional and multilingual
sites" guidance — path prefix and subdomain are both endorsed, and path
prefix is called out as the least operationally expensive).

### 1.2 No new SSL certificates, no new DNS records

`vi.blockid.au` would need a wildcard cert (or a second entry in the
existing cert's SAN list) and a matching DNS record. Path-based needs
zero infrastructure change — the existing Cloudflare + Next.js server
serves `/vi/*` the same way it serves `/pricing`.

### 1.3 Shared session cookies

Cookies scoped to `blockid.au` are visible on both `/` and `/vi/*`.
Cookies scoped to `vi.blockid.au` would require explicit domain=
`.blockid.au` on every auth cookie — a change touching auth, Stripe
customer portal callbacks, and every place we currently write a cookie.
Path-based means a logged-in user can toggle EN/VI without re-authing.

### 1.4 The `blockid_locale` cookie is the source of truth

The `blockid.au/vi/*` prefix is just a hint. The real locale decision is
made by the proxy from the `blockid_locale` cookie first, path second.
This means a Vietnamese-speaking user who is sent an English inbound link
(`blockid.au/pricing`) still sees Vietnamese if they've toggled once.
The cookie is `Path=/`, `SameSite=Lax`, `Max-Age=1yr`, `Secure` on HTTPS.

---

## 2. Why we do NOT machine-translate AU legal terms

The Vietnamese-Australian founder cohort is a **compliance-sensitive**
market. Terms of art like `s708`, `s766B`, `ACN`, `ABN`, and `GST` are
statutory references — they name specific sections of AU legislation. A
machine translation risks either (a) translating them into Vietnamese
(useless — no lawyer in AU would recognise the translated form) or (b)
leaving the terms untranslated but embedded in an awkwardly-machine-
translated sentence that reads as amateur to a Vietnamese-speaking
professional.

Concretely, our house rule is:

- **Preserve verbatim** in the VI catalog: `s708`, `s766B`, `ACN`, `ABN`,
  `GST`, `AFSL`, `ESIC`, `ESVCLP`, `AUD`, `Auschain PTY LTD`, any
  section-number reference of the Corporations Act 2001 (Cth).
- **Translate to natural business Vietnamese** the surrounding
  sentence, written by a human who reads business Vietnamese and knows
  the AU regulatory context — pragmatic, not literal.
- **Never** run the Vietnamese catalog through a bulk MT tool without a
  reviewer pass. Prompts to LLMs for VI translation MUST enumerate the
  reserved-terms list and instruct the model to preserve them verbatim.

The initial catalog (`web/src/lib/i18n/messages/vi.json`) is small
enough (~30 keys) to hand-author. As the catalog grows, T-1402+ should
add a lint that scans VI values for the reserved terms and fails CI if
they've been translated away.

---

## 3. How T-1401 (VI onboarding wizard) consumes this scaffold

The 5-step wizard at `/onboarding` is EN today. T-1401 will mount a
mirror at `/vi/onboarding` with the same wizard components. The only
lifts:

1. Every user-visible string in the wizard components lifts into
   `web/src/lib/i18n/messages/{en,vi}.json` under an `onboarding.*`
   namespace (e.g. `onboarding.step.segment.title`,
   `onboarding.step.tier.founder.desc`).
2. Wizard components accept a `messages` prop from the page-level
   server component; page-level `getMessages(locale)` supplies it.
   No component reads the catalog directly, so wizard components stay
   locale-agnostic.
3. Currency stays AUD. AU regulation applies to VI-cohort users the
   same as EN-cohort users; a VI user in Sydney is still bound by the
   Australian Consumer Law and the Corporations Act.
4. Legal disclaimers on step-4 (trial) and step-5 (payment) preserve
   `s708` / `s766B` verbatim per §2 above.

Downstream (T-1402): VI email templates read from the same catalog via
`getMessages("vi")` inside the transactional email renderer. No new
translation infrastructure.

---

## 4. Procedure for adding a new locale (e.g. `zh`, `id`)

1. **Register the code** in `web/src/lib/i18n/locales.ts`:
   append the code to the `LOCALES` const tuple (e.g.
   `["en", "vi", "zh"] as const`). All downstream types
   (`Locale`, `isLocale`, `localeFromPath`) update automatically.
2. **Create the catalog** at
   `web/src/lib/i18n/messages/<code>.json` with the same key set as
   `en.json`. Missing keys fall back to EN via `t()` — safe but visible.
   The catalog must be hand-authored or human-reviewed; see §2.
3. **Register the JSON import** in `web/src/lib/i18n/t.ts`:
   add `import zh from "./messages/zh.json";` and the corresponding
   entry in the `CATALOG` map.
4. **Extend the locale switcher label map** in
   `web/src/components/landing/locale-switcher.tsx` — add
   `zh: "中文"` (or the appropriate ISO-language-in-native-script label)
   to the `LABELS` record.
5. **Mount the surfaces** at `web/src/app/<code>/page.tsx`,
   `web/src/app/<code>/pricing/page.tsx`, and any other pages the
   cohort needs. Each page reads `getMessages("<code>")` and threads
   translations into shared marketing components.
6. **Update the proxy** at `web/src/proxy.ts`: extend the
   pathname test (`pathname === "/<code>" || pathname.startsWith("/<code>/")`)
   to detect the new prefix. The cookie override branch already handles
   arbitrary registered locales via `isLocale()`.
7. **Register the sitemap entries** at `web/src/app/sitemap.ts`:
   add one entry per localised URL, and extend `alternates.languages`
   on every existing entry that gets a translated mirror.
8. **Update this doc** — add the new locale to the reserved-terms
   guidance if the locale has its own reserved-terms list. For AU-facing
   locales (VI, ZH, KO, ID diaspora cohorts), reserved terms are the
   same AU regulatory shorthand.

Nothing else should need to change. The catalog fallback rule
(`missing key → EN → key`) means a partial catalog is safe to ship — a
new locale can start with 10 keys, ship, and grow.

---

## 5. Guarantees preserved by this scaffold

- The proxy's CSP-nonce path is untouched — the locale detect block
  runs BEFORE the nonce block and only sets headers.
- The URL is never rewritten by the proxy; Next App Router routes
  `/vi/*` natively via the `web/src/app/vi/` directory.
- `PricingMatrix` and `SegmentTabs` remain untouched — they render the
  same AUD SKU names on `/pricing` and `/vi/pricing`.
- The English homepage `/page.tsx` is untouched (a peer agent owns it).

---

## 6. What is explicitly OUT of scope for T-1400

- VI onboarding wizard (T-1401).
- VI email templates (T-1402+).
- Zalo Official Account integration (T-14xx per Goal 5D plan).
- Legal MDX under `/legal/*` in VI (v3 T-0514 owns that stream).
- Workspace UI localisation (Goal 5D §2.2 caps this at top-20 keys
  post-T-1401; T-1400 does not touch workspace).
- Accelerator partnerships (Goal 5D §1.3).

---

_Owner:_ CMO/CPO (T-1400).
_Business entity:_ Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111.
