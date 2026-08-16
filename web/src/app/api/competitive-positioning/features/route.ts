import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  saveExtractedFeatures,
  listCompetitorFeatures,
  updateFeatureComparison,
} from "@/lib/competitive-positioning";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const competitorId = searchParams.get("competitorId");

  if (!competitorId) {
    return NextResponse.json({ ok: false, error: "competitorId is required" }, { status: 400 });
  }

  try {
    const features = await listCompetitorFeatures(user, competitorId);
    return NextResponse.json({ ok: true, features });
  } catch (err) {
    console.error("[competitive-positioning/features GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to list features" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      competitorId: string;
      features: Array<{
        featureName: string;
        featureCategory: string;
        source: "website_scrape" | "ai_analysis" | "manual_entry";
        confidenceScore?: number;
        founderNotes?: string;
        extractedFromPage?: string;
      }>;
    };

    if (!body.competitorId || !Array.isArray(body.features)) {
      return NextResponse.json(
        { ok: false, error: "competitorId and features are required" },
        { status: 400 },
      );
    }

    const mapped = body.features.map((f) => ({
      name: f.featureName,
      category: f.featureCategory,
      confidence_score: f.confidenceScore ?? 0.8,
      source: f.source,
      extracted_from_page: f.extractedFromPage ?? "",
    }));

    const saved = await saveExtractedFeatures(user, body.competitorId, mapped);
    return NextResponse.json({ ok: true, saved: saved.length });
  } catch (err) {
    console.error("[competitive-positioning/features POST]", err);
    return NextResponse.json({ ok: false, error: "Failed to save features" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      competitorId: string;
      featureId: string;
      hasFounderFeature: boolean | null;
      founderNotes?: string;
    };

    if (!body.competitorId || !body.featureId) {
      return NextResponse.json(
        { ok: false, error: "competitorId and featureId are required" },
        { status: 400 },
      );
    }

    await updateFeatureComparison(user, body.competitorId, [
      {
        feature_id: body.featureId,
        has_founder_feature: body.hasFounderFeature,
        founder_notes: body.founderNotes,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[competitive-positioning/features PATCH]", err);
    return NextResponse.json({ ok: false, error: "Failed to update feature" }, { status: 500 });
  }
}
