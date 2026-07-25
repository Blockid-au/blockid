# Remotion — HowItWorks composition

A 30-second, 1920x1080, 30fps explainer video for the BlockID landing page.
Six sequences of 150 frames each: Search, Onboard, Score, Build, Raise, Outro.

## Layout

```
remotion/
  index.tsx                    # registerRoot + <Composition id="HowItWorks" />
  how-it-works/
    theme.ts                   # colours, font stacks, easings, scene BGs
    composition.tsx            # master composition + shared SceneShell
    scene-search.tsx           # 01 — typing search bar
    scene-onboard.tsx          # 02 — 5-dot progress rail + form card
    scene-score.tsx            # 03 — SVI gauge + 13-bar chart + sparkline
    scene-build.tsx            # 04 — 2x5 template grid + cap-table
    scene-raise.tsx            # 05 — envelope + flying investor chips
    scene-outro.tsx            # 06 — wordmark + URL
```

Copy for the scenes is imported directly from
[`web/src/content/how-it-works-copy.ts`](../web/src/content/how-it-works-copy.ts).
Only the `.en` field is used; a Vietnamese render would be a separate pass.

## Preview (Remotion Studio)

```bash
cd web
npm run video:preview
```

This opens Remotion Studio at http://localhost:3000 (or the next free port)
so you can scrub the timeline scene-by-scene.

## Render (MP4)

```bash
cd web
npm run video:render
```

Output: `web/public/media/how-it-works.mp4` — h264, yuv420p, CRF 28.

### System requirements

- **Chromium** is auto-downloaded by `@remotion/renderer` on first run
  (~150 MB). No manual step — Remotion prints its own progress bar.
- **ffmpeg** must be on `$PATH`. If missing, Remotion prints an install hint
  for the current platform; do not add a shim here.
- **CI**: this is intentionally a manual, post-merge step. Do not wire the
  render into the build pipeline — the video changes rarely and the binary
  is small enough to commit.

## No external network calls

- Fonts: system stack only (`-apple-system`, `Segoe UI`, ...).
  No Google Fonts, no `<link rel="stylesheet">`.
- Icons: inline SVG paths sourced from lucide (ISC-licensed). If we later
  extract this composition into its own package, keep the ISC notice.
- Images: none. All visuals are drawn from primitives so the render is
  fully deterministic and offline-safe.
