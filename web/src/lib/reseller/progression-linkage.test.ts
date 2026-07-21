import { describe, expect, it } from "vitest";
import {
  annotateProgression,
  linkageForEvent,
  phaseForEventKind,
} from "./progression-linkage";

describe("phaseForEventKind", () => {
  it("maps signup + onboarding to phase 1 (Vision)", () => {
    expect(phaseForEventKind("signup")).toBe(1);
    expect(phaseForEventKind("onboarding_completed")).toBe(1);
  });
  it("maps SVI events to phase 2 (Idea Validation)", () => {
    expect(phaseForEventKind("first_svi_run")).toBe(2);
    expect(phaseForEventKind("svi_score_update")).toBe(2);
  });
  it("returns null for cross-cutting billing / artefact events", () => {
    expect(phaseForEventKind("report_generated")).toBeNull();
    expect(phaseForEventKind("plan_change")).toBeNull();
    expect(phaseForEventKind("credit_grant")).toBeNull();
  });
});

describe("linkageForEvent", () => {
  it("builds /guide/<slug> href for phase-bearing events", () => {
    expect(linkageForEvent({ kind: "signup" })).toEqual({
      phase: 1,
      chapterSlug: "01-vision",
      href: "/guide/01-vision",
    });
    expect(linkageForEvent({ kind: "first_svi_run" })).toEqual({
      phase: 2,
      chapterSlug: "02-idea-validation",
      href: "/guide/02-idea-validation",
    });
  });
  it("returns null triple for cross-cutting events", () => {
    expect(linkageForEvent({ kind: "plan_change" })).toEqual({
      phase: null,
      chapterSlug: null,
      href: null,
    });
    expect(linkageForEvent({ kind: "credit_grant" })).toEqual({
      phase: null,
      chapterSlug: null,
      href: null,
    });
  });
});

describe("annotateProgression", () => {
  it("preserves original fields and folds linkage in", () => {
    const input = [
      { kind: "signup" as const, ts: "2026-01-01T00:00:00Z", label: "Signed up" },
      { kind: "credit_grant" as const, ts: "2026-01-02T00:00:00Z", label: "Credits granted", detail: "+100" },
    ];
    const out = annotateProgression(input);
    expect(out[0]).toMatchObject({
      kind: "signup",
      label: "Signed up",
      phase: 1,
      chapterSlug: "01-vision",
      href: "/guide/01-vision",
    });
    expect(out[1]).toMatchObject({
      kind: "credit_grant",
      detail: "+100",
      phase: null,
      chapterSlug: null,
      href: null,
    });
  });

  it("does not mutate the input array", () => {
    const input = [{ kind: "signup" as const, ts: "x", label: "Signed up" }];
    const snapshot = JSON.parse(JSON.stringify(input));
    annotateProgression(input);
    expect(input).toEqual(snapshot);
  });
});
