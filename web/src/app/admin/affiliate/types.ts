// Shared types between the /admin/affiliate server page and its client
// component. Kept in a plain module (no "server-only" import) so the
// client bundle can pull them without dragging Supabase-admin code.

import type { KAnonBucket } from "@/lib/reseller/portfolio-aggregates";

export interface ResellerRow {
  id: string;
  code: string;
  display_name: string;
  billing_model: string;
  status: string;
  created_at: string;
}

export interface AttributionSummaryBySource {
  provisioned: KAnonBucket;
  code: KAnonBucket;
  admin_manual: KAnonBucket;
  total: KAnonBucket;
  impersonation?: number;
}

export interface ResellerListEntry extends ResellerRow {
  summary: AttributionSummaryBySource;
}
