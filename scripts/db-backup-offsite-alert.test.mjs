// Colocated tests for the off-site backup alert policy (G15-R3.2): the
// once-per-24 h Telegram debounce and the founder-action row fields that
// /api/status.backups.offsite_status reads.

import { describe, expect, it } from "vitest";
import {
  ALERT_WINDOW_MS,
  FOUNDER_COMMAND,
  classifyOffsiteError,
  decideOffsiteAlert,
  isFounderActionClass,
  offsiteFailureFields,
} from "./db-backup-offsite-alert.mjs";

const T0 = Date.parse("2026-09-18T02:40:00Z");
const H = 3600e3;

describe("classifyOffsiteError", () => {
  it("maps the known failure messages to classes", () => {
    expect(classifyOffsiteError("Service Accounts do not have storage quota")).toBe("no_drive_quota");
    expect(classifyOffsiteError("Service account has no Drive quota — founder action: …")).toBe("no_drive_quota");
    expect(classifyOffsiteError("invalid_grant: Token has been expired or revoked")).toBe("credentials");
    expect(classifyOffsiteError("no Drive credentials: set GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN")).toBe("credentials");
    expect(classifyOffsiteError("request to https://www.googleapis.com failed, reason: ENOTFOUND")).toBe("network");
    expect(classifyOffsiteError("no db-*.dump.gz in /data/backups")).toBe("local_backup");
    expect(classifyOffsiteError("sha256 mismatch for db-x.dump.gz")).toBe("local_backup");
    expect(classifyOffsiteError("something odd")).toBe("other");
    expect(classifyOffsiteError(undefined)).toBe("other");
  });
  it("only credentials / quota are founder-only", () => {
    expect(isFounderActionClass("no_drive_quota")).toBe(true);
    expect(isFounderActionClass("credentials")).toBe(true);
    expect(isFounderActionClass("network")).toBe(false);
    expect(isFounderActionClass("other")).toBe(false);
  });
});

describe("decideOffsiteAlert — at most once per 24 h", () => {
  it("alerts on the first failure and records the state", () => {
    const r = decideOffsiteAlert(null, "no_drive_quota", T0);
    expect(r).toMatchObject({ alert: true, reason: "first_failure" });
    expect(r.next).toEqual({ last_alert_at: new Date(T0).toISOString(), error_class: "no_drive_quota", suppressed: 0 });
  });

  it("suppresses the same class inside the window and counts the suppressions", () => {
    const s1 = decideOffsiteAlert(null, "no_drive_quota", T0).next;
    const n1 = decideOffsiteAlert(s1, "no_drive_quota", T0 + 23 * H);
    expect(n1.alert).toBe(false);
    expect(n1.reason).toBe("debounced");
    expect(n1.next.suppressed).toBe(1);
    expect(n1.next.last_alert_at).toBe(s1.last_alert_at);
    const n2 = decideOffsiteAlert(n1.next, "no_drive_quota", T0 + 23.5 * H);
    expect(n2.alert).toBe(false);
    expect(n2.next.suppressed).toBe(2);
  });

  it("alerts again once 24 h have elapsed (nightly cron: night 1 alerts, night 2 alerts, i.e. ≤ 1 per day)", () => {
    const s1 = decideOffsiteAlert(null, "no_drive_quota", T0).next;
    const r = decideOffsiteAlert(s1, "no_drive_quota", T0 + ALERT_WINDOW_MS);
    expect(r).toMatchObject({ alert: true, reason: "window_elapsed" });
    expect(r.next.suppressed).toBe(0);
    expect(r.next.last_alert_at).toBe(new Date(T0 + ALERT_WINDOW_MS).toISOString());
    // A second run the same night (manual re-run) is still debounced.
    expect(decideOffsiteAlert(r.next, "no_drive_quota", T0 + ALERT_WINDOW_MS + H).alert).toBe(false);
  });

  it("a different error class alerts immediately", () => {
    const s1 = decideOffsiteAlert(null, "no_drive_quota", T0).next;
    const r = decideOffsiteAlert(s1, "network", T0 + H);
    expect(r).toMatchObject({ alert: true, reason: "error_class_changed" });
    expect(r.next.error_class).toBe("network");
  });

  it("tolerates a corrupt / partial state file", () => {
    expect(decideOffsiteAlert({ last_alert_at: "not a date" }, "other", T0).alert).toBe(true);
    expect(decideOffsiteAlert({}, "other", T0).alert).toBe(true);
    expect(decideOffsiteAlert({ last_alert_at: new Date(T0 - H).toISOString(), error_class: "other", suppressed: "x" }, "other", T0).next.suppressed).toBe(1);
  });
});

describe("offsiteFailureFields", () => {
  it("marks founder_action_required with the exact command for the quota / credentials class", () => {
    const f = offsiteFailureFields("no_drive_quota", { alerted: false, suppressed: 3 });
    expect(f.offsite_status).toBe("founder_action_required");
    expect(f.founder_command).toBe("node --env-file=web/.env scripts/db-backup-offsite-auth.mjs");
    expect(f.founder_command).toBe(FOUNDER_COMMAND);
    expect(f.local_retention).toBe("untouched");
    expect(f.alerted).toBe(false);
    expect(f.alerts_suppressed_since_last).toBe(3);
    expect(f.founder_action).toMatch(/GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN/);
  });
  it("is a plain fail for transient classes (no founder command)", () => {
    const f = offsiteFailureFields("network", { alerted: true });
    expect(f.offsite_status).toBe("fail");
    expect(f.founder_command).toBeUndefined();
    expect(f.local_retention).toBe("untouched");
    expect(f.alerted).toBe(true);
  });
});
