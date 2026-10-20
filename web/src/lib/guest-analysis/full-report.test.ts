// G35 D26 — guest Full hand-off to the /analyze ReportV2 job. Stub deps only:
// no model, no database, no file system.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handOffGuestFullReport, intakeInputFor, isAllowedUploadPath, type GuestFullDeps } from "./full-report";
import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { SaveAnalysisInput } from "@/lib/analyses/store";

const SIGNALS = { hasRevenue: false } as unknown as IntakeResult["signals"];

function intake(over: Partial<IntakeResult> = {}): IntakeResult {
  return {
    inputKind: "website",
    confidence: 0.9,
    rawText: "Acme builds compliance software for Australian clinics — long enough text.",
    structured: {},
    signals: SIGNALS,
    classifierMode: "regex",
    ...over,
  };
}

function deps(over: Partial<GuestFullDeps> = {}) {
  const saved: SaveAnalysisInput[] = [];
  const started: string[] = [];
  const analyzed: Array<{ input: unknown; scope: string }> = [];
  const d: GuestFullDeps = {
    analyze: async (input, scope) => {
      analyzed.push({ input, scope });
      return intake();
    },
    compactSvi: () => null,
    save: async (input) => {
      saved.push(input);
      return "a1b2c3d4-0000-4000-8000-000000000001";
    },
    newAnonKey: () => "anon-key-abcdefghijklmnop",
    start: (id) => {
      started.push(id);
    },
    readFile: async () => Buffer.from("%PDF-1.4 deck"),
    reportUrl: (id) => `https://blockid.au/analyze/${id}?t=signed`,
    ...over,
  };
  return { d, saved, started, analyzed };
}

const ORDER = {
  guestAnalysisId: "11111111-2222-4333-8444-555555555555",
  email: "founder@acme.com.au",
  inputType: "website_url" as const,
  inputValue: "https://acme.com.au",
  inputFilename: null,
};

describe("handOffGuestFullReport", () => {
  it("saves one unowned analyses row addressed to the buyer and starts the ReportV2 job", async () => {
    const { d, saved, started, analyzed } = deps();
    const out = await handOffGuestFullReport(ORDER, d);

    expect(analyzed).toHaveLength(1);
    expect(analyzed[0].input).toEqual({ url: "https://acme.com.au" });
    expect(analyzed[0].scope).toMatch(/^blockid:intake:[0-9a-f-]{36}$/);

    expect(saved).toHaveLength(1);
    const row = saved[0];
    expect(row.userId).toBeNull();
    expect(row.fullReportEmail).toBe("founder@acme.com.au");
    expect(row.anonKey).toBe("anon-key-abcdefghijklmnop");
    expect(row.url).toBe("https://acme.com.au");
    // The job reads the spend scope back off the stored intake.
    expect(row.result.aiBudgetScope).toBe(analyzed[0].scope);

    expect(started).toEqual(["a1b2c3d4-0000-4000-8000-000000000001"]);
    expect(out).toEqual({
      analysisId: "a1b2c3d4-0000-4000-8000-000000000001",
      reportUrl: "https://blockid.au/analyze/a1b2c3d4-0000-4000-8000-000000000001?t=signed",
      uploadedTmpPath: null,
    });
  });

  it("reads an uploaded deck from the guest upload root and hands back the path to delete", async () => {
    const { d, saved, analyzed } = deps({
      analyze: async (input, scope) => {
        analyzed.push({ input, scope });
        return intake({ inputKind: "pitch_deck" });
      },
    });
    const out = await handOffGuestFullReport({ ...ORDER, inputType: "pitch_file", inputValue: "/tmp/guest-uploads/abc.pdf", inputFilename: "Acme deck.pdf" }, d);
    const input = analyzed[0].input as { file: { filename: string; buffer: Buffer } };
    expect(input.file.filename).toBe("Acme deck.pdf");
    expect(input.file.buffer.toString()).toContain("%PDF");
    expect(saved[0].filename).toBe("Acme deck.pdf");
    expect(saved[0].bytes).toBe(Buffer.from("%PDF-1.4 deck").length);
    expect(out.uploadedTmpPath).toBe("/tmp/guest-uploads/abc.pdf");
  });

  it("refuses a path outside the upload roots before reading it", async () => {
    const readFile = vi.fn(async () => Buffer.from("x"));
    const { d, saved, started } = deps({ readFile });
    await expect(handOffGuestFullReport({ ...ORDER, inputType: "pitch_file", inputValue: "/etc/passwd", inputFilename: null }, d)).rejects.toThrow(/outside allowed roots/);
    expect(readFile).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(started).toHaveLength(0);
  });

  it("an input with no usable text or no signals starts nothing", async () => {
    for (const bad of [intake({ rawText: "  short " }), intake({ signals: undefined as unknown as IntakeResult["signals"] })]) {
      const { d, saved, started } = deps({ analyze: async () => bad });
      await expect(handOffGuestFullReport(ORDER, d)).rejects.toThrow("empty_input_after_extraction");
      expect(saved).toHaveLength(0);
      expect(started).toHaveLength(0);
    }
  });

  it("a row that did not save is a failed hand-off (no job started)", async () => {
    const { d, started } = deps({ save: async () => null });
    await expect(handOffGuestFullReport(ORDER, d)).rejects.toThrow("analysis_row_not_saved");
    expect(started).toHaveLength(0);
  });

  it("no link secret → no page link; the hand-off still succeeds", async () => {
    const { d } = deps({ reportUrl: () => null });
    expect((await handOffGuestFullReport(ORDER, d)).reportUrl).toBeNull();
  });
});

describe("intake input mapping", () => {
  it("adds a scheme to a bare domain", async () => {
    const r = await intakeInputFor({ inputType: "website_url", inputValue: "acme.com.au", inputFilename: null }, async () => Buffer.alloc(0));
    expect(r.input).toEqual({ url: "https://acme.com.au" });
  });

  it("upload roots", () => {
    expect(isAllowedUploadPath("/tmp/x.pdf")).toBe(true);
    expect(isAllowedUploadPath("/app/guest-uploads/x.pdf")).toBe(true);
    expect(isAllowedUploadPath("/home/x.pdf")).toBe(false);
  });
});
