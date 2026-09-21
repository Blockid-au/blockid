// SandboxScopeChip — 3-way "all / live / sandbox" pill row shipped alongside
// the iteration-9 admin fanout (plan-delta-2026-07-23.md § D3-CISO-05,
// SOURCE-OF-TRUTH.md § 2 D2-CFO-08).
//
// Usage
// -----
//   import { SandboxScopeChip } from "@/components/admin/sandbox-scope-chip";
//   import { makeScopeHrefBuilder, parseScope } from "@/lib/admin/sandbox-scope";
//
//   // Server page pattern (URL-driven filter):
//   const scope = parseScope(await searchParams);
//   const build = makeScopeHrefBuilder("/admin/foo", new URLSearchParams(sp));
//   <SandboxScopeChip scope={scope} buildHref={build} />
//
//   // "No sandbox column on this table" pattern — chip is display-only so
//   // the UI does not lie about a filter that has no effect. Do NOT pass
//   // buildHref; pass a `note` explaining why.
//   <SandboxScopeChip scope="all" note="Chip-only — underlying table has no sandbox column." />
//
// This is a pure presentational component (no hooks, no server-only
// imports) so it can render inside either a Server or Client Component.

import type { SandboxScope } from "@/lib/admin/sandbox-scope";
import { SANDBOX_SCOPE_VALUES } from "@/lib/admin/sandbox-scope";

interface SandboxScopeChipProps {
  scope: SandboxScope;
  /**
   * When provided, each pill renders as a link that swaps the scope. When
   * omitted the pills render as inert labels (used on pages whose query
   * cannot honour the filter — see `note`).
   */
  buildHref?: (next: SandboxScope) => string;
  /**
   * Optional explanatory text rendered next to the chip. Use this to
   * disclose that the filter is a no-op on pages whose underlying table
   * has no boolean sandbox column.
   */
  note?: string;
  /** Extra classes appended to the outer wrapper. */
  className?: string;
  /**
   * Kept for call-site compatibility; ignored since G26 (the admin shell is
   * light-only — docs/plans/g26-light-template-redesign-2026-09-21.md § 1).
   */
  theme?: "light" | "dark";
  /** Optional label text shown before the pills. Defaults to "Scope". */
  label?: string;
}

const LABEL: Record<SandboxScope, string> = {
  all: "All",
  live: "Live",
  sandbox: "Sandbox",
};

export function SandboxScopeChip({
  scope,
  buildHref,
  note,
  className = "",
  theme: _theme = "light",
  label = "Scope",
}: SandboxScopeChipProps) {
  void _theme;
  const wrapperCls =
    "inline-flex flex-wrap items-center gap-2 text-xs text-ink-600" +
    (className ? ` ${className}` : "");

  const labelCls = "text-ink-500";

  const activeCls = "rounded-full bg-action text-on-action";
  const idleLinkCls = "bg-white text-ink-700 ring-1 ring-surface-200 hover:bg-surface-100";
  const idleStaticCls = "bg-white text-muted ring-1 ring-surface-200";

  const noteCls = "text-warn";

  return (
    <div className={wrapperCls} data-testid="sandbox-scope-chip">
      <span className={`uppercase tracking-wide ${labelCls}`}>{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label="Sandbox scope filter">
        {SANDBOX_SCOPE_VALUES.map((value) => {
          const active = value === scope;
          const cls = `inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
            active ? activeCls : buildHref ? idleLinkCls : idleStaticCls
          }`;
          if (buildHref && !active) {
            return (
              <a
                key={value}
                href={buildHref(value)}
                className={cls}
                aria-label={`Filter to ${LABEL[value]}`}
              >
                {value === "sandbox" ? "🧪 " : ""}
                {LABEL[value]}
              </a>
            );
          }
          return (
            <span
              key={value}
              className={cls}
              aria-current={active ? "true" : undefined}
              aria-disabled={!buildHref}
            >
              {value === "sandbox" ? "🧪 " : ""}
              {LABEL[value]}
            </span>
          );
        })}
      </div>
      {note && (
        <span className={`text-[11px] italic ${noteCls}`} title={note}>
          {note}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SandboxRowBadge — tiny pill to prefix rows known to be sandbox activity.
// Only render when the source data actually carries the flag (see
// isSandboxRow); do NOT invent it on tables that lack the column.
// ---------------------------------------------------------------------------

export function SandboxRowBadge({
  theme = "light",
  className = "",
}: {
  theme?: "light" | "dark";
  className?: string;
}) {
  const cls =
    theme === "dark"
      ? "bg-amber-500/10 text-warn border border-amber-500/20"
      : "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  return (
    <span
      className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}${
 className ? ` ${className}` : ""
      }`}
      title="Reseller sandbox activity (bookkeeping-only)"
    >
      🧪 Sandbox
    </span>
  );
}
