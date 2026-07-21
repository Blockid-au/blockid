"use client";

// Reseller code field — collapsed by default; expanded automatically when a
// `?via=` capture is present. Rendered by StepTier alongside the plan grid.
//
// Per docs/plans/reseller-module-plan.md § C.2 (redemption UX). Validates
// via POST /api/reseller/code/validate. On success renders a display pill:
//   - tier > 0:   "{reseller} — {pct}% off forever"
//   - tier = 0:   "Introduced by {reseller} — no discount applied"
//
// On success also fires an APP-5.2 consent modal (see reseller-consent-modal.tsx
// — separate component). Removing the code clears both cookie + localStorage
// via the attribution helper.

import { useEffect, useState, useRef, useCallback } from "react";

type Locale = "en" | "vi";

interface Props {
  locale?: Locale;
  /** Initial code from URL/wizard state — auto-validates on mount if present. */
  initialCode?: string;
  /** Fired when validate succeeds so the wizard can persist to state.resellerCode. */
  onValidated?: (payload: {
    code: string;
    tier_pct: number;
    reseller: { code: string; display_name: string; logo_url: string | null };
  }) => void;
  /** Fired when the user removes the code so the wizard can clear its state. */
  onCleared?: () => void;
}

interface ValidateResponse {
  ok: boolean;
  reason?: "invalid" | "inactive" | "not_configured";
  tier_pct?: number;
  reseller?: {
    code: string;
    display_name: string;
    logo_url: string | null;
    primary_color: string | null;
    billing_model: "retail" | "wholesale";
  };
}

const STRINGS = {
  en: {
    have_code_cta: "Have a reseller code?",
    input_placeholder: "e.g. INFOVISION20",
    validate: "Apply",
    clear: "Remove",
    checking: "Checking…",
    invalid: "Code not recognised.",
    inactive: "This reseller is no longer active.",
    server: "Couldn't validate right now — try again.",
    pill_discount: (name: string, pct: number) => `${name} — ${pct}% off forever`,
    pill_no_discount: (name: string) => `Introduced by ${name} — no discount applied`,
  },
  vi: {
    have_code_cta: "Có mã đại lý?",
    input_placeholder: "vd. INFOVISION20",
    validate: "Áp dụng",
    clear: "Gỡ mã",
    checking: "Đang kiểm tra…",
    invalid: "Mã không hợp lệ.",
    inactive: "Đại lý này không còn hoạt động.",
    server: "Không kiểm tra được — thử lại.",
    pill_discount: (name: string, pct: number) => `${name} — giảm ${pct}% trọn đời`,
    pill_no_discount: (name: string) => `Được giới thiệu bởi ${name} — không có ưu đãi`,
  },
} as const;

function normaliseCodeClient(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clearViaClientCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "blockid_via=; max-age=0; path=/; samesite=lax";
  try { window.localStorage.removeItem("blockid_via"); } catch { /* ignore */ }
}

function persistViaClientCookie(code: string) {
  if (typeof document === "undefined") return;
  const clean = normaliseCodeClient(code);
  if (!clean) return;
  document.cookie = `blockid_via=${encodeURIComponent(clean)}; max-age=${60*60*24*30}; path=/; samesite=lax`;
  try { window.localStorage.setItem("blockid_via", clean); } catch { /* ignore */ }
}

export function ResellerCodeField({ locale = "en", initialCode, onValidated, onCleared }: Props) {
  const t = STRINGS[locale];
  const [expanded, setExpanded] = useState<boolean>(!!initialCode);
  const [input, setInput] = useState<string>(initialCode ?? "");
  const [status, setStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "inactive" | "server">("idle");
  const [validatedPill, setValidatedPill] = useState<{ name: string; tier: number } | null>(null);
  const autoValidated = useRef<boolean>(false);

  const runValidate = useCallback(async (raw: string) => {
    const code = normaliseCodeClient(raw);
    if (!code) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    try {
      const res = await fetch("/api/reseller/code/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as ValidateResponse;
      if (!data.ok || !data.reseller || data.tier_pct === undefined) {
        if (data.reason === "inactive") setStatus("inactive");
        else if (data.reason === "invalid") setStatus("invalid");
        else setStatus("server");
        return;
      }
      setStatus("valid");
      setValidatedPill({ name: data.reseller.display_name, tier: data.tier_pct });
      persistViaClientCookie(code);
      onValidated?.({
        code,
        tier_pct: data.tier_pct,
        reseller: {
          code: data.reseller.code,
          display_name: data.reseller.display_name,
          logo_url: data.reseller.logo_url,
        },
      });
    } catch {
      setStatus("server");
    }
  }, [onValidated]);

  // Auto-validate on mount if initialCode is provided (?via= flow).
  useEffect(() => {
    if (autoValidated.current) return;
    if (initialCode && normaliseCodeClient(initialCode)) {
      autoValidated.current = true;
      void runValidate(initialCode);
    }
  }, [initialCode, runValidate]);

  const handleClear = () => {
    setInput("");
    setValidatedPill(null);
    setStatus("idle");
    clearViaClientCookie();
    onCleared?.();
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-sm text-ink-600 underline hover:text-ink-800"
      >
        {t.have_code_cta}
      </button>
    );
  }

  if (status === "valid" && validatedPill) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
        <span className="text-sm font-medium text-brand-800">
          {validatedPill.tier > 0
            ? t.pill_discount(validatedPill.name, validatedPill.tier)
            : t.pill_no_discount(validatedPill.name)}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto text-xs text-brand-700 underline"
        >
          {t.clear}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.input_placeholder}
          className="flex-1 rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => void runValidate(input)}
          disabled={status === "checking" || !input.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === "checking" ? t.checking : t.validate}
        </button>
      </div>
      {status === "invalid" && <p className="text-xs text-red-600">{t.invalid}</p>}
      {status === "inactive" && <p className="text-xs text-red-600">{t.inactive}</p>}
      {status === "server" && <p className="text-xs text-red-600">{t.server}</p>}
    </div>
  );
}
