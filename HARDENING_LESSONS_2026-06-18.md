# Post-mortem & hardening — 2026-06-18 blockid.au outage

## Timeline
- 11:43 UTC — Container running cleanly, but `/api/index/*` routes had been silently 500-ing for unknown duration (turbopack chunk-load bug).
- 12:06 UTC — Triggered rebuild to fix it. Build #1 succeeded but reproduced same turbopack bug.
- 12:14 UTC — Switched `next build` → `next build --webpack`. Build #2: docker COPY of turbopack-specific dir `chunks/ssr` failed (webpack doesn't generate it), but `docker build … | tail -5` masked the failure. deploy.sh continued and "deployed" the OLD turbopack image.
- 12:30 UTC — Removed `COPY chunks/ssr`. Build #3 produced webpack output but `chunks/webpack-runtime.js` missing from `.next/standalone/` — Next.js standalone tracing doesn't auto-include it. Container `unhealthy`, every route 500.
- 23:38 UTC — User reported total outage. Added explicit `COPY .next/server/chunks` in Dockerfile + fail-loud deploy.sh + API-aware healthcheck.

## Root causes (4 cascading)

### 1. Next.js 16 turbopack standalone bug
Next 16.x makes turbopack default for `next build`. Generated route manifests reference chunks at `.next/server/chunks/[root-of-the-server]__*._.js`, but turbopack writes them to `.next/server/chunks/ssr/` only. Standalone runtime can't load them → `ChunkLoadError` on every async route. Fix: `next build --webpack`.

### 2. Dockerfile coupled to turbopack output shape
Original Dockerfile had `COPY /app/.next/server/chunks/ssr` — required by turbopack standalone, but webpack doesn't emit `ssr/`. Switching builders broke the build silently.

### 3. Webpack standalone misses runtime chunks
Next.js `output: "standalone"` traces imports but doesn't auto-include the webpack-runtime / shared chunks at `.next/server/chunks/`. Must explicitly `COPY .next/server/chunks`.

### 4. deploy.sh masked failures
`docker build … 2>&1 | tail -5` swallows non-zero exit codes from the pipe head — `set -e` doesn't trigger because pipefail wasn't on. Build error scrolled past, script continued to deploy step which redeployed the previous image. "Container healthy!" from a healthcheck that only tested `/` (which can return 200 even when every API route 500s).

## Hardening shipped 2026-06-18

| Change | File | Why |
|---|---|---|
| `set -eo pipefail` | `deploy.sh` | pipe failures now propagate |
| Tee full docker build log, grep for ERROR/failed | `deploy.sh` | catch silent build failures even on exit 0 |
| Post-deploy API smoke tests (`/api/index/headlines` etc.) | `deploy.sh` | catch route-level breakage container healthcheck misses |
| `HEALTHCHECK` now hits `/` AND `/api/index/headlines` | `Dockerfile` | container marked unhealthy if API broken, not just root |
| Explicit `COPY .next/server/chunks` | `Dockerfile` | webpack runtime no longer missing from standalone |
| Comment block above `--webpack` flag in package.json | n/a | flag rationale documented |
| Build command pinned to `next build --webpack` | `web/package.json` | turbopack default in Next 16+ unreliable for standalone |

## Rules going forward

1. **Never pipe `docker build` output through `tail`/`head` without capturing exit code.** Always `tee` to file + check via `${PIPESTATUS[0]}` or `set -o pipefail`.
2. **Container healthchecks must include at least one DB/cache-touching API route.** Root path can serve a static page even when backend is broken.
3. **After every deploy, smoke-test critical API routes — not just the homepage.** Add to deploy.sh, not "I'll remember to curl manually".
4. **When changing build tooling (turbopack ↔ webpack, etc.), verify the Dockerfile assumptions hold for both.** Don't keep dead COPY lines that fail on the new builder.
5. **Pin Next.js builders explicitly (`--webpack` or `--turbopack`) rather than relying on defaults.** Next.js can flip the default between minor versions.
