// GST calculation helper (Australian Consumer Law + ATO A New Tax System).
//
// Rules — see clo-spec.md §4 / ciso-spec.md §2:
//   • GST-inclusive pricing (ACL): displayed price already includes GST.
//   • When registered AND customer is in AU (jurisdiction "AU"):
//       gst = round(gross * 1/11)          (10% GST-inclusive split)
//       net = gross - gst
//   • Not registered OR non-AU customer:
//       gst = 0, net = gross
//   • ATO turnover threshold ($75k = 7,500,000 cents) governs whether we
//     REGISTER; that flag is stored in gst_config.registered and passed in.
//
// All amounts are integer AUD cents. No floats returned.

export interface GstBreakdown {
  gst_cents: number;
  net_cents: number;
  gross_cents: number;
}

export function calculateGst(
  gross_aud_cents: number,
  registered: boolean,
  customerJurisdiction: string,
): GstBreakdown {
  const gross = Number.isFinite(gross_aud_cents) ? Math.trunc(gross_aud_cents) : 0;
  const isAU = typeof customerJurisdiction === "string"
    && customerJurisdiction.trim().toUpperCase() === "AU";

  if (!registered || !isAU || gross <= 0) {
    return { gst_cents: 0, net_cents: gross, gross_cents: gross };
  }

  // GST-inclusive split: gst = gross / 11 (rounded to nearest cent).
  const gst = Math.round(gross / 11);
  const net = gross - gst;
  return { gst_cents: gst, net_cents: net, gross_cents: gross };
}
