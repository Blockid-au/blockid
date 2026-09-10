# Hero one-liner test protocol (G11 §4i D-5 · T0250)

> **Source of truth: [SOURCE-OF-TRUTH.md](./SOURCE-OF-TRUTH.md)** — this file is the test method only. Candidate lines live in code at [`web/src/lib/marketing/hero-variants.ts`](../../web/src/lib/marketing/hero-variants.ts) (mirrored in `messages/en.json` / `vi.json` under `hero.line.*`); the copy rules are G9 [`value-first-hero-goal.md`](./value-first-hero-goal.md); the candidates and their rationale are [`money-finder-2026-09-10.md`](./money-finder-2026-09-10.md) §4i D-5. **Winners are recorded in the G9 goal doc, not here.**

## 0. What is being tested

| Slot | Default (shipped 2026-09-10) | Arms under test |
|---|---|---|
| Homepage H1 | **F1** "See your startup the way an investor will — your score, what it's worth, and where the money is, in 60 seconds." | F1 · F2 · F3 via `?hero=` |
| Homepage sub-line | **F3** (on the F3 arm the H1 and sub-line swap, so F1 becomes the sub-line) | — |
| Site `og:description` (`SITE_DESCRIPTION`, `app/layout.tsx`) | **G1** | — (qualitative only) |
| Tagline (bios, signatures) | **G2** "A credit score for startups." | — |
| Spoken / elevator | **F4**, **G3** | say-it-back only |
| Investor (`/solutions/investor`, not yet wired) | **I1** candidate | I1 · I2 · I3 (5-second + say-it-back only) |

Every line has already passed the automated gate (`hero-variants.test.ts`): ≤ 2 sentences, ≤ 20 words per breath unit (VI: ≤ 28 syllables), no "SVI" / "SCN" / "tokenisation" / "PhD". The human tests below decide *which* passing line wins.

## 1. The 5-second test (recall + intent)

**Who:** 10 founders + 5 investors (Fishburners / TCIH, Startmate alumni, Sydney Angels contacts) for EN; **5 Vietnamese-speaking founders** for the VI lines. Same people can do both tests in one 15-minute call.

**How:**
1. Show one line, full-screen, plain text, for **5 seconds**. Then blank.
2. Ask, in this order, without prompting:
   - "What does it do?"
   - "Who is it for?"
   - "Would you click? (yes / maybe / no)"
3. Score each answer 0/1: *does* (score / worth / money named), *who* (founder or investor named), *click* (yes = 1).
4. Rotate the order of lines per person (Latin square) so no line always goes first.
5. Test the founder lines with founders, the investor lines with investors, G1/G2 with everyone.

**Pass mark:** a line needs **≥ 70 % on "does"** and **≥ 70 % on "who"** across its audience to stay in the pool. "Click" is the tie-breaker.

## 2. The say-it-back test (speakability)

1. Read the line aloud once, at normal pace (it should take under 6 seconds — if it does not, the line fails on the spot).
2. Wait 10 seconds of unrelated talk.
3. Ask: "Say it back in your own words."
4. Score 1 if the *promise* survives (score + worth + money for founder lines; score + evidence + faster screening for investor lines), even if the wording changes.

**Pass mark:** **≥ 70 % say-back**; drop any line under that regardless of its 5-second score. Run VI lines with the 5 VI founders; score against the VI promise.

## 3. Production A/B (`?hero=` arms + GA4)

The homepage always server-renders **F1**. The client swaps the H1 to F2 or F3 only when the URL carries `?hero=F2` / `?hero=F3` (case-insensitive; anything else is ignored and F1 stays). There is no cookie or server-side bucketing — arms are assigned by the *link* the visitor arrives on, which is what we control in ads, posts and emails.

**Assignment.** Split each traffic source evenly across `https://blockid.au/`, `https://blockid.au/?hero=F2`, `https://blockid.au/?hero=F3` (use the same `utm_*` on all three so source is held constant). `pickHeroVariant({ seed })` in the catalogue module gives a deterministic FNV-1a bucket for any tool that wants to assign per recipient (e.g. seed = email hash in a mailing).

**Events (already firing, `web/src/lib/analytics.ts`):**

| Event | Params | Fired |
|---|---|---|
| `hero_variant_shown` | `arm` = `F1` / `F2` / `F3` | once per homepage mount |
| `svi_submitted` | `method`, `has_file`, **`arm`** | when the hero omnibox is submitted |
| `cta_clicked` | `cta_id`, `location` | existing; `cta_id = need_money` is the nav "Do you need money?" button |

**GA4 setup:** register `arm` as a custom dimension (event-scoped) once; build one exploration: sessions with `hero_variant_shown` by `arm` → conversion = `svi_submitted` same session (primary) and `cta_clicked{need_money}` (secondary).

**Sample size / duration:** **2 weeks or 500 sessions per arm**, whichever comes first. Do not read results before 200 sessions per arm.

**Decision rule:** the winner is the arm with the highest omnibox submit rate whose lift over F1 is ≥ 15 % relative with the 500-session sample; otherwise F1 stays (it is the incumbent and the search title). Ties go to the line with the better say-it-back score.

## 4. Recording the result

1. Add a dated row to the **G11-P14 note** in [`value-first-hero-goal.md`](./value-first-hero-goal.md): winner id, submit rate per arm, sessions per arm, 5-second and say-back scores, tester counts.
2. If the winner is not F1: change `HERO_DEFAULT_ARM` in `hero-variants.ts` (the SSR default and the `hero_variant_shown` default follow it), update the homepage `metadata.title` first breath, and re-run `hero-section.test.tsx`.
3. Roll the winner to the other surfaces listed in the plan §4i D-5 step 5 (`/solutions/founder|investor`, directory bios, pitch deck slide 1, email signatures, `/team`, README tagline). Retire the losing arms from the `?hero=` switch only after the A/B is closed, so old links keep working during the test.
4. Any line that had to be softened for truth (G9/G10) is noted in the catalogue file header; the current one is **F3** ("the grants you qualify for — free" → "every open Australian grant — free", because the eligibility match is the A$3 Money Finder and the free thing is the directory).
