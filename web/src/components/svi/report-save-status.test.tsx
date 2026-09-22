import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSaveStatusNotice, SavedReportActions } from "./report-save-status";

const language = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/lib/use-locale", () => ({ useLocale: () => [language.locale] }));
beforeEach(() => { language.locale = "en"; });

describe("report save notice", () => {
  it("explains incomplete saving while retaining access to the generated report", () => {
    const html = renderToStaticMarkup(<ReportSaveStatusNotice status="save_failed" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("report was generated");
    expect(html).toContain("could not save");
    expect(html).toContain("read the results below");
    expect(html).toContain("No report email was requested");
    expect(html).not.toContain("download");
  });
  it.each([undefined, "saved", "not_requested"] as const)("does not invent failure or delivery for %s", (status) => {
    expect(renderToStaticMarkup(<ReportSaveStatusNotice status={status} />)).toBe("");
  });
  it("uses the shared Vietnamese locale without suggesting an unverified download", () => {
    language.locale = "vi";
    const html = renderToStaticMarkup(<ReportSaveStatusNotice status="save_failed" />);
    expect(html).toContain("chưa lưu đầy đủ");
    expect(html).toContain("giữ trang này mở");
    expect(html).not.toContain("download");
    expect(html).not.toContain("tải xuống");
  });
  it("does not render saved-artifact actions after a known failed save", () => {
    const renderActions = vi.fn(() => <><a href="/workspace/reports/business?pid=p">Full report</a><button>Share report</button><a href="/api/svi/report/pdf?token=old">PDF</a></>);
    expect(renderToStaticMarkup(<SavedReportActions status="save_failed">{<ActionFixture />}</SavedReportActions>)).toBe("");
    expect(renderActions).not.toHaveBeenCalled();
    function ActionFixture() { return renderActions(); }
  });
  it.each([undefined, "saved", "not_requested"] as const)("preserves saved and legacy action behavior for %s", (status) => {
    expect(renderToStaticMarkup(<SavedReportActions status={status}><a href="/workspace/reports/business">Full report</a></SavedReportActions>)).toContain("Full report");
  });

});
