# BlockID.au — the one message map (G18 lane C, 2026-09-19 · G21 P0-D positioning update 2026-09-20)

**Why this file exists.** Founder direction 2026-09-19: *"thông điệp đồng nhất trên toàn bộ site blockid.au"* — one consistent message everywhere. Every public string (marketing pages, `/vi`, i18n messages, meta titles/descriptions, JSON-LD, OG card, transactional e-mails, PDF covers, PWA manifest) is written from this map. `web/src/lib/marketing/messaging.test.ts` reads the **Never say** table below and fails CI when a forbidden phrase reappears in the public source trees.

Sources of truth this map condenses (it does not replace them): `docs/plans/unicorn-homepage-2026-09-19.md` § 2 D1 (hero), `docs/design/unicorn-template.md` (template + copy do/don't), `docs/plans/g14-investor-feedback-2026-09-16.md` (positioning, brand), `docs/plans/SOURCE-OF-TRUTH.md` G10 A4/A5 (public term "8 SVI dimensions"), G12 D4 (doctoral-research sentence + data sentence), H.G13-F1 (TBR public name), memory `business_entity.md` (entity split).

---

## 1. Brand line

| Slot | Line |
|---|---|
| Brand | **Startup Value Index** — *by BlockID*. The product is the index; BlockID (blockid.au) is the platform, entity and domain. |
| Site name (`<title>` default, OG `siteName`, manifest `name`) | `BlockID.au — Startup Value Index` |
| Short name (manifest, chip) | `BlockID` |
| Tagline (3 words) | `A credit score for startups.` (G2) |
| Bio / press / `og:description` (G1) | `BlockID is Australia's startup readiness score — it tells founders what they're worth and where to get money, and tells investors who's ready.` |
| Application name | `BlockID.au` |

## 2. Hero (FI1 / FI2 — verbatim, G21 P0-B; E1/E2 kept as selectable arms via `?hero=`)

| | EN | VI |
|---|---|---|
| **H1 (FI1)** | `Screen every startup on the same evidence-backed framework.` | `Sàng lọc mọi startup trên cùng một khung đánh giá có bằng chứng.` |
| **Sub (FI2)** | `BlockID turns startup applications, pitch decks and company evidence into a comparable Startup Value Index, evaluator dossier and improvement plan — so programs can screen faster and founders know exactly what to improve.` | `hero.line.fi2` in `vi.json` |
| Primary CTA | `Run a cohort pilot` → `/solutions/accelerator#pilot` | `Chạy thử với một cohort` |
| Secondary CTA | `Score my startup` → `/analyze` | `Chấm điểm startup của tôi` |
| Trust line | `Australian-built · Evidence-backed · Founder-controlled data` | — |
| **H1 (E1, legacy arm)** | `Score any Australian startup in 60 seconds.` | `Chấm điểm bất kỳ startup Úc nào trong 60 giây.` |
| **Sub (E2)** | `One rubric for every deal — eight dimensions, an evidence-backed valuation range and an Investor Dossier. Investors, accelerators and advisors use it; founders get the feedback free.` | `Một thước đo cho mọi thương vụ — tám chiều đánh giá, khoảng định giá có bằng chứng và một Hồ sơ Nhà đầu tư. Nhà đầu tư, vườn ươm và cố vấn dùng nó; founder nhận phản hồi miễn phí.` |
| Primary CTA | `Score a startup` → search box / `/analyze` | `Chấm điểm một startup` |
| Secondary CTA | `See a sample dossier` → `/tbr/demo` | `Xem Hồ sơ mẫu` |
| Founder line under the box | `Founder? Get your own score free.` | `Là founder? Nhận điểm của chính bạn, miễn phí.` |

The catalogue of speakable lines (E1/E2, F1–F4, I1–I3, G1–G3) lives in `web/src/lib/marketing/hero-variants.ts`; `messages/{en,vi}.json` mirror them under `hero.line.*`. Nothing else may introduce a new hero line.

## 3. One line per audience (the evaluator ladder first, founders second)

| Audience | Line | Home |
|---|---|---|
| Investor | `Screen the deal in minutes — and every founder you pass on gets the reasons, not silence.` (I2) | `/solutions/investor` |
| Accelerator | `Score every applicant on one rubric, show sponsors the movement week by week.` | `/solutions/accelerator` |
| Advisor | `Every client on the same score, with an evidence-backed valuation range you can put your name to.` | `/solutions/advisor` |
| Founder | `See your startup the way an investor will — your score, what it's worth, and where the money is, in 60 seconds.` (F1) | `/solutions/founder` |

Order on any page that lists audiences: **Investors → Accelerators → Advisors**, founders on the second line ("founders get the feedback free"). Evaluators pay; founders get the feedback free — never the other way round.

## 4. Product vocabulary (canonical names)

| Say | Meaning | Never say |
|---|---|---|
| **Startup Value Index (SVI)** · "SVI score" · "your score" | the 0–100 composite score | "startup index" (lower-case, as a product), "Business ID score", "readiness score" as a product name |
| **8 SVI dimensions** (UI labels) · **eight dimensions** (prose) | the public rubric | "13 criteria" anywhere except `/methodology` (rubric depth) and inside the product/report |
| **Trusted Business Report (TBR)** | the A$3 full report, for founders and for evaluators; also what a guest buys on `/one-click-report` | "Trust BizReport", "One-Click Report" as a product name (say "the A$3 Trusted Business Report"), "Business Report" alone |
| **Investor Dossier** (capitalised) | the evaluator-side report | "investor dossier", "Investor dossier" |
| **Money Finder** | eligibility match for grants/investors | "Do you need money?" as a nav/footer CTA (it stays as the `/funding` page question only) |
| **Founder Radar** | deadline-watch e-mails (Starter bundle) | "Money Radar" in public copy (the workspace tile keeps its name) |
| **Intake link** · **Cohort table** · **Feedback letter** | program tools | — |
| Tiers | Founder: **Free / Starter / Growth** · Evaluator: **Scout / Firm / Program** · B2B: **Fund / Intake link / Index API** · **Cohort 25 / Cohort 100** | "Angel", "Advisor plan", "VC Small", "Founding 100", "Founding 50" |
| Reviewers | "the C-suite of AI agents", "a CFO, CLO, CMO, CRO, CTO, CHRO … each with its own domain module, then an auditor" | any agent count ("11 C-Level agents", "17 / 50+ AI agents"), any provider count ("9 AI providers") |
| Credentials | Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception | anything else |
| Method | "grounded in the founder's doctoral research on multi-model startup valuation" | "PhD" |

Prices (every A$ figure) are lane A's; this map never states one. When a sentence needs the price it reads it from the SKU/plan constant.

## 4b. G21 positioning lines (evidence-backed assessment infrastructure, 2026-09-20)

Adopted from the advisor feedback (`docs/plans/g21-fi-upgrade-2026-09-20.md` § 0). These lines are the approved wording; use them verbatim where they fit and never contradict them elsewhere.

| Slot | Line |
|---|---|
| One-liner | `BlockID helps accelerators and startup programs screen companies consistently by converting founder submissions and company evidence into one comparable, evidence-backed startup assessment.` |
| Three messages (everywhere, in this order) | **Screen faster** · **Trust the evidence** · **Track improvement** |
| Institutional line | `BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.` |
| What the engine does | `Specialised analysis across eight business dimensions, checked against the underlying evidence.` |
| Why not a chatbot | `ChatGPT analyses what you paste; BlockID maintains a structured, evidence-backed company record and applies one methodology across every company and every point in time.` |
| Founder credential | `grounded in the founder's doctoral research on startup valuation` (never "PhD") |
| Integrations by evidence value (G21 P3-C) | `Every connected source tells you which claim it strengthens.` — each connector card states the dimensions and claim keys it backs and the evidence level it reaches (L4 connected source, L5 transaction data); a source past its 90-day refresh window is labelled **stale** and its proof expires; nothing is promised for a connector we do not offer |

**Naming architecture** (sub-products — copy only, no URL changes, F-6):

| Name | Meaning |
|---|---|
| **BlockID** | the platform, entity and domain |
| **Startup Value Index™** | the methodology and the score |
| **BlockID Dossier** | the evaluator output (formerly "Investor Dossier" in prose — the product name stays capitalised where it already renders) |
| **BlockID Cohort** | the program workflow (intake → assessment → selection → program → demo day → sponsor reporting) |
| **BlockID Workspace** | the founder surface |
| **BlockID Verified** | the verification state (L2+ business verification, reviewer-approved evidence) |
| **Trusted Business Report** | unchanged — the A$3 legacy pay-as-you-go SKU, never a value anchor |

Buyer order on any page: **Programs (accelerators, incubators, universities, innovation programs, venture studios) → Investors → Founders**; founders own their data and remain the participant and secondary customer.

## 5. Tone rules

- Short, concrete, **Australian English** (organisation, capitalise, licence, programme → we use "program" for accelerator programs as the sector does).
- No hype adjectives: never "revolutionary", "cutting-edge", "world-class", "unparalleled", "game-changing", "next-generation".
- Numbers only when live or verifiable (60 seconds = the on-screen free score; 8 dimensions = the shipped rubric). No user counts, no agent counts.
- Numerals in UI labels, chips, tables and meta descriptions (`8 SVI dimensions`); words in prose sentences (`eight dimensions`). VI prose: `tám chiều đánh giá`; VI labels: `8 chiều`.
- Verbs first in CTAs. One primary CTA per screen.
- No "beta", "coming soon", "launching soon", "waitlist" on a public page — a feature is either live and linked, or absent.
- No "SOC 2" / "SOC2" claim; the truthful phrase is "hash-chained audit trail".
- Sign-off in e-mails: `BlockID · Startup Value Index`.

## 6. Meta title / description patterns

- Root template: `%s | BlockID.au` (`web/src/app/layout.tsx`). Pages pass a **core title only** via `pageMetadata({ title })`; never append "· BlockID" or "| BlockID.au" themselves. Rendered `<title>` ≤ 60 characters.
- Homepage title = E1 without the full stop: `Score any Australian startup in 60 seconds | BlockID.au`.
- Descriptions 140–165 characters, one promise + one audience, numerals allowed, no price unless lane A's pricing page.
- OG card (`/opengraph-image`): headline = E1, sub = `Startup Value Index · by BlockID`, alt = `Score any Australian startup in 60 seconds · BlockID.au`.
- JSON-LD `Organization`: `name: "BlockID.au"`, `legalName: "Auschain PTY LTD"`, `taxID: "79 659 615 111"`, `description` = G1. `WebSite.name: "BlockID.au — Startup Value Index"`, `alternateName: ["BlockID", "Startup Value Index"]`.

## 7. CTA vocabulary

| Intent | Label |
|---|---|
| Evaluator primary | `Score a startup` |
| Evaluator secondary | `See a sample dossier` |
| Pilot | `Start a pilot` |
| Founder primary | `Get your score free` |
| Buy the TBR | `Get the Trusted Business Report` (+ the SKU price from lane A's constant) |
| Pricing | `See pricing` |
| Contact | `Talk to us` |

Retired CTA labels: "Get my SVI score", "Get One-Click Report", "Join Founding 50", "Get Founding 100", "Do you need money?" (nav).

## 8. Entity lines (deliberate split — keep both)

- **Source:** `web/src/lib/site/legal-entity.ts` (`LEGAL_ENTITY`) — the only place either name, the ACN or the ABN may be spelled (guard: `legal-entity.test.ts`).
- **Marketing / footer / about**: the brand block names `PPL Food PTY LTD` (`marketingOperator`); the footer bottom row is `marketingLine()` = "© YYYY BlockID · built by PPL Food PTY LTD · Billing, legal and invoices: Auschain PTY LTD ABN 79 659 615 111 · Sydney NSW" — both roles explicit on every page since G21 P0 (advisor feedback: an inconsistent identity is a trust defect; founder default F-1 keeps the split but renders it consistently).
- **Billing, legal, invoices, JSON-LD `Organization`, e-mail footer, PDF cover, TrustBand**: `Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW` (`statutoryLine()` / `sellerOfRecordLine()`).

## 9. The data sentence (verbatim, founder-approved 2026-09-10)

> Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.

Constant: `DATA_PRINCIPLE_SENTENCE` in `web/src/lib/valuation-certificate/types.ts`; i18n `solutions.principle.data` / `intake.consent.sentence`.

## 10. The disclaimer sentence

> BlockID scores and valuation ranges are information, not financial, legal or investment advice. Evaluators and founders make their own decisions.

Short form for footers and PDF covers: `Not financial advice.`

## 11. Never say (machine-read by `messaging.test.ts`)

`web/src/lib/marketing/messaging.test.ts` parses this table. Column 1 holds one or more regular expressions in backticks (JavaScript syntax, `\|` is a literal pipe inside a table cell; flags after a trailing `/i`). Column 3 lists path prefixes (relative to `web/`) in backticks that are exempt for that row; `—` means none. Comments in `.ts`/`.tsx` are stripped before matching, so a code comment may cite a retired phrase; a string may not.

| Phrase (regex) | Why | Allow-list |
|---|---|---|
| `Know your startup's SVI score` | pre-G17 hero | — |
| `readiness in 30 seconds` | retired hero ("fundraising / investor-readiness in 30 seconds") | — |
| `Get my SVI score` | retired CTA | — |
| `Get One-Click Report` | retired CTA; the product is the Trusted Business Report | — |
| `Trust BizReport` | pre-F1 name | — |
| `Founding 100` `Founding 50` | retired offer | `src/app/version/` `src/app/docs/` |
| `A\$5\.50` | retired price | `src/app/(marketing)/roadmap/` `src/app/(marketing)/changelog/` |
| `\b(50\+\|17\|11) (AI[- ])?(C-Level )?(AI )?[Aa]gents` | never state an agent count | `src/app/(marketing)/about/invest/` (lane B facts page — G18-C asked for "a C-suite of AI agents") `src/app/(marketing)/roadmap/` `src/app/(marketing)/changelog/` |
| `\b\d+ AI providers` | never state a provider count | — |
| `13 criteria` `Thirteen criteria` `13-criteria` | rubric depth is not the public term | `src/app/(marketing)/methodology/` `src/app/(marketing)/docs/` `src/app/docs/` `src/app/(marketing)/about/` `src/app/(marketing)/roadmap/` `src/app/(marketing)/changelog/` `src/components/svi/` `src/lib/pdf/` `src/app/(app)/(founder)/workspace/evaluations/` `src/app/(app)/(founder)/workspace/investor/startup/` (G20-F3: the Investor Dossier and its interstitial are inside the product — the rubric depth the evaluator paid for) |
| `\bbeta access\b` `\bin beta\b` `\bpublic beta\b` | no beta claims | `src/app/(marketing)/roadmap/` `src/app/(marketing)/changelog/` |
| `coming soon/i` | nothing is "coming soon" on a public page | `src/app/(marketing)/roadmap/` `src/app/(marketing)/changelog/` |
| `\bBeta\b` | G20-F3 (2026-09-20): no "Beta" chip on a signed-in surface either — a feature is live or hidden (G20 F1 owns hiding). Case-sensitive so `v2.0.0-beta.N` identifiers and "beta users" on a readiness checklist stay legal | `src/app/startup-index/` (G20-F1 decides per page: hide or un-badge — drop this prefix when F1 lands) `src/app/(app)/(admin)/admin/listings/` (a directory category name, "Beta launch", on the founder-only listings to-do) |
| `not available yet` `not available on this environment` | G20-F3: no placeholder state on a reachable page — G20-F1 replaces each with the "Not offered yet — talk to us" card or hides the route | `src/app/(app)/(founder)/workspace/weekly-digest/` `src/app/(app)/(founder)/workspace/settings/enterprise/` `src/app/(app)/(founder)/workspace/finance/revenue/` `src/app/(app)/(founder)/workspace/investor/team/` `src/app/(app)/(founder)/workspace/evaluations/[evaluationId]/dossier/assessment/` (all five are on G20-F1's hidden list — drop each prefix as F1 lands it) |
| `SOC ?2 Type` | no SOC 2 audit exists | — |
| `[Ii]nvestor dossier` | capitalise the product | — |
| `Australian startup index` `startup index report` `startup index dataset` | brand is Startup Value Index | — |
| `Angel plan` `Advisor plan` `VC Small` | tiers are Scout / Firm / Program | — |
| `\bPhD\b` | founder rule — "doctoral research" | — |
| `AI-Powered Startup Intelligence` `BlockID Startup Intelligence` | retired brand line | — |
| `\bC-Level agents\b` `\b\d+ AI agents\b` | G21 P0-D: agent counts and "C-Level agents" as a selling point stay inside the product and the docs — public copy says "specialised analysis across eight business dimensions, checked against the underlying evidence" | `src/app/(marketing)/product/` `src/app/docs/` `src/app/(marketing)/docs/` `src/app/startup-package/` `src/app/(app)/` `src/components/workspace/` `src/components/paywall/` `src/app/(marketing)/about/invest/` (G18-C facts page — recommend rewording to "a C-suite of AI agents", owner: about page) |
| `A\$3, not A\$3,000` | G21: the A$3 price is a legacy SKU, never the value anchor or a comparison hook | — |
| `\bAI decides\b` `\bthe AI decides\b` | G21: BlockID structures the evidence and standardises the first pass; humans make the decision | — |
| `\bpredicts\b` `prediction accuracy` | G21: no forecasting claims — calibration is published with n and confidence intervals, never "predicts" | — |
| `Australian average` | G21: no benchmark without its n — say "stage median (n = N)" or "the cohort at the same stage (n = N)" per docs/product/score-governance.md § 7 | `src/components/marketing/homepage/` (P0-B owns the homepage sample cards — replace with the stage median + n) |
| `two-sided marketplace` | G21: marketplace is a later expansion module, not the current positioning | — |
| `\bAU average\b` `\bnational average\b` `\bsector average\b` `\bindustry average\b` | G21 P1-C: same rule as "Australian average" — no aggregate without its n; every median / percentile line comes from `lib/benchmarks/publication-rules.ts` (`formatBenchmarkLine` → "SaaS / Pre-seed benchmark — median 64 (n = 47)", "indicative (n = 14)", or "not enough comparable companies (n = N)"). G21 P1 review: the free summary PDF prints the published stage median + n or the not-enough line — no allow-list | — |

Documented exceptions that are **not** in the table because they are true: "beta users" as an item on a founder's own readiness checklist (`api/fundraise/readiness`), "GitHub or GitLab repository" as advice about the founder's own code (`api/score`), `v2.0.0-beta.N` release identifiers on `/security-audit`, `/roadmap`, `/changelog`, "13 criteria" inside the product (dossier, credit gate, PDF body) where it is the rubric depth the evaluator paid for. "Money Radar" remains the in-workspace tile name of the Founder Radar bundle (lib/funding is not a marketing surface); public copy says Founder Radar.
