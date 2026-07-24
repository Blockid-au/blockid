import { describe, expect, it } from "vitest";
import { assessS708SmallScale } from "@/lib/compliance/s708-small-scale-counter";
import {
  makeEmptyS708CounterFormState,
  parseS708EventsCsv,
  pickS708Band,
  toS708CounterInput,
} from "./s708-counter-form.helpers";

describe("makeEmptyS708CounterFormState", () => {
  it("defaults to empty CSV, preview disabled, empty preview fields", () => {
    const s = makeEmptyS708CounterFormState();
    expect(s.events_text).toBe("");
    expect(s.preview_enabled).toBe(false);
    expect(s.preview_new_investors).toBe("");
    expect(s.preview_amount_aud).toBe("");
  });
});

describe("parseS708EventsCsv", () => {
  it("parses well-formed rows (offer_date, investor_id, amount_aud) and skips malformed rows silently", () => {
    const raw = [
      "# comment line ignored",
      "2026-01-05, alice@example.com, 50000",
      "2026-02-10, bob@example.com, 75000, primary",
      "2026-03-15, carol@example.com, 25000, secondary_on_sale",
      "",
      "not-a-date, dave@example.com, 100",
      "2026-04-20, , 500",
      "2026-05-01, eve@example.com, notanumber",
      "2026-06-01, frank@example.com, -100",
      "2026-07-01, gwen@example.com",
      "2026-08-01, henry@example.com, 100, bogus_type",
    ].join("\n");
    const events = parseS708EventsCsv(raw);
    expect(events).toEqual([
      { offer_date: "2026-01-05", investor_id: "alice@example.com", amount_aud: 50000 },
      {
        offer_date: "2026-02-10",
        investor_id: "bob@example.com",
        amount_aud: 75000,
        offer_type: "primary",
      },
      {
        offer_date: "2026-03-15",
        investor_id: "carol@example.com",
        amount_aud: 25000,
        offer_type: "secondary_on_sale",
      },
      // "2026-08-01, henry@example.com, 100, bogus_type" — bogus offer_type
      // is dropped (row kept without the tag)
      { offer_date: "2026-08-01", investor_id: "henry@example.com", amount_aud: 100 },
    ]);
  });

  it("returns [] for empty / whitespace-only input", () => {
    expect(parseS708EventsCsv("")).toEqual([]);
    expect(parseS708EventsCsv("   \n\n  ")).toEqual([]);
  });
});

describe("toS708CounterInput", () => {
  it("emits { events } with no preview when preview_enabled is false", () => {
    const wire = toS708CounterInput({
      events_text: "2026-01-05, a@x.com, 100",
      preview_enabled: false,
      preview_new_investors: "5",
      preview_amount_aud: "50000",
    });
    expect(wire.events).toEqual([
      { offer_date: "2026-01-05", investor_id: "a@x.com", amount_aud: 100 },
    ]);
    expect(wire.preview).toBeUndefined();
  });

  it("attaches preview when enabled + non-zero, floors + clamps new_investors, drops negatives", () => {
    const wire = toS708CounterInput({
      events_text: "",
      preview_enabled: true,
      preview_new_investors: "3.7",
      preview_amount_aud: "150000",
    });
    expect(wire.preview).toEqual({ new_investors: 3, amount_aud: 150000 });
  });

  it("skips the preview when enabled but both fields are zero / blank / garbage", () => {
    const wire = toS708CounterInput({
      events_text: "",
      preview_enabled: true,
      preview_new_investors: "",
      preview_amount_aud: "not a number",
    });
    expect(wire.preview).toBeUndefined();
  });

  it("clamps negative preview inputs to zero (and therefore omits the preview when both hit zero)", () => {
    const wire = toS708CounterInput({
      events_text: "",
      preview_enabled: true,
      preview_new_investors: "-10",
      preview_amount_aud: "-500",
    });
    expect(wire.preview).toBeUndefined();
  });
});

describe("pickS708Band", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  it("returns green (ok) for empty events", () => {
    const result = assessS708SmallScale({ events: [], now });
    expect(result.status).toBe("ok");
    expect(pickS708Band(result)).toBe("green");
  });

  it("returns amber (warn) when within one investor of the 20-investor cap", () => {
    const events = Array.from({ length: 19 }, (_, i) => ({
      offer_date: "2026-03-01",
      investor_id: `investor-${i}@example.com`,
      amount_aud: 10_000,
    }));
    const result = assessS708SmallScale({ events, now });
    expect(result.status).toBe("warn");
    expect(pickS708Band(result)).toBe("amber");
  });

  it("returns red (block) when already at the 20-investor cap", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      offer_date: "2026-03-01",
      investor_id: `investor-${i}@example.com`,
      amount_aud: 10_000,
    }));
    const result = assessS708SmallScale({ events, now });
    expect(result.status).toBe("block");
    expect(pickS708Band(result)).toBe("red");
  });

  it("returns red (block) when the preview would breach the dollar cap", () => {
    const events = [
      { offer_date: "2026-03-01", investor_id: "a@x.com", amount_aud: 1_900_000 },
    ];
    const result = assessS708SmallScale({
      events,
      now,
      preview: { new_investors: 1, amount_aud: 200_000 },
    });
    expect(result.would_breach_dollar_cap).toBe(true);
    expect(result.status).toBe("block");
    expect(pickS708Band(result)).toBe("red");
  });
});
