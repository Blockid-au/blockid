// Colocated vitest for the account erasure map (S24-B).
//
// Pins: every FK in the live-schema fixture is classified exactly once (an
// unmapped or stale table fails), nullable-only rules for detach / nullRef,
// the append-only ledgers are never written, the financial ledgers the
// policy keeps for 7 years are never deleted, the dependency order the RPC
// relies on, and migration 0348 carries the VALUES blocks rendered from this
// map verbatim (TypeScript ↔ SQL parity) plus the service_role-only grants
// and the tombstone columns.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/app_users_fks.json";
import {
  ERASURE_MAP,
  NON_FK_EXTRAS,
  PROJECT_DETACHES,
  TOMBSTONE_NULL_COLUMNS,
  entryKey,
  orderedEntries,
  summariseErasureMap,
  tombstoneEmail,
} from "./erasure-map";
import {
  DETACH_BEGIN,
  DETACH_END,
  EXTRAS_BEGIN,
  EXTRAS_END,
  ERASURE_MIGRATION_FILE,
  MAP_BEGIN,
  MAP_END,
  extractBlock,
  parseMapBlock,
  renderDetachBlock,
  renderExtrasBlock,
  renderMapBlock,
} from "./erasure-sql";

const MIGRATION = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations", ERASURE_MIGRATION_FILE);
const sql = readFileSync(MIGRATION, "utf8");

type Fk = { constraint: string; table: string; column: string; on_delete: string; not_null: boolean };
const fks = fixture.fks as Fk[];
const fkByKey = new Map(fks.map((f) => [`${f.table}.${f.column}`, f]));

describe("erasure map ↔ live-schema fixture", () => {
  it("fixture is the 126-FK production dump", () => {
    expect(fixture.referenced).toBe("public.app_users(id)");
    expect(fks.length).toBe(126);
    expect(fixture.count).toBe(fks.length);
    const by = fks.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.on_delete]: (acc[f.on_delete] ?? 0) + 1 }), {});
    expect(by).toEqual({ CASCADE: 82, "NO ACTION": 14, "SET NULL": 24, RESTRICT: 6 });
  });

  it("every FK is mapped exactly once and nothing stale is mapped", () => {
    const keys = ERASURE_MAP.map(entryKey);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
    const unmapped = [...fkByKey.keys()].filter((k) => !keys.includes(k));
    expect(unmapped, "FK referencing app_users with no erasure decision").toEqual([]);
    const stale = keys.filter((k) => !fkByKey.has(k));
    expect(stale, "map entry with no matching FK in the fixture").toEqual([]);
    expect(ERASURE_MAP.length).toBe(fks.length);
  });

  it("detach and nullRef only target nullable columns; immutable only the append-only ledgers", () => {
    for (const e of ERASURE_MAP) {
      const fk = fkByKey.get(entryKey(e))!;
      if (e.mode === "detach" || e.nullRef) expect(fk.not_null, `${entryKey(e)} is NOT NULL — cannot be nulled`).toBe(false);
      if (e.immutable) expect(e.mode).toBe("anonymise");
      if (e.nullRef) expect(e.mode).toBe("anonymise");
      expect(e.note.length).toBeGreaterThan(10);
    }
    const immutable = ERASURE_MAP.filter((e) => e.immutable).map(entryKey).sort();
    expect(immutable).toEqual(["app_user_audit_log.user_id", "reseller_audit_log.actor_user_id", "reseller_audit_log.subject_user_id"]);
  });

  it("RESTRICT / NOT NULL ledgers are never deleted — the tombstone keeps them valid", () => {
    const mustKeep = [
      "credit_transactions.user_id",
      "usage_logs.user_id",
      "coupon_redemptions.user_id",
      "referral_events.referrer_id",
      "referral_events.referred_id",
      "referrals.referrer_id",
      "revenue_events.user_id",
      "checkout_session_reseller_commissions.founder_id",
      "reseller_credit_grants.target_user_id",
      "report_orders.user_id",
      "startup_package_purchases.user_id",
      "app_user_audit_log.user_id",
      "reseller_audit_log.actor_user_id",
      "consent_events.user_id",
      "consents.grantor_user_id",
      "share_packages.owner_user_id",
      "valuation_certificates.user_id",
    ];
    for (const k of mustKeep) {
      const e = ERASURE_MAP.find((x) => entryKey(x) === k);
      expect(e, k).toBeDefined();
      expect(e!.mode, k).toBe("anonymise");
    }
    // Every RESTRICT FK is anonymise (kept) — RESTRICT rows cannot be cascaded away.
    for (const f of fks.filter((x) => x.on_delete === "RESTRICT")) {
      expect(ERASURE_MAP.find((e) => entryKey(e) === `${f.table}.${f.column}`)!.mode, `${f.table}.${f.column}`).toBe("anonymise");
    }
  });

  it("the actor pointers the task lists are detached", () => {
    for (const k of [
      "app_users.referred_by",
      "app_users.verified_by",
      "secondary_offers.reviewed_by",
      "evidence_versions.created_by",
      "reseller_notes.author_user_id",
      "svi_dimension_evidence.verified_by_user_id",
      "revocations.revoked_by_user_id",
      "equity_requests.reviewer_id",
    ]) {
      expect(ERASURE_MAP.find((e) => entryKey(e) === k)!.mode, k).toBe("detach");
    }
  });

  it("credentials go first, detaches before deletes, NO ACTION children before parents, parents last", () => {
    const ord = orderedEntries();
    const pos = (k: string) => ord.findIndex((e) => entryKey(e) === k);
    expect(ord[0].order).toBe(10);
    for (const k of ["sessions.user_id", "api_keys.user_id", "svi_api_keys.user_id", "webhook_endpoints.user_id", "oauth2_tokens.subject_user_id"]) {
      expect(ord.find((e) => entryKey(e) === k)!.order).toBe(10);
    }
    const lastDetach = Math.max(...ord.filter((e) => e.mode === "detach").map((e) => ord.indexOf(e)));
    const firstDelete = Math.min(...ord.filter((e) => e.mode === "delete" && e.order >= 20).map((e) => ord.indexOf(e)));
    expect(lastDetach).toBeLessThan(firstDelete);
    expect(pos("compliance_s708_certs.user_id")).toBeLessThan(pos("dataroom_files.user_id"));
    expect(pos("dataroom_files.user_id")).toBeLessThan(pos("user_source_folders.user_id"));
    for (const p of ["idea_evaluations.user_id", "equity_splits.user_id", "funding_plans.user_id"]) expect(pos("founder_packs.user_id")).toBeLessThan(pos(p));
    expect(pos("valuation_certificates.user_id")).toBeLessThan(pos("startup_score_history.user_id"));
    for (const parent of ["projects.user_id", "data_rooms.user_id", "evidence.owner_user_id"]) {
      expect(ord.find((e) => entryKey(e) === parent)!.order).toBe(40);
    }
    expect(pos("evidence_versions.created_by")).toBeLessThan(pos("evidence.owner_user_id"));
    // ledgers after everything the cascades could touch
    expect(Math.min(...ord.filter((e) => e.mode === "anonymise" && e.order === 50).map((e) => ord.indexOf(e)))).toBeGreaterThan(pos("projects.user_id"));
  });

  it("summary matches the classification", () => {
    const s = summariseErasureMap();
    expect(s.entries).toBe(126);
    expect(s.delete + s.anonymise + s.detach).toBe(126);
    expect(s).toMatchObject({ delete: 77, anonymise: 34, detach: 15, immutable: 3, tables: 112 });
    expect(s.project_detaches).toBe(PROJECT_DETACHES.length);
    expect(s.non_fk_extras).toBe(NON_FK_EXTRAS.length);
  });

  it("tombstone address carries no PII and non-FK extras name a scrub when anonymising", () => {
    expect(tombstoneEmail("u", "abc")).toBe("deleted+abc@erased.blockid.au");
    for (const x of NON_FK_EXTRAS) {
      if (x.mode === "anonymise") expect(x.scrub, x.table).toBeTruthy();
      expect(["email", "user_id"]).toContain(x.by);
    }
    expect(NON_FK_EXTRAS.map((x) => x.table)).toContain("magic_links");
    for (const d of PROJECT_DETACHES) expect(["projects", "svi_accounts"]).toContain(d.parent);
  });
});

describe("erasure migration ↔ map parity", () => {
  it("carries the three generated VALUES blocks verbatim", () => {
    expect(extractBlock(sql, MAP_BEGIN, MAP_END)).toBe(renderMapBlock());
    expect(extractBlock(sql, DETACH_BEGIN, DETACH_END)).toBe(renderDetachBlock());
    expect(extractBlock(sql, EXTRAS_BEGIN, EXTRAS_END)).toBe(renderExtrasBlock());
  });

  it("the SQL block parses back to the same 126 entries", () => {
    const parsed = parseMapBlock(extractBlock(sql, MAP_BEGIN, MAP_END)!);
    expect(parsed.length).toBe(126);
    const ord = orderedEntries();
    parsed.forEach((p, i) => {
      const e = ord[i];
      expect(`${p.table}.${p.column}`).toBe(entryKey(e));
      expect(p.mode).toBe(e.mode);
      expect(p.order).toBe(e.order);
      expect(p.opts).toBe(e.immutable ? "immutable" : e.nullRef ? "nullref" : null);
      expect(p.scrub).toBe(e.scrub ?? null);
    });
  });

  it("is SECURITY DEFINER, service_role only, one transaction, and tombstones the row", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.erase_account\(p_user_id uuid, p_dry_run boolean DEFAULT true\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.erase_account\(uuid, boolean\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.erase_account\(uuid, boolean\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.erase_account\(uuid, boolean\) TO service_role/);
    expect(sql).toMatch(/'service_role'\)\s+THEN\s+RAISE EXCEPTION 'erase_account: service_role only'/);
    expect(sql.trim().startsWith(`-- ${ERASURE_MIGRATION_FILE}`)).toBe(true);
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
    // tombstone
    expect(sql).toMatch(/'deleted\+' \|\| v_hash \|\| '@erased\.blockid\.au'/);
    expect(sql).toMatch(/display_name\s+= 'Deleted user'/);
    expect(sql).toMatch(/erased_at\s+= now\(\)/);
    for (const col of TOMBSTONE_NULL_COLUMNS) {
      expect(sql, col).toMatch(new RegExp(`^\\s+${col}\\s+= NULL,?$`, "m"));
    }
    // grace-period columns
    for (const col of ["deletion_requested_at", "deletion_reason", "deletion_cancel_token_hash", "deletion_reauth_token_hash", "deletion_reauth_expires_at", "erased_at"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`));
    }
    // dry-run never writes: every mutating EXECUTE sits under NOT p_dry_run
    const writes = sql.match(/EXECUTE format\('(DELETE|UPDATE)/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(6);
    expect((sql.match(/IF NOT p_dry_run/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
