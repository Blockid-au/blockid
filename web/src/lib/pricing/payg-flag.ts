// payg-flag — server read of the Pricing v5 switch (G35 P3, plan §6.1/§6.10).
//
// Every PAYG behaviour (tier checkout, credits-for-tier, guest tier picker,
// Money Finder A$19) sits behind `platform_config.payg_enabled`, default
// false. This module is the ONE server read so a route never re-implements
// "is it on?" — and it FAILS CLOSED: any error reading platform_config means
// PAYG is off and the existing A$3 flows run exactly as before.

import "server-only";
import { getPlatformConfig } from "@/lib/platform-config";
import { PAYG_CONFIG_DEFAULTS, type PaygConfig } from "./v5-payg";

/** The PAYG slice of platform_config (defaults on any read failure; `payg_enabled` strictly `=== true`). */
export async function readPaygConfig(): Promise<PaygConfig> {
  try {
    const cfg = await getPlatformConfig();
    return {
      payg_enabled: cfg.payg_enabled === true,
      payg_snapshot_cents: cfg.payg_snapshot_cents ?? PAYG_CONFIG_DEFAULTS.payg_snapshot_cents,
      payg_full_cents: cfg.payg_full_cents ?? PAYG_CONFIG_DEFAULTS.payg_full_cents,
      payg_verified_cents: cfg.payg_verified_cents ?? PAYG_CONFIG_DEFAULTS.payg_verified_cents,
      verified_sla_business_days: validInt(cfg.verified_sla_business_days, 1, 10) ?? PAYG_CONFIG_DEFAULTS.verified_sla_business_days,
      payg_verified_max_open: validInt(cfg.payg_verified_max_open, 0, 100) ?? PAYG_CONFIG_DEFAULTS.payg_verified_max_open,
    };
  } catch {
    return { ...PAYG_CONFIG_DEFAULTS, payg_enabled: false };
  }
}

/** Is Pricing v5 PAYG on? Fails closed (false). */
export async function isPaygEnabled(): Promise<boolean> {
  return (await readPaygConfig()).payg_enabled;
}

function validInt(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
