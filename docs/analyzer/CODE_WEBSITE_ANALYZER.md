# Code & Website Analyzer

Bổ sung một **PTD sub-score** cho SVI và một **valuation adjuster** đơn giản,
dựa trên tín hiệu thu được từ (a) một GitHub repo URL và/hoặc (b) một website URL.

Sống chung — không thay thế — với `lib/agents/tech-intelligence.ts` (đã có, phức tạp hơn,
gọi LLM). Analyzer này là **lightweight, deterministic, cheap**: không LLM, chỉ HTTP fetch
+ optional PageSpeed Insights API.

---

## Contract

**Input** (`POST /api/analyzer/run`):

```json
{
  "startup_id": "uuid",       // required — enforce multi-startup scope
  "github_url":  "https://github.com/owner/repo",   // optional
  "website_url": "https://example.com"              // optional
}
```

Ít nhất một trong `github_url` / `website_url` phải có mặt (400 nếu thiếu cả hai).

**Output**:

```json
{
  "ok": true,
  "sub_score": 72,                     // 0-100 (PTD supplement)
  "valuation_adjuster_pct": 5,         // -10 | 0 | 5 | 12
  "rationale": ["…", "…"],
  "signals": { "github": {…}, "website": {…} },
  "run_id": "uuid"
}
```

---

## Signals

### GitHub (`lib/analyzer/github.ts`)

Dùng REST v3, `Authorization: Bearer ${GITHUB_TOKEN}` nếu env có.
Fetch song song để giữ latency thấp; fallback về giá trị an toàn khi 404/403/rate-limit.

| Signal            | Nguồn                                     | Ghi chú                        |
|-------------------|-------------------------------------------|--------------------------------|
| commitsPerMonth   | `/repos/{o}/{r}/commits?since=…&per_page=100` | last 90d, chia 3               |
| contributors      | `/repos/{o}/{r}/contributors?per_page=100` | length (max 100)               |
| stars             | `/repos/{o}/{r}` → `stargazers_count`     |                                |
| primaryLanguage   | `/repos/{o}/{r}` → `language`             |                                |
| hasTests          | Search `path:test OR path:tests OR path:spec` via `/repos/{o}/{r}/contents/` roots | best-effort dir probe |
| hasCI             | Root probe `.github/workflows`             | list contents; count > 0        |
| license           | `/repos/{o}/{r}` → `license.spdx_id`      | null nếu không có              |
| readmeCompleteness | `GET /repos/{o}/{r}/readme` → base64 length | 0 nếu thiếu, `min(len/2000,1)` |

**Fallback:** không có token → dùng unauthenticated (60 req/hr) và swallow lỗi thành `null`.

### Website (`lib/analyzer/website.ts`)

| Signal          | Cách đo                                                        |
|-----------------|----------------------------------------------------------------|
| https           | `url.protocol === "https:"`                                    |
| ttfbMs          | `Date.now()` diff giữa `fetch()` bắt đầu và first response byte |
| perf/seo/a11y   | PSI API nếu `PSI_API_KEY` set; else heuristic từ HTML         |
| hasSitemap      | `HEAD /sitemap.xml` → 200                                     |
| hasRobots       | `HEAD /robots.txt` → 200                                      |
| metaTagCount    | Regex `<meta …>` trong HTML `<head>`                          |

**PSI fallback heuristic** (khi thiếu key):
- perf: base 60, +10 nếu TTFB < 300ms, +10 nếu HTML < 200KB, −10 nếu > 1MB
- seo:  base 60, +15 nếu có `<meta name="description">`, +10 nếu có `<title>`, +5 sitemap, +5 robots
- a11y: base 60, +10 nếu `<html lang=…>`, +10 nếu tất cả `<img>` có `alt`, +5 nếu `<meta name="viewport">`

Timeout hard: 10s cho website fetch, 15s cho PSI. Không throw — trả về `null` fields.

---

## Scoring (`lib/analyzer/score.ts`)

**Pure function**. Không I/O, không lấy env. Toàn bộ số học nằm ở đây để test dễ.

### Per-signal normalization (0-100)

GitHub:
- `commitsPerMonth`: 0 → 0, 10 → 60, 30+ → 100 (piecewise linear)
- `contributors`:   1 → 20, 3 → 60, 10+ → 100
- `stars`:          0 → 0, 50 → 50, 500+ → 90, 5000+ → 100
- `hasTests`:       false → 0, true → 100
- `hasCI`:          false → 0, true → 100
- `license`:        null → 0, OSI-approved (`MIT`,`Apache-2.0`,`GPL-*`,`BSD-*`,`MPL-*`,`ISC`) → 100, other → 50
- `readmeCompleteness`: 0-100 (đã normalize sẵn)

Website:
- `https`:          false → 0, true → 100
- `ttfbMs`:         >2000 → 0, 500 → 60, <100 → 100
- `perf/seo/a11y`:  giữ nguyên (đã 0-100)
- `hasSitemap`:     bool → 0/100
- `hasRobots`:      bool → 0/100
- `metaTagCount`:   <2 → 0, ≥8 → 100 (linear)

### Weights (per side, normalized to 100%)

GitHub side:
```
commitsPerMonth       20
contributors          10
stars                  8
hasTests              18
hasCI                 12
license                7
readmeCompleteness    10
primaryLanguage        5    // small bonus nếu có
sum:                 90 → normalized × 100/90
```

Website side:
```
https                 10
ttfbMs                10
perf                  20
seo                   15
a11y                  10
hasSitemap             5
hasRobots              5
metaTagCount           5
sum:                  80 → normalized × 100/80
```

### Combined sub_score

- Cả 2 → `sub_score = round(0.6 * github_side + 0.4 * website_side)`
- Chỉ GitHub → `sub_score = github_side`
- Chỉ Website → `sub_score = website_side`

### Valuation adjuster

```
sub_score < 40        → -10 %
40 <= sub_score < 70  →   0 %
70 <= sub_score < 85  →  +5 %
sub_score >= 85       → +12 %
```

### Rationale

Array of short human-readable strings — top 5 positive + top 3 negative signals (sorted by weighted contribution). Rendered on UI.

---

## Persistence

Table `analyzer_runs` (migration `20260815120000_analyzer_runs.sql`):

```sql
CREATE TABLE analyzer_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                  UUID,                     -- best-effort, nullable
  github_url               TEXT,
  website_url              TEXT,
  signals                  JSONB NOT NULL,
  sub_score                INTEGER NOT NULL CHECK (sub_score BETWEEN 0 AND 100),
  valuation_adjuster_pct   NUMERIC(5,2) NOT NULL,   -- e.g. -10, 0, 5, 12
  rationale                JSONB NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX analyzer_runs_startup_created_idx
  ON analyzer_runs (startup_id, created_at DESC);
ALTER TABLE analyzer_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own analyzer runs" ON analyzer_runs FOR SELECT
  USING (auth.uid() IS NULL OR auth.uid() = user_id);
CREATE POLICY "service role writes" ON analyzer_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

Multi-startup rule: **mọi row bắt buộc có `startup_id`**. API route rejects request nếu thiếu.

---

## SVI wiring

Trong `lib/analyzer/svi-adjustments.ts`:

```ts
export async function pullLatestAnalyzerAdjustments(projectId): Promise<{
  ptdBoost: number;              // additive points (0-30) added to PTD raw
  valuationAdjusterPct: number;  // percentage adjust for final valuation
} | null>
```

- Pull `SELECT * FROM analyzer_runs WHERE startup_id = $1 ORDER BY created_at DESC LIMIT 1`
- PTD boost: `(sub_score - 50) * 0.3` (weight 0.3 theo yêu cầu), clamped to [-30, +30]
- Valuation adjuster: pass-through

Call sites:
1. `lib/startup-package/svi-recompute.ts` — sau khi extract signals + trước khi call `computeSVI`, gọi analyzer helper để lấy `ptdBoost`, wire vào `repoAuditBoosts.ptdBoost` (cùng slot với repo audit — additive). Không đụng công thức `computeSVI` để giữ backward-compat với 100+ test.
2. `lib/valuation.ts` — thêm optional `valuationAdjusterPct` vào `ValuationInput`, apply sau khi `midAud` được tính (cùng lúc với low/high). Nếu không set → 1.0×.

---

## UI

`app/(app)/(founder)/dashboard/analyzer/page.tsx`:

- Server component fetch danh sách projects của user → dropdown chọn startup.
- Client form với 2 URL input (validate: ≥1 field).
- Submit → `POST /api/analyzer/run`.
- Hiển thị sub_score, valuation adjuster, và rationale list.

---

## Non-goals

- Không gọi ChatGPT/Claude (đã có tech-intelligence cho path đó).
- Không đo bundle size / dependencies (out of scope).
- Không lưu deep GitHub archive; chỉ signals snapshot.
- Không real-time streaming — one-shot POST, chờ đến khi tất cả HTTP calls xong.

## Rollout

1. Apply migration `20260815120000_analyzer_runs.sql`.
2. Set `GITHUB_TOKEN` (repo-read scope enough) + `PSI_API_KEY` (Google) trong `.env.local` / production secrets. Both optional — analyzer degrades gracefully.
3. Navigate to `/dashboard/analyzer` → smoke test.
