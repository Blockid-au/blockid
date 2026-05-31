"use client";

// Hook: resolves the CURRENT project's deployed equity token.
//
// Returns the per-startup token (address/symbol/name) or null if the startup
// hasn't been tokenized yet. Use instead of the hardcoded CONTRACTS.svt so
// every startup's pages show its own token.

import * as React from "react";

export interface StartupToken {
  address: string;
  symbol: string;
  name: string;
}

export function useStartupToken(): {
  token: StartupToken | null;
  loading: boolean;
  reload: () => void;
} {
  const [token, setToken] = React.useState<StartupToken | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    fetch("/api/blockchain/token")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setToken(data?.ok ? (data.token as StartupToken | null) : null);
      })
      .catch(() => {
        if (active) setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { token, loading, reload };
}
