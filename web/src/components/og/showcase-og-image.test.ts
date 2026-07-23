// Iteration-8 T3 — smoke test for the shared /showcase/blockid OG + Twitter
// card JSX tree. We deliberately do NOT render to PNG: the Satori/edge
// pipeline (`new ImageResponse(...)`) needs a browser-like environment we
// don't want to spin up here. Instead we invoke the component as a plain
// function — a React component is just a function that returns
// React.createElement(...) — and assert we get a non-null element for every
// phase input the page can throw at us.

import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { ShowcaseOgImage } from "./showcase-og-image";

describe("ShowcaseOgImage", () => {
  const dimensions: ReadonlyArray<{ label: string; width: number; height: number }> = [
    { label: "opengraph", width: 1200, height: 630 },
    { label: "twitter", width: 1200, height: 675 },
  ];

  for (const dim of dimensions) {
    it(`renders for null phase (${dim.label})`, () => {
      const el = ShowcaseOgImage({ currentPhase: null, width: dim.width, height: dim.height });
      expect(isValidElement(el)).toBe(true);
    });

    for (let phase = 1; phase <= 12; phase += 1) {
      it(`renders for phase ${phase} (${dim.label})`, () => {
        const el = ShowcaseOgImage({ currentPhase: phase, width: dim.width, height: dim.height });
        expect(isValidElement(el)).toBe(true);
      });
    }

    it(`renders for out-of-range phase 99 (${dim.label})`, () => {
      const el = ShowcaseOgImage({ currentPhase: 99, width: dim.width, height: dim.height });
      expect(isValidElement(el)).toBe(true);
    });
  }
});
