// Colocated vitest for the /funding intake client component (T0242).
// The form itself is exercised through the page render test; here we pin
// the two pure helpers (URL prefill + form → API body) and the free preview
// card, which must show names + why + the locked rows and never the paid
// checklist.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => undefined }));
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ user: null, entitlements: [], trial: null, isLoading: true, can: () => false, refresh: async () => undefined }),
}));

import { FundingPreviewCard, prefillFromSearch, toIntakeBody } from "./funding-intake";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("prefillFromSearch", () => {
  it("prefers ?intent=, then ?grant=, then ?program=, and validates state/stage", () => {
    expect(prefillFromSearch("?intent=Soil%20sensors&grant=MVP").description).toBe("Soil sensors");
    expect(prefillFromSearch("?grant=MVP%20Ventures").description).toBe("We want to apply for MVP Ventures. We are building ");
    expect(prefillFromSearch("?program=Plus%20Eight").description).toBe("We want to join Plus Eight. We are building ");
    expect(prefillFromSearch("?state=wa&stage=MVP")).toEqual({ state: "WA", stage: "mvp" });
    expect(prefillFromSearch("?state=NZ&stage=unicorn")).toEqual({});
    expect(prefillFromSearch("")).toEqual({});
  });
});

describe("initialForm", () => {
  it("merges a server prefill over the empty form, ignoring null / undefined and merging toggles", async () => {
    const { initialForm } = await import("./funding-intake");
    const f = initialForm({ description: "Acme", state: "NSW", stage: "mvp", turnover_aud: undefined, headcount: null as unknown as string, toggles: { women_led: true } });
    expect(f.description).toBe("Acme");
    expect(f.state).toBe("NSW");
    expect(f.stage).toBe("mvp");
    expect(f.turnover_aud).toBe("");
    expect(f.headcount).toBe("");
    expect(f.toggles).toEqual({ women_led: true, indigenous_owned: false, regional: false, under_30: false });
    expect(initialForm(undefined).description).toBe("");
  });
});

describe("toIntakeBody", () => {
  it("flattens toggles, nulls blank numbers and only sends based_state when not incorporated", () => {
    const body = toIntakeBody({
      description: "  Soil sensors  ",
      state: "not_incorporated",
      based_state: "WA",
      stage: "mvp",
      industry_tags: ["agtech_food"],
      toggles: { women_led: true, indigenous_owned: false, regional: true, under_30: false },
      turnover_aud: "",
      rd_spend_aud: "12000",
      incorporated_year: "",
      headcount: "3",
      export_intent: false,
    });
    expect(body).toEqual({
      description: "Soil sensors",
      state: "not_incorporated",
      based_state: "WA",
      stage: "mvp",
      industry_tags: ["agtech_food"],
      women_led: true,
      indigenous_owned: false,
      regional: true,
      under_30: false,
      turnover_aud: null,
      rd_spend_aud: "12000",
      incorporated_year: null,
      headcount: "3",
      export_intent: false,
    });
    expect(toIntakeBody({ description: "x", state: "NSW", based_state: "WA", stage: "idea", industry_tags: [], toggles: { women_led: false, indigenous_owned: false, regional: false, under_30: false }, turnover_aud: "", rd_spend_aud: "", incorporated_year: "", headcount: "", export_intent: false }).based_state).toBeNull();
  });
});

describe("FundingPreviewCard", () => {
  const preview = {
    grant_count: 4,
    program_count: 2,
    top_grants: [{ name: "MVP Ventures", why: "Fits MVP stage in NSW." }],
    top_programs: [{ name: "Plus Eight", why: "Takes MVP founders in Perth." }],
    top_grants_amount_max_aud: 120000,
    total_amount_max_aud: 150000,
    timeline_count: 7,
    locked: { checklist_items: 19, timeline_items: 7, estimates: 1 },
    location_unknown: false,
  };

  it("shows counts, the hero A$, names + why and the locked rows", async () => {
    const out = await html(<FundingPreviewCard preview={preview} />);
    expect(out).toContain("We found 4 grants (up to A$120,000 across the top five) and 2 programs matching you.");
    expect(out).toContain("MVP Ventures");
    expect(out).toContain("Fits MVP stage in NSW.");
    expect(out).toContain("Plus Eight");
    expect(out).toContain("Eligibility checklist — 19 checks");
    expect(out).toContain("12-month timeline — 7 dated actions");
    expect(out).toContain("1 A$ estimates");
  });

  it("never renders empty — the fallback rows and reason take over when nothing matched", async () => {
    const out = await html(
      <FundingPreviewCard
        preview={{
          ...preview,
          grant_count: 0,
          program_count: 0,
          top_grants: [],
          top_programs: [],
          top_grants_amount_max_aud: 0,
          fallback: { reason: "Nothing open for NT at the idea stage.", grants: [{ name: "R&D Tax Incentive", why: "National." }], programs: [] },
          location_unknown: true,
        }}
      />,
    );
    expect(out).toContain("No exact matches yet");
    expect(out).toContain("Nothing open for NT at the idea stage.");
    expect(out).toContain("R&amp;D Tax Incentive");
    expect(out).toContain("only national schemes are shown");
  });
});
