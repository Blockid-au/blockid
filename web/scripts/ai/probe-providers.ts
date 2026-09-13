#!/usr/bin/env -S npx tsx
// S31-A — on-demand AI provider validity probe (no secrets printed).
//
//   cd web && npx tsx --env-file=.env.runtime scripts/ai/probe-providers.ts [--force] [--json]
//
// Runs the same probes the ai-health-check cron runs (lib/ai/provider-status.ts):
// one cheap call per configured provider, ≤ 1 per 15 min unless --force,
// result cached in content/reports/ai-provider-status.json. Prints a table of
// provider · status · headroom · detail. Exit code 0 when at least one
// provider is valid, 2 when none is (so a deploy gate can refuse to ship a
// platform with no working AI path).

import { probeProviders, type ProviderStatus } from "../../src/lib/ai/provider-status";

const force = process.argv.includes("--force");
const json = process.argv.includes("--json");

function headroom(p: ProviderStatus): string {
  const h = p.headroom;
  if (!h) return "";
  const bits: string[] = [];
  if (h.rpm_remaining != null) bits.push(`rpm=${h.rpm_remaining}`);
  if (h.tpm_remaining != null) bits.push(`tpm=${h.tpm_remaining}`);
  if (h.credits_remaining_usd != null) bits.push(`credits=US$${h.credits_remaining_usd}`);
  return bits.join(" ");
}

async function main(): Promise<void> {
  const out = await probeProviders({ force });
  const rows = Object.values(out.providers);
  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    process.stdout.write(`ai-provider-status @ ${out.updated_at}\n`);
    for (const p of rows) {
      const line = [p.provider.padEnd(14), p.status.padEnd(15), `${p.latency_ms}ms`.padStart(7), headroom(p).padEnd(28), p.detail ?? ""].join("  ");
      process.stdout.write(line.trimEnd() + "\n");
    }
  }
  const usable = rows.filter((p) => p.status === "valid").length;
  process.exit(usable > 0 ? 0 : 2);
}

main().catch((err) => {
  process.stderr.write(`probe failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
