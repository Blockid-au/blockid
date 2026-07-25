# How It Works — 30s Remotion Storyboard

_Owner: media / remotion agent. Date: 2026-07-25._

The landing hero copy is fixed:

> **See How It Works — Watch how BlockID helps founders go from idea to
> investor-ready in minutes.**

This document is the source-of-truth storyboard for the accompanying MP4 that
will be rendered by Remotion and served from
`web/public/media/how-it-works.mp4`. It is deliberately code-adjacent (scene
names match component filenames) so that the composition can be built without
re-designing anything.

---

## 1. Composition contract

| Field        | Value                                                    |
|--------------|----------------------------------------------------------|
| id           | `HowItWorks`                                             |
| resolution   | 1920 x 1080 (16:9)                                       |
| fps          | 30                                                       |
| duration     | 900 frames (30.0 s)                                      |
| audio        | none in v1 (defer — no bundled royalty-free source)      |
| output       | `web/public/media/how-it-works.mp4`                      |
| codec        | h264, crf 28, yuv420p, faststart                         |
| target size  | < 3 MB (schematic UI + solid panels compress well)       |

Scene budget (30s = 900 frames):

| # | Scene    | Frames    | Seconds     |
|---|----------|-----------|-------------|
| 1 | search   | 0 – 150   | 0.0 – 5.0   |
| 2 | onboard  | 150 – 300 | 5.0 – 10.0  |
| 3 | score    | 300 – 450 | 10.0 – 15.0 |
| 4 | build    | 450 – 600 | 15.0 – 20.0 |
| 5 | raise    | 600 – 750 | 20.0 – 25.0 |
| 6 | outro    | 750 – 900 | 25.0 – 30.0 |

Each scene overlaps the next by ~10 frames (300 ms) via a `Sequence` crossfade
handled inside the parent `composition.tsx` so the cuts feel like a single
continuous take rather than six independent slides.

---

## 2. Design tokens (`remotion/how-it-works/theme.ts`)

Colors mirror the landing fintech palette (`--fintech-accent`, ink, etc.) but
resolved to concrete hex so the render is deterministic and does not depend on
CSS variables.

```ts
export const THEME = {
  fps: 30,
  bg: {
    search:  "#0B1220", // deep navy
    onboard: "#0F172A", // slate 900
    score:   "#0B1F2A", // teal-tinted navy
    build:   "#0A1F1B", // deep emerald
    raise:   "#160B24", // indigo-violet
    outro:   "#050914", // near-black
  },
  ink:       "#F8FAFC",
  inkMuted:  "#94A3B8",
  border:    "rgba(148,163,184,0.18)",
  accent:    "#22D3EE", // fintech cyan
  accentAlt: "#A78BFA", // violet for contrast beats
  ok:        "#34D399",
  warn:      "#F59E0B",
  gridLine:  "rgba(148,163,184,0.10)",
  // System stack only — never fetch from Google Fonts.
  fontDisplay: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontMono:    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const;

// One easing token so all scenes share rhythm.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // "quart out"
export const EASE_IO  = [0.65, 0, 0.35, 1] as const;
```

Spacing rhythm across all scenes:

- Outer safe area: 96 px on all sides (fits inside 1920x1080 broadcast-safe).
- Step number: 320 px, `font-weight: 800`, `opacity: 0.10`, absolutely top-left.
- Headline: 88 px, weight 700, appears at frame +12.
- Sub-copy: 34 px, weight 500, opacity 0.72, appears at frame +24.
- Icon chip: 96 x 96 rounded 24, accent-tinted, appears at frame +6.
- Mock UI card: right-aligned, max 900 x 720, appears at frame +36 with a
  4 px translate-up plus opacity fade.

---

## 3. Scene-by-scene

Every scene renders on a full-screen `AbsoluteFill` painted with the panel
color from `THEME.bg`. The **left column** carries the messaging; the **right
column** carries the schematic UI mockup — the founder's mental model of what
happens in that step.

All animations use `spring()` or `interpolate(frame, [...], [...], { easing })`.
No 3D, no video, no external assets — everything is SVG/DOM so the encoder
loves it and the MP4 stays under 3 MB.

### Scene 1 — Search (`scene-search.tsx`)

- **Step number**: `01`.
- **Icon**: `Search` (lucide) rendered as inline SVG (see §4).
- **Headline**: "Search any idea."
- **Sub-copy**: "Type a company, ABN, or URL — BlockID pulls public signals in
  seconds."
- **Mock UI**: schematic search bar (rounded 999, 640 px wide) that types out
  the string `"quantum battery startup"` one character every 2 frames using
  `interpolate` on `frame`. Below the bar, three "result" pills fade in
  staggered by 8 frames each. A little glowing cursor blinks (opacity oscillates
  via `Math.sin(frame / 8)`).
- **Motion signature**: horizontal sweep in from the left; the search bar acts
  as the visual anchor.

### Scene 2 — Onboard (`scene-onboard.tsx`)

- **Step number**: `02`.
- **Icon**: `ClipboardList`.
- **Headline**: "Onboard in five steps."
- **Sub-copy**: "Pick your phase and goal. We seed the workspace with real
  templates."
- **Mock UI**: a horizontal 5-dot progress rail. Dots activate one-by-one every
  20 frames (dot 1 at f=40, dot 5 at f=120). Under the rail, a schematic form
  card shows two labelled fields ("Phase", "Primary goal") whose captions
  swap on dot activation (idea → validate → seed → grow → raise).
- **Motion signature**: rhythmic left-to-right pulse matching the stepper.

### Scene 3 — Score (`scene-score.tsx`)

- **Step number**: `03`.
- **Icon**: `Gauge`.
- **Headline**: "Score against 13 criteria."
- **Sub-copy**: "The Startup Value Index shows exactly where you stand."
- **Mock UI**: a schematic dashboard: (a) a semicircular SVG gauge that sweeps
  from 0 → 72 using `spring({ frame, fps, config: { damping: 14 } })`;
  (b) beside it, a 13-row bar chart where each bar animates its width
  independently, staggered by 3 frames; (c) a mini trend sparkline underneath
  drawn with `stroke-dasharray` reveal.
- **Motion signature**: needle sweep + bar bloom = "measurement happening".

### Scene 4 — Build (`scene-build.tsx`)

- **Step number**: `04`.
- **Icon**: `FolderKanban`.
- **Headline**: "Build your data room."
- **Sub-copy**: "Cap table, vesting, and 10 investor-ready templates — seeded
  on day one."
- **Mock UI**: a 2 x 5 grid of document tiles (each with a fake title line and
  a thin sparkbar). Tiles drop into place one at a time with a small spring
  overshoot; last tile locks in at f=110. Below the grid, a mini cap-table
  table draws its rows.
- **Motion signature**: mosaic assembly — "the room is being furnished".

### Scene 5 — Raise (`scene-raise.tsx`)

- **Step number**: `05`.
- **Icon**: `Rocket`.
- **Headline**: "Raise with confidence."
- **Sub-copy**: "Investor watchlist, accelerator applications, and a live
  report pack — one click away."
- **Mock UI**: an "envelope" card centered right, with three chips flying out
  toward the top-right corner (labelled "Blackbird", "Y Combinator",
  "AirTree"). A small rocket icon travels along a bezier path from the
  envelope to the top-right. On exit, a green check appears next to each chip.
- **Motion signature**: outward radiation — "sending signal to the market".

### Scene 6 — Outro (`scene-outro.tsx`)

- **Step number**: none.
- **Layout**: centered, single column.
- **Logo**: `BlockID` wordmark drawn in pure SVG (letters as `<text>`, no
  external font) with the accent cyan for `Block` and ink for `ID`.
- **Line 1** (headline): "Start your SVI in 60 seconds."
- **Line 2** (URL): `blockid.au` — set in mono, letter-spaced.
- **Motion**: logo scales from 0.9 → 1.0 with `spring`; the URL underline draws
  from 0 to full width; final 20 frames hold static so the freeze-frame in
  social feeds still looks intentional.

---

## 4. Icon strategy — no runtime lucide-react in Remotion

`lucide-react` is a client component library that assumes a browser DOM. To
keep the Remotion bundle deterministic and avoid CSS variable dependencies,
each scene inlines the **SVG paths** it needs (copy-pasted from lucide, which
is ISC-licensed). This also means renders are fully offline.

Example inside `scene-search.tsx`:

```tsx
function SearchIcon({ size = 48, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={1.75} strokeLinecap="round"
         strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
```

Six inline icons total — trivial code size, zero external fetches.

---

## 5. File plan

### New files

| Path                                              | Purpose                                                   |
|---------------------------------------------------|-----------------------------------------------------------|
| `remotion/index.tsx`                              | `registerRoot` entry, wires `HowItWorks` composition.     |
| `remotion/how-it-works/composition.tsx`           | Master `<Composition>`; sequences the 6 scenes.           |
| `remotion/how-it-works/theme.ts`                  | Shared color / font / easing tokens.                      |
| `remotion/how-it-works/scene-search.tsx`          | Scene 1.                                                  |
| `remotion/how-it-works/scene-onboard.tsx`         | Scene 2.                                                  |
| `remotion/how-it-works/scene-score.tsx`           | Scene 3.                                                  |
| `remotion/how-it-works/scene-build.tsx`           | Scene 4.                                                  |
| `remotion/how-it-works/scene-raise.tsx`           | Scene 5.                                                  |
| `remotion/how-it-works/scene-outro.tsx`           | Scene 6.                                                  |
| `remotion/README.md`                              | Local render + preview instructions.                      |
| `web/public/media/README.md`                      | Lifecycle notes for the generated `.mp4`.                 |

Note: Remotion sources live at **repo root** (`remotion/…`), not under `web/`.
This mirrors Remotion's own default layout and keeps Next.js's build from
sweeping the video sources into its route graph. The `video:*` npm scripts in
`web/package.json` reference the sibling path via `../remotion/index.tsx`.

### Package.json patch (in `web/package.json`)

Add two scripts (do not touch anything else):

```json
{
  "scripts": {
    "video:preview": "remotion studio ../remotion/index.tsx",
    "video:render":  "remotion render ../remotion/index.tsx HowItWorks public/media/how-it-works.mp4 --overwrite --crf 28 --props {}"
  }
}
```

The upstream task spec listed the paths as `remotion/index.tsx` and
`web/public/media/how-it-works.mp4`; because these scripts run **from the
`web/` cwd**, the equivalent paths become `../remotion/index.tsx` and
`public/media/how-it-works.mp4`. Behaviour is identical.

---

## 6. Composition skeleton (reference for the coder)

```tsx
// remotion/how-it-works/composition.tsx
import { AbsoluteFill, Sequence } from "remotion";
import { SceneSearch }  from "./scene-search";
import { SceneOnboard } from "./scene-onboard";
import { SceneScore }   from "./scene-score";
import { SceneBuild }   from "./scene-build";
import { SceneRaise }   from "./scene-raise";
import { SceneOutro }   from "./scene-outro";

const CUT = 150; // 5s @ 30fps

export function HowItWorksComposition() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#050914" }}>
      <Sequence from={0}         durationInFrames={CUT}><SceneSearch  /></Sequence>
      <Sequence from={CUT * 1}   durationInFrames={CUT}><SceneOnboard /></Sequence>
      <Sequence from={CUT * 2}   durationInFrames={CUT}><SceneScore   /></Sequence>
      <Sequence from={CUT * 3}   durationInFrames={CUT}><SceneBuild   /></Sequence>
      <Sequence from={CUT * 4}   durationInFrames={CUT}><SceneRaise   /></Sequence>
      <Sequence from={CUT * 5}   durationInFrames={CUT}><SceneOutro   /></Sequence>
    </AbsoluteFill>
  );
}
```

```tsx
// remotion/index.tsx
import { registerRoot, Composition } from "remotion";
import { HowItWorksComposition } from "./how-it-works/composition";

const Root = () => (
  <Composition
    id="HowItWorks"
    component={HowItWorksComposition}
    durationInFrames={900}
    fps={30}
    width={1920}
    height={1080}
  />
);

registerRoot(Root);
```

---

## 7. Acceptance criteria

1. `cd web && npm run video:preview` opens Remotion Studio with a single
   `HowItWorks` composition selectable.
2. `cd web && npm run video:render` writes `web/public/media/how-it-works.mp4`
   without any network fetch (verify with strace / offline run).
3. Output MP4 is < 3 MB, 1920 x 1080, exactly 900 frames, h264 / yuv420p.
4. No Google Fonts / CDN / external image is referenced anywhere in the
   `remotion/**` tree (`grep -R "https://" remotion/` returns nothing).
5. No new dependency added to `web/package.json` (only two scripts appended).
6. `remotion/README.md` documents render/preview commands and flags ffmpeg as
   a system dep.
7. `web/public/media/README.md` states the file is autogenerated and points
   engineers back to `npm run video:render`.

---

## 8. Risks & non-goals

- **Chromium**: Remotion may print a one-time hint to install headless
  Chromium on first render. We do NOT install it in CI or in the media
  agent's workflow — the build agent surfaces the hint and a human runs it.
- **Actual MP4 render is out of scope for the planning agent.** This document
  ships the design + scaffolding only; a human (or a follow-up render job)
  runs `npm run video:render` post-merge and commits the resulting file.
- **Audio**: deferred until we license a track. The composition is deliberately
  silent so social embeds (which autoplay muted) still tell the whole story.
- **Accessibility**: the MP4 will be paired with the existing textual
  `HowItWorks` server component on the landing page; the video is decorative,
  the text is canonical. A `.vtt` caption track can be added later without
  touching the composition.
