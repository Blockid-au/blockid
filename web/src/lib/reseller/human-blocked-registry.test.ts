import { describe, expect, it } from "vitest";

import {
  HUMAN_BLOCKED_ITEMS,
  buildHumanBlockedSnapshot,
  type HumanBlockedItem,
} from "./human-blocked-registry";

describe("HUMAN_BLOCKED_ITEMS registry", () => {
  it("carries the two open escalations from the reseller goal file", () => {
    const ids = HUMAN_BLOCKED_ITEMS.map((i) => i.id).sort();
    expect(ids).toEqual(["P1.5_infovision_seed", "P8.5_env_and_playwright"]);
  });

  it("has no duplicate ids so the digest table cannot render the same row twice", () => {
    const ids = HUMAN_BLOCKED_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every row a non-empty title, blocker, action_required, and owner", () => {
    for (const item of HUMAN_BLOCKED_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.blocker.length).toBeGreaterThan(0);
      expect(item.action_required.length).toBeGreaterThan(0);
      expect(item.owner.length).toBeGreaterThan(0);
    }
  });

  it("uses the phase prefix embedded in each id (P<n>.<sub>_slug → parent P<n>)", () => {
    for (const item of HUMAN_BLOCKED_ITEMS) {
      const parent = item.id.split(".")[0];
      expect(item.phase).toBe(parent);
    }
  });

  it("routes every escalation to a human owner email — never to a bot/loop label", () => {
    const forbidden = ["loop", "bot", "cron", "autonomous"];
    for (const item of HUMAN_BLOCKED_ITEMS) {
      expect(item.owner).toMatch(/@/);
      for (const bad of forbidden) {
        expect(item.owner.toLowerCase()).not.toContain(bad);
      }
    }
  });

  it("P1.5 wording references migration 0106 + docker exec so ops sees the exact apply command", () => {
    const p15 = HUMAN_BLOCKED_ITEMS.find((i) => i.id === "P1.5_infovision_seed");
    expect(p15).toBeDefined();
    const p15Item = p15 as HumanBlockedItem;
    expect(p15Item.blocker).toContain("0106_infovision_seed.sql");
    expect(p15Item.action_required).toContain("docker exec");
    expect(p15Item.action_required).toContain("NOTIFY pgrst");
  });

  it("P8.5 wording names both Stripe env var slugs so the operator can paste them into .env.local", () => {
    const p85 = HUMAN_BLOCKED_ITEMS.find((i) => i.id === "P8.5_env_and_playwright");
    expect(p85).toBeDefined();
    const p85Item = p85 as HumanBlockedItem;
    expect(p85Item.blocker).toContain("STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY");
    expect(p85Item.blocker).toContain("STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL");
  });
});

describe("buildHumanBlockedSnapshot", () => {
  it("emits the registry count + one item per open escalation with stable timestamp", () => {
    const now = new Date("2026-07-24T07:15:00.000Z");
    const snap = buildHumanBlockedSnapshot(now);
    expect(snap.ran_at).toBe("2026-07-24T07:15:00.000Z");
    expect(snap.count).toBe(HUMAN_BLOCKED_ITEMS.length);
    expect(snap.items).toHaveLength(HUMAN_BLOCKED_ITEMS.length);
    for (const item of snap.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("phase");
      expect(item).toHaveProperty("owner");
      expect(Object.keys(item).sort()).toEqual(["id", "owner", "phase"]);
    }
  });

  it("preserves registry order in the snapshot so P1 lands before P8", () => {
    const snap = buildHumanBlockedSnapshot(new Date("2026-07-24T07:15:00.000Z"));
    expect(snap.items.map((i) => i.id)).toEqual(
      HUMAN_BLOCKED_ITEMS.map((i) => i.id),
    );
  });
});
