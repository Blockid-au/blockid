"use client";

import * as React from "react";
import Link from "next/link";
import { formatRelativeTime, type IntegrationRow } from "@/lib/integrations/catalogue";
import { OAuthConnectorCard } from "@/components/workspace/oauth-connector-card";

export interface IntegrationRowCardProps {
  row: IntegrationRow;
}

const STATUS_STYLES: Record<IntegrationRow["status"], string> = {
  connected:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  syncing:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  error:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  not_connected:
    "border-ink-300 bg-ink-50 text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
  not_configured:
    "border-ink-200 bg-ink-50 text-ink-500 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-500",
};

const STATUS_LABEL: Record<IntegrationRow["status"], string> = {
  connected: "Connected",
  syncing: "Syncing",
  error: "Attention",
  not_connected: "Not connected",
  not_configured: "Awaiting configuration",
};

export function IntegrationRowCard({ row }: IntegrationRowCardProps): React.ReactElement {
  if (row.kind === "oauth") {
    return (
      <OAuthConnectorCard
        provider={row.provider as "github" | "stripe" | "ga4"}
        title={row.title}
        description={row.description}
        configured={row.configured}
        initialConnected={row.status === "connected" || row.status === "error"}
        initialAccountId={row.accountLabel}
        initialLastSyncAt={row.lastSyncAt}
        initialLastSyncError={row.lastSyncError}
      />
    );
  }

  const ctaLabel = row.status === "connected" || row.status === "syncing" ? "Manage" : "Set up";

  return (
    <div className="border border-ink-200 dark:border-ink-800 rounded-lg p-5 bg-white dark:bg-ink-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-100">
              {row.title}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${STATUS_STYLES[row.status]}`}
            >
              {STATUS_LABEL[row.status]}
            </span>
          </div>
          <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
            {row.description}
          </p>
          {row.accountLabel ? (
            <p className="text-xs text-ink-500 dark:text-ink-500 mt-2">
              Token contract: <span className="font-mono">{row.accountLabel}</span>
            </p>
          ) : null}
          {row.statusDetail ? (
            <p className="text-xs text-ink-500 dark:text-ink-500 mt-1">
              {row.statusDetail}
            </p>
          ) : null}
          {row.lastSyncAt ? (
            <p className="text-xs text-ink-500 dark:text-ink-500 mt-1">
              Last sync: {formatRelativeTime(row.lastSyncAt)}
            </p>
          ) : null}
          {row.lastSyncError ? (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {row.lastSyncError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 items-end shrink-0">
          <Link
            href={row.actionHref}
            className="px-3 py-1.5 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
