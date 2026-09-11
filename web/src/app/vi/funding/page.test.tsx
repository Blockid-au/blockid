import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// /vi/funding (T0248): same body as /funding, D-3 strings from the VI
// catalogue (`funding.copy.*`), live hero number, hreflang pair.

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => undefined }));
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ user: null, entitlements: [], trial: null, isLoading: true, can: () => false, refresh: async () => undefined }),
}));
vi.mock("@/lib/funding/data", () => ({
  listGrants: vi.fn(async () => [
    { id: "g1", name: "MVP Ventures", status: "open", amount_max_aud: 3_200_000, exclude_from_matching: false, last_verified_at: "2026-09-10" },
  ]),
  listPrograms: vi.fn(async () => [{ id: "p1", name: "Plus Eight", status: "open", last_verified_at: "2026-09-10" }]),
}));

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("/vi/funding (T0248)", () => {
  it("renders the Vietnamese hero, sub-line, trust line and CTAs with the live A$ figure", async () => {
    const out = await html();
    expect(out).toContain("Có A$3.2M grant và chương trình tại Úc đang mở ngay lúc này.");
    expect(out).toContain("Danh sách miễn phí. Kiểm tra điều kiện, xếp hạng và kế hoạch 12 tháng giá A$3.");
    expect(out).toContain("1 chương trình đang nhận hồ sơ hôm nay.");
    expect(out).toContain("Thông tin grant là miễn phí từ chính phủ");
    expect(out).toContain("Ghép cho tôi — ba câu hỏi, miễn phí");
    expect(out).toContain("A$29/tháng · Starter");
    expect(out).not.toContain("There&#x27;s A$3.2M");
    expect(out).not.toMatch(/A\$5\.50|PhD|A\$99/);
  });

  it("metadata carries the VI title + hreflang pair", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata();
    expect(meta.title).toBe("Tìm vốn cho startup tại Úc trong 60 giây");
    expect(`${String(meta.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(meta.description).length).toBeGreaterThanOrEqual(140);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect((meta.openGraph as { locale?: string; images?: unknown[] }).locale).toBe("vi_VN");
    expect((meta.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    expect(meta.alternates?.languages).toMatchObject({ en: "https://blockid.au/funding", vi: "https://blockid.au/vi/funding" });
  });
});
