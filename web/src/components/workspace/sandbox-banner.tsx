"use client";

// Reseller sandbox banner — CLO D4-CLO-06.
//
// Rendered at the top of a workspace when the active project has
// `reseller_sandbox_id` set (i.e. it is a reseller demo/test workspace).
// Warns the reseller-admin not to paste real customer personal information
// without written consent and links to the Acceptable Use Policy.
//
// Design decisions:
//   - Non-dismissable. A dismissable banner defeats the purpose — the whole
//     point is that the reseller-admin never forgets which workspace they are
//     in. Simpler than cookie-daily flow, and avoids failure modes where the
//     cookie is scoped wrong and the banner stays hidden forever.
//   - Server parent decides visibility via `isSandbox` prop; component itself
//     is a no-op when the flag is false so callers can render it
//     unconditionally without a wrapper.
//   - Bilingual EN/VI via useLocale() to match every other on-platform notice.

import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/lib/use-locale";

interface SandboxBannerProps {
  isSandbox: boolean;
}

const COPY = {
  en: {
    heading: "This is a TEST workspace.",
    body: "Do NOT paste real customer personal information without their written consent.",
    link: "Read Acceptable Use Policy",
  },
  vi: {
    heading: "Đây là môi trường THỬ NGHIỆM.",
    body: "KHÔNG dán thông tin cá nhân thật của khách hàng nếu chưa có sự đồng ý bằng văn bản.",
    link: "Đọc Chính sách sử dụng chấp nhận được",
  },
} as const;

export function SandboxBanner({ isSandbox }: SandboxBannerProps) {
  const [locale] = useLocale();
  if (!isSandbox) return null;
  const t = COPY[locale];
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="reseller-sandbox-banner"
      className="border-b border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
        <AlertTriangle
          strokeWidth={1.75}
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
        />
        <p className="flex-1 leading-snug">
          <strong className="font-semibold">{t.heading}</strong>{" "}
          <span>{t.body}</span>{" "}
          <Link
            href="/legal/acceptable-use"
            className="font-medium underline decoration-amber-700/60 underline-offset-2 hover:decoration-amber-700"
          >
            {t.link}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SandboxBanner;
