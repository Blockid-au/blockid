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
      colors: {
        brand: {
          navy: "#0A1628",
          "navy-elev-1": "#0F1D33",
          "navy-elev-2": "#152740",
          gold: "#C9A961",
          "gold-muted": "#8B7A44",
          cyan: "#22D3EE",
          "cyan-muted": "#0891B2",
          ink: "#E8E9EA",
          "ink-muted": "#94A3B8",
        },
      },
      backgroundImage: {
        "lux-radial":
          "radial-gradient(ellipse at top, #152740 0%, #0A1628 60%)",
        "lux-gold-line":
          "linear-gradient(90deg, transparent 0%, #C9A961 50%, transparent 100%)",
      },
    },
  },
};

export default config;
