"use client";

import type { ReactNode } from "react";
import type { ReportSaveStatus } from "@/lib/report-save-outcome";
import { useLocale } from "@/lib/use-locale";

/** Project-only links could open an older snapshot after this run failed to save. */
export function SavedReportActions({ status, children }: { status?: ReportSaveStatus; children: ReactNode }) {
  return status === "save_failed" ? null : <>{children}</>;
}

export function ReportSaveStatusNotice({ status }: { status?: ReportSaveStatus }) {
  const [locale] = useLocale();
  if (status !== "save_failed") return null;
  return (
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {locale === "vi"
        ? "Báo cáo đã được tạo, nhưng chưa lưu đầy đủ vào tài khoản. Bạn vẫn có thể đọc kết quả bên dưới. Hãy giữ trang này mở. Yêu cầu gửi email báo cáo chưa được thực hiện cho lần phân tích này."
        : "Your report was generated, but we could not save the complete report to your account. You can still read the results below. Keep this page open. No report email was requested for this run."}
    </p>
  );
}
