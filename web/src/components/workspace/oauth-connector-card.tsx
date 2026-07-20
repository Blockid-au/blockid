"use client";

import * as React from "react";

export interface OAuthConnectorCardProps {
  provider: "github" | "stripe" | "ga4";
  title: string;
  description: string;
  configured: boolean;
  initialConnected: boolean;
  initialAccountId?: string | null;
  initialLastSyncAt?: string | null;
  initialLastSyncError?: string | null;
}

interface ConnectionState {
  connected: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  status: "idle" | "syncing" | "disconnecting" | "error";
  toast: string | null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export function OAuthConnectorCard(props: OAuthConnectorCardProps): React.ReactElement {
  const [state, setState] = React.useState<ConnectionState>(() => ({
    connected: props.initialConnected,
    accountId: props.initialAccountId ?? null,
    lastSyncAt: props.initialLastSyncAt ?? null,
    lastSyncError: props.initialLastSyncError ?? null,
    status: "idle",
    toast: null,
  }));

  const startUrl = `/api/integrations/${props.provider}?action=start`;

  async function onSync(): Promise<void> {
    setState((s) => ({ ...s, status: "syncing", toast: null }));
    try {
      const res = await fetch(`/api/integrations/${props.provider}/sync`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        retryAfterMs?: number;
      };
      if (json.ok) {
        setState((s) => ({
          ...s,
          status: "idle",
          lastSyncAt: new Date().toISOString(),
          lastSyncError: null,
          toast: "Synced.",
        }));
      } else if (json.error === "rate_limited") {
        setState((s) => ({
          ...s,
          status: "idle",
          toast: `Please wait ${Math.ceil((json.retryAfterMs ?? 0) / 1000)}s before syncing again.`,
        }));
      } else {
        setState((s) => ({
          ...s,
          status: "error",
          lastSyncError: json.error ?? "sync_failed",
          toast: `Sync failed: ${json.error ?? "unknown"}`,
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        toast: `Sync failed: ${(err as Error).message}`,
      }));
    }
  }

  async function onDisconnect(): Promise<void> {
    if (!confirm(`Disconnect ${props.title}?`)) return;
    setState((s) => ({ ...s, status: "disconnecting", toast: null }));
    try {
      const res = await fetch(`/api/integrations?provider=${props.provider}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean };
      if (json.ok) {
        setState({
          connected: false,
          accountId: null,
          lastSyncAt: null,
          lastSyncError: null,
          status: "idle",
          toast: "Disconnected.",
        });
      } else {
        setState((s) => ({ ...s, status: "error", toast: "Disconnect failed." }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        toast: `Disconnect failed: ${(err as Error).message}`,
      }));
    }
  }

  return (
    <div className="border border-ink-200 dark:border-ink-800 rounded-lg p-5 bg-white dark:bg-ink-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink-900 dark:text-ink-100">
            {props.title}
          </h3>
          <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
            {props.description}
          </p>
          {state.connected && state.accountId ? (
            <p className="text-xs text-ink-500 dark:text-ink-500 mt-2">
              Linked account: <span className="font-mono">{state.accountId}</span>
            </p>
          ) : null}
          {state.connected ? (
            <p className="text-xs text-ink-500 dark:text-ink-500 mt-1">
              Last sync: {formatWhen(state.lastSyncAt)}
            </p>
          ) : null}
          {state.lastSyncError ? (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {state.lastSyncError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 items-end shrink-0">
          {!props.configured ? (
            <button
              disabled
              className="px-3 py-1.5 text-sm rounded-md border border-ink-300 dark:border-ink-700 text-ink-400 dark:text-ink-600 cursor-not-allowed"
              title="OAuth client not configured on this server"
            >
              Disabled - awaiting configuration
            </button>
          ) : state.connected ? (
            <>
              <button
                onClick={onSync}
                disabled={state.status === "syncing"}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {state.status === "syncing" ? "Syncing..." : "Sync now"}
              </button>
              <button
                onClick={onDisconnect}
                disabled={state.status === "disconnecting"}
                className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
              >
                {state.status === "disconnecting" ? "Removing..." : "Disconnect"}
              </button>
            </>
          ) : (
            <a
              href={startUrl}
              className="px-3 py-1.5 text-sm rounded-md bg-brand-600 hover:bg-brand-500 text-white"
            >
              Connect
            </a>
          )}
        </div>
      </div>

      {state.toast ? (
        <p className="text-xs text-ink-500 dark:text-ink-500 mt-3">{state.toast}</p>
      ) : null}
    </div>
  );
}
