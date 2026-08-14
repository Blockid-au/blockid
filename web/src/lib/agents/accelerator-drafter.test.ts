import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

import { callAI } from "@/lib/ai-client";
import {
  draftAcceleratorApplication,
  getAcceleratorBySlug,
  listAccelerators,
} from "./accelerator-drafter";

const mockCallAI = vi.mocked(callAI);

describe("accelerator-drafter registry", () => {
  it("loads at least 13 curated accelerators", () => {
    expect(listAccelerators().length).toBeGreaterThanOrEqual(13);
  });

  it("has unique slugs across the catalogue", () => {
    const slugs = listAccelerators().map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves a known slug via getAcceleratorBySlug", () => {
    const yc = getAcceleratorBySlug("yc-w26");
    expect(yc).not.toBeNull();
    expect(yc?.name).toBe("Y Combinator");
    expect(yc?.prompts.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown accelerator slug", () => {
    expect(getAcceleratorBySlug("does-not-exist")).toBeNull();
  });

  it("every prompt has a positive maxChars cap", () => {
    for (const a of listAccelerators()) {
      for (const p of a.prompts) {
        expect(p.maxChars).toBeGreaterThan(0);
        expect(typeof p.id).toBe("string");
        expect(typeof p.label).toBe("string");
      }
    }
  });
});

describe("draftAcceleratorApplication", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  it("throws for an unknown accelerator slug", async () => {
    await expect(
      draftAcceleratorApplication({
        accelerator_slug: "nope",
        startup_name: "Acme",
        interview_answers: {},
      }),
    ).rejects.toThrow(/Unknown accelerator/);
  });

  it("returns one draft per prompt on the happy path and respects char caps", async () => {
    mockCallAI.mockResolvedValue({
      text: "We are building an AI-native cap-table platform for AU founders.".repeat(30),
      provider: "groq",
      model: "test-model",
    });

    const out = await draftAcceleratorApplication({
      accelerator_slug: "yc-w26",
      startup_name: "Acme",
      interview_answers: { vision: "Reinvent equity for AU founders" },
      svi_score: 132,
      svi_dimensions: { FTV: 12, MPC: 15 },
    });

    const yc = getAcceleratorBySlug("yc-w26")!;
    for (const p of yc.prompts) {
      const val = out[p.id];
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
      expect(val.length).toBeLessThanOrEqual(p.maxChars);
    }
    expect(mockCallAI).toHaveBeenCalledTimes(yc.prompts.length);
  });

  it("falls back to a deterministic template when the LLM call throws", async () => {
    mockCallAI.mockRejectedValue(new Error("all providers down"));

    const out = await draftAcceleratorApplication({
      accelerator_slug: "startmate-2026",
      startup_name: "Acme Robotics",
      interview_answers: {
        vision_headline: "Robotic warehouse picking for AU 3PL",
        traction_customers: "3 paying pilots at A$1k/mo MRR",
        team_founders: "Two ex-Amazon Robotics engineers",
      },
    });

    const program = getAcceleratorBySlug("startmate-2026")!;
    for (const p of program.prompts) {
      const val = out[p.id];
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
      expect(val.length).toBeLessThanOrEqual(p.maxChars);
    }
  });

  it("strips 'Answer:' preambles and outer quotes returned by the LLM", async () => {
    mockCallAI.mockResolvedValue({
      text: `Answer: "We solve the AU cap-table gap for early-stage founders."`,
      provider: "groq",
      model: "test-model",
    });

    const out = await draftAcceleratorApplication({
      accelerator_slug: "yc-w26",
      startup_name: "Acme",
      interview_answers: {},
    });

    const first = Object.values(out)[0];
    expect(first.startsWith("Answer:")).toBe(false);
    expect(first.startsWith('"')).toBe(false);
    expect(first.endsWith('"')).toBe(false);
  });
});
