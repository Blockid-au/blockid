"use client";

// G19-S45 (D4) — one polling state machine over GET /api/reports/[orderId],
// shared by the thin legacy wrapper (<ReportOrderView>) and the ReportV2
// page (business-report-client.tsx), which now IS the paid view.
//
//   202 → keep polling at the server-supplied `retryInSeconds`
//   200 → ready: order metadata + the report view (reportV2 when stored)
//   402 / 404 / 410 / 5xx → blocked (the message is the server's sentence)
//
// Polling stops on any non-202. There is no client-side timer fallback:
// the retry cadence comes from the server so it can be tuned without a
// redeploy of the bundle. `null` orderId → idle (nothing fetched).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportV2 } from "@/lib/report-v2/schema";

export interface OrderMeta {
  orderId: string;
  status: string;
  paidAt: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  amountAud: number;
  creditsUsed: number;
}

export interface ReportPayload {
  reportId: string;
  title: string;
  tier: string;
  locale?: string;
  executiveSummary: string;
  markdown: string;
  totalWords: number;
  sectionsCount: number;
  qualityScore: number | null;
  /** The ReportV2 document (assembled_reports.report_json); null on pre-v2 orders. */
  reportV2?: ReportV2 | null;
}

interface ApiResponse {
  ok: boolean;
  status?: string;
  reason?: string;
  message?: string;
  order?: OrderMeta;
  report?: ReportPayload;
  retryInSeconds?: number;
  refunded?: boolean;
  regenerable?: boolean;
  failureReason?: string;
}

export type ReportOrderState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "pending"; message: string; status: string }
  | { phase: "ready"; order: OrderMeta; report: ReportPayload }
  | {
      phase: "blocked";
      httpStatus: number;
      message: string;
      refunded: boolean;
      regenerable: boolean;
      failureReason?: string;
    };

export const DEFAULT_RETRY_SECONDS = 15;

export function useReportOrder(orderId: string | null | undefined): ReportOrderState {
  const [state, setState] = useState<ReportOrderState>(orderId ? { phase: "loading" } : { phase: "idle" });
  // Guards the poll loop against firing after unmount (React 18 strict
  // mode double-invokes effects; a stray setState there is a warning).
  const liveRef = useRef(true);

  const poll = useCallback(async (): Promise<number | null> => {
    if (!orderId) return null;
    const res = await fetch(`/api/reports/${encodeURIComponent(orderId)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await res.json()) as ApiResponse;
    if (!liveRef.current) return null;

    if (res.status === 200 && data.ok && data.report && data.order) {
      setState({ phase: "ready", order: data.order, report: data.report });
      return null;
    }

    if (res.status === 202) {
      setState({
        phase: "pending",
        message: data.message ?? "Your report is being generated…",
        status: data.status ?? "GENERATING",
      });
      return data.retryInSeconds ?? DEFAULT_RETRY_SECONDS;
    }

    setState({
      phase: "blocked",
      httpStatus: res.status,
      message: data.message ?? data.reason ?? `We could not load this report (${res.status}).`,
      refunded: data.refunded === true,
      regenerable: data.regenerable === true,
      failureReason: data.failureReason,
    });
    return null;
  }, [orderId]);

  useEffect(() => {
    liveRef.current = true;
    if (!orderId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const retryIn = await poll();
        if (retryIn !== null && liveRef.current) {
          timer = setTimeout(run, Math.max(3, retryIn) * 1000);
        }
      } catch {
        if (!liveRef.current) return;
        setState({
          phase: "blocked",
          httpStatus: 0,
          message: "We lost the connection while loading your report. Refresh to try again — your purchase is safe.",
          refunded: false,
          regenerable: false,
        });
      }
    };

    void run();

    return () => {
      liveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, poll]);

  return state;
}
