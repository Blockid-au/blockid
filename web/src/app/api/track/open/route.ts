import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * GET /api/track/open?slug=xxx&email=xxx
 * Email open tracking pixel. Records when a user opens their SVI report email.
 * Returns a 1x1 transparent GIF.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const email = searchParams.get("email");

  // Record the open event (fire-and-forget)
  if (slug && email) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      // Update svi_notifications opened_at for this email's report
      void supabase
        .from("svi_notifications")
        .update({ opened_at: new Date().toISOString() })
        .eq("notification_type", "svi_report")
        .is("opened_at", null)
        .then(() => {});

      // Also try to record in svi_analyses viewed_at
      void supabase
        .from("svi_analyses")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", slug)
        .is("viewed_at", null)
        .then(() => {});
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
