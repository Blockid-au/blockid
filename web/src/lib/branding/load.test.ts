import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const supabaseMock = { from: fromMock };
const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { loadBrandSettings } from "./load";

describe("loadBrandSettings", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
    maybeSingleMock.mockReset();
    selectMock.mockClear();
    eqMock.mockClear();
    fromMock.mockClear();
  });

  it("returns null when plan is locked (no pdf_branding feature)", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    const result = await loadBrandSettings("user-1", "founder_free");
    expect(result).toBeNull();
    // Must NOT even touch the DB on a locked plan.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when plan code is null/undefined", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    expect(await loadBrandSettings("user-1", null)).toBeNull();
    expect(await loadBrandSettings("user-1", undefined)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when userId is empty even on paid plan", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    expect(await loadBrandSettings("", "founder_growth")).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when Supabase is not configured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    expect(await loadBrandSettings("user-1", "founder_growth")).toBeNull();
  });

  it("returns null when no brand_settings row exists for the user", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: null });
    const result = await loadBrandSettings("user-1", "founder_growth");
    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledWith("brand_settings");
  });

  it("returns the mapped BrandSettings row for a paid plan with saved branding", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({
      data: {
        logo_url: "https://example.supabase.co/storage/v1/object/public/logos/x.png",
        primary_color: "#00ff88",
        accent_color: "#ff00aa",
        report_header: "Custom Header",
        footer_text: "© Custom Co 2026",
      },
    });
    const result = await loadBrandSettings("user-1", "founder_scale");
    expect(result).toEqual({
      logoUrl: "https://example.supabase.co/storage/v1/object/public/logos/x.png",
      primaryColor: "#00ff88",
      accentColor: "#ff00aa",
      reportHeader: "Custom Header",
      footerText: "© Custom Co 2026",
    });
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("applies safe defaults when partial fields are null in the DB row", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({
      data: {
        logo_url: null,
        primary_color: null,
        accent_color: null,
        report_header: null,
        footer_text: null,
      },
    });
    const result = await loadBrandSettings("user-1", "founder_enterprise");
    expect(result).toEqual({
      logoUrl: null,
      primaryColor: "#2563eb",
      accentColor: "#f59e0b",
      reportHeader: "",
      footerText: "",
    });
  });

  it("returns null (never throws) when the Supabase call errors out", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockRejectedValue(new Error("DB down"));
    const result = await loadBrandSettings("user-1", "growth");
    expect(result).toBeNull();
  });

  it("works with legacy plan codes (growth / scale / enterprise)", async () => {
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: null });
    await loadBrandSettings("user-1", "growth");
    await loadBrandSettings("user-1", "scale");
    await loadBrandSettings("user-1", "enterprise");
    expect(fromMock).toHaveBeenCalledTimes(3);
  });
});
