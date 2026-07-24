import { describe, expect, it } from "vitest";
import { assessRofrWorkflow } from "@/lib/compliance/rofr-workflow";
import {
  ROFR_STATUS_HEADLINE,
  makeEmptyRofrWizardFormState,
  parseCapTableCsv,
  parseExercisesCsv,
  parseWaiversCsv,
  pickRofrBand,
  toRofrInput,
} from "./rofr-wizard.helpers";

describe("rofr-wizard helpers", () => {
  describe("makeEmptyRofrWizardFormState", () => {
    it("returns every field blank / false so the founder types their own numbers", () => {
      const s = makeEmptyRofrWizardFormState();
      expect(s.cap_table_csv).toBe("");
      expect(s.waivers_csv).toBe("");
      expect(s.exercises_csv).toBe("");
      expect(s.seller_id).toBe("");
      expect(s.buyer_name).toBe("");
      expect(s.share_count).toBe("");
      expect(s.price_per_share_aud).toBe("");
      expect(s.notice_date_iso).toBe("");
      expect(s.original_issue_date_iso).toBe("");
      expect(s.notice_period_days).toBe("");
      expect(s.is_related_body_corporate_transfer).toBe(false);
    });
  });

  describe("parseCapTableCsv", () => {
    it("parses a 4-column happy path with names + founder flag", () => {
      const rows = parseCapTableCsv(
        [
          "founder-a, Alice Cannon, 6000, yes",
          "angel-b, Bob Angel, 4000, no",
        ].join("\n"),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        holder_id: "founder-a",
        name: "Alice Cannon",
        held_shares: 6000,
        is_founder: true,
      });
      expect(rows[1]).toMatchObject({
        holder_id: "angel-b",
        held_shares: 4000,
        is_founder: false,
      });
    });

    it("disambiguates 3-column rows by whether the middle cell is a positive number", () => {
      // (id, name, shares) — middle is a name string
      const namedRows = parseCapTableCsv("angel-b, Bob Angel, 4000");
      expect(namedRows[0]).toMatchObject({
        holder_id: "angel-b",
        name: "Bob Angel",
        held_shares: 4000,
      });
      // (id, shares, is_founder) — middle is a positive number
      const flaggedRows = parseCapTableCsv("founder-a, 6000, y");
      expect(flaggedRows[0]).toMatchObject({
        holder_id: "founder-a",
        held_shares: 6000,
        is_founder: true,
      });
      expect(flaggedRows[0].name).toBeUndefined();
    });

    it("silently drops blank lines, comment lines, and rows without a positive share count", () => {
      const rows = parseCapTableCsv(
        [
          "",
          "# a comment",
          "founder-a, Alice, 6000, yes",
          "malformed-row",
          "no-shares, Zero, 0, no",
          "negative, Negative, -100, no",
          "not-numeric, Bad, nan, no",
        ].join("\n"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].holder_id).toBe("founder-a");
    });

    it("tolerates tab separators from a spreadsheet paste", () => {
      const rows = parseCapTableCsv("founder-a\tAlice\t6000\tyes");
      expect(rows).toHaveLength(1);
      expect(rows[0].held_shares).toBe(6000);
    });
  });

  describe("parseWaiversCsv + parseExercisesCsv", () => {
    it("waivers: parses holder_id + iso date, defaults undated to today", () => {
      const waivers = parseWaiversCsv("angel-b, 2026-06-01\nseries-a\n");
      expect(waivers).toHaveLength(2);
      expect(waivers[0]).toEqual({
        holder_id: "angel-b",
        waived_at_iso: "2026-06-01",
      });
      expect(waivers[1].holder_id).toBe("series-a");
      expect(waivers[1].waived_at_iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("exercises: drops rows without a positive share count", () => {
      const rows = parseExercisesCsv(
        [
          "angel-b, 2026-06-05, 500",
          "series-a, , 200",
          "zero-holder, 2026-06-05, 0",
          "just-id",
        ].join("\n"),
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        holder_id: "angel-b",
        exercised_at_iso: "2026-06-05",
        shares_taken: 500,
      });
      expect(rows[1].shares_taken).toBe(200);
    });
  });

  describe("toRofrInput", () => {
    it("coerces string form state into the workflow input shape", () => {
      const s = makeEmptyRofrWizardFormState();
      s.cap_table_csv = "founder-a, Alice, 6000, yes\nangel-b, Bob, 4000, no";
      s.waivers_csv = "angel-b, 2026-06-01";
      s.seller_id = "founder-a";
      s.buyer_name = "Third Party Pty Ltd";
      s.share_count = "1000";
      s.price_per_share_aud = "3.5";
      s.notice_date_iso = "2026-06-01";
      s.original_issue_date_iso = "2025-08-01";
      s.notice_period_days = "20";
      const input = toRofrInput(s);
      expect(input.cap_table).toHaveLength(2);
      expect(input.waivers).toHaveLength(1);
      expect(input.proposed_transfer.seller_id).toBe("founder-a");
      expect(input.proposed_transfer.buyer_name).toBe("Third Party Pty Ltd");
      expect(input.proposed_transfer.share_count).toBe(1000);
      expect(input.proposed_transfer.price_per_share_aud).toBe(3.5);
      expect(input.proposed_transfer.notice_date_iso).toBe("2026-06-01");
      expect(input.proposed_transfer.original_issue_date_iso).toBe("2025-08-01");
      expect(input.notice_period_days).toBe(20);
    });

    it("blank optional fields collapse to undefined so the pure lib's fallbacks fire", () => {
      const s = makeEmptyRofrWizardFormState();
      s.cap_table_csv = "founder-a, Alice, 6000, yes";
      s.seller_id = "founder-a";
      s.buyer_name = "Third Party";
      s.share_count = "500";
      s.notice_date_iso = "2026-06-01";
      const input = toRofrInput(s);
      expect(input.proposed_transfer.original_issue_date_iso).toBeUndefined();
      expect(input.proposed_transfer.price_per_share_aud).toBe(0);
      expect(input.notice_period_days).toBeUndefined();
    });
  });

  describe("pickRofrBand", () => {
    it("maps every RofrStatus to a traffic-light band", () => {
      expect(pickRofrBand("not_applicable")).toBe("grey");
      expect(pickRofrBand("pending_notice")).toBe("grey");
      expect(pickRofrBand("notice_period_open")).toBe("amber");
      expect(pickRofrBand("notice_period_closed")).toBe("amber");
      expect(pickRofrBand("partially_exercised")).toBe("amber");
      expect(pickRofrBand("fully_waived")).toBe("green");
      expect(pickRofrBand("fully_exercised")).toBe("red");
    });

    it("stays consistent with a real assessRofrWorkflow call on a fully-waived scenario", () => {
      const s = makeEmptyRofrWizardFormState();
      s.cap_table_csv = "founder-a, Alice, 6000, yes\nangel-b, Bob, 4000, no";
      s.waivers_csv = "angel-b, 2026-06-01";
      s.seller_id = "founder-a";
      s.buyer_name = "Third Party";
      s.share_count = "1000";
      s.notice_date_iso = "2026-06-01";
      // now well past the 15-day default window
      const result = assessRofrWorkflow({
        ...toRofrInput(s),
        now: new Date("2026-07-01T00:00:00Z"),
      });
      expect(result.status).toBe("fully_waived");
      expect(pickRofrBand(result.status)).toBe("green");
    });
  });

  describe("ROFR_STATUS_HEADLINE", () => {
    it("supplies a distinct headline for every RofrStatus branch", () => {
      const headlines = Object.values(ROFR_STATUS_HEADLINE);
      expect(new Set(headlines).size).toBe(headlines.length);
      expect(ROFR_STATUS_HEADLINE.fully_waived).toMatch(/waived/i);
      expect(ROFR_STATUS_HEADLINE.fully_exercised).toMatch(/took the whole/i);
    });
  });
});
