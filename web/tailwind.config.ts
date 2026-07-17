/**
 * Tailwind v4 uses CSS-first configuration via `@theme` in `src/app/globals.css`.
 * This file exists only for tooling / IDE type-hints and to document the luxury
 * dark palette in a JS/TS form. The authoritative source of tokens is the
 * `@theme` block in globals.css.
 *
 * Palette additions land under theme.extend below and are mirrored 1:1 as CSS
 * custom properties in globals.css (see `--color-brand-navy`, etc). Utilities
 * like .lux-card / .lux-glow-* live in globals.css under `@layer utilities`
 * and are scoped to `body[data-theme="lux"]`.
 */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,js,jsx,md,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: [
          "var(--font-space-grotesk)",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          // Deep navy from the BlockID logo wordmark
          navy: "#1B2A5E",
          "navy-elev-1": "#22326B",
          "navy-elev-2": "#2A3B7A",
          "navy-deep": "#0F1B47",
          // Bright accent blue/cyan from the logo star + .au dot
          cyan: "#22D3EE",
          "cyan-muted": "#0891B2",
          blue: "#3B82F6",
          "blue-bright": "#38BDF8",
          // Legacy aliases (kept so v1 pages don't break) — remapped to accent blue
          gold: "#38BDF8",
          "gold-muted": "#0EA5E9",
          // Ink for text on light or dark surfaces
          ink: "#F8FAFC",
          "ink-muted": "#CBD5E1",
          "ink-dark": "#1B2A5E",
        },
      },
      backgroundImage: {
        "lux-radial":
          "radial-gradient(ellipse at top, #2A3B7A 0%, #0F1B47 60%)",
        "lux-cyan-line":
          "linear-gradient(90deg, transparent 0%, #22D3EE 50%, transparent 100%)",
        "lux-gold-line":
          "linear-gradient(90deg, transparent 0%, #22D3EE 50%, transparent 100%)",
        "brand-star":
          "linear-gradient(135deg, #1B2A5E 0%, #22D3EE 100%)",
      },
    },
  },
};

export default config;
