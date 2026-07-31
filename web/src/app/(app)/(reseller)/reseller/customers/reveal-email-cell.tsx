"use client";

// Client cell for the reseller customers table.
//
// Renders the masked email + a "Show" link. Click POSTs to
// /api/reseller/customers/[id]/reveal-email which writes a
// reseller_audit_log entry and returns the plaintext email. The full email
// then replaces the mask until the user clicks "Hide".

import { useState } from "react";

import { useLocale, type Locale } from "@/lib/use-locale";

interface Props {
  customerId: string;
  maskedEmail: string;
}

type State =
  | { status: "masked" }
  | { status: "loading" }
  | { status: "revealed"; email: string }
  | { status: "error"; message: string };

interface Copy {
  show: string;
  revealing: string;
  hide: string;
  reveal_failed: string;
  retry: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    show: "Show",
    revealing: "Revealing…",
    hide: "Hide",
    reveal_failed: "Reveal failed",
    retry: "Retry",
  },
  vi: {
    show: "Hiển thị",
    revealing: "Đang hiển thị…",
    hide: "Ẩn",
    reveal_failed: "Không hiển thị được",
    retry: "Thử lại",
  },
};

export function RevealEmailCell({ customerId, maskedEmail }: Props) {
  const [locale] = useLocale();
  const copy = COPY[locale];
  const [state, setState] = useState<State>({ status: "masked" });

  async function reveal() {
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/reseller/customers/${encodeURIComponent(customerId)}/reveal-email`,
        { method: "POST" },
      );
      const body = (await res.json()) as { ok?: boolean; email?: string; reason?: string };
      if (!res.ok || !body.ok || typeof body.email !== "string") {
        setState({ status: "error", message: body.reason ?? `HTTP ${res.status}` });
        return;
      }
      setState({ status: "revealed", email: body.email });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  if (state.status === "revealed") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-ink-800">{state.email}</span>
        <button
          type="button"
          onClick={() => setState({ status: "masked" })}
          className="text-xs text-ink-500 underline hover:text-ink-700"
        >
          {copy.hide}
        </button>
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-ink-700">{maskedEmail}</span>
        <span className="text-xs text-red-600" title={state.message}>
          {copy.reveal_failed}
        </span>
        <button
          type="button"
          onClick={reveal}
          className="text-xs text-brand-700 underline hover:text-brand-900"
        >
          {copy.retry}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-ink-700">{maskedEmail}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={state.status === "loading"}
        className="text-xs text-brand-700 underline hover:text-brand-900 disabled:text-ink-400 disabled:no-underline"
      >
        {state.status === "loading" ? copy.revealing : copy.show}
      </button>
    </span>
  );
}
