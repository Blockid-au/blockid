/**
 * GET /api/financial/forecast/[modelId]/fetch
 *
 * Fetch a single financial model with complete projection data
 * Used for: dashboard detail view, investor pack assembly, result preview
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { FetchForecastResponse } from '@/types/financial';
import { assertProjectAccess } from '@/lib/projects';
import { projectAccessResponse } from '@/lib/project-members/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { modelId } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Fetch model
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('*')
      .eq('id', modelId)
      .eq('is_deleted', false)
      .single();

    if (modelError || !model) {
      return NextResponse.json(
        { ok: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    // Release QA-4 P2-e: the previous check selected `projects.created_by`, a column
    // that does not exist, so every call was denied (fail-closed, feature dead).
    // Access now goes through the S17-A chokepoint `assertProjectAccess`
    // (owner or accepted member ≥ minRole; 404 for a non-member so the project's
    // existence is not confirmed, 403 for an under-ranked member, 503 no DB).
    try {
      await assertProjectAccess(user.id, String(model.project_id), 'viewer');
    } catch (err) {
      const denied = projectAccessResponse(err);
      if (denied) return denied;
      throw err;
    }

    const response: FetchForecastResponse = {
      ok: true,
      model,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[GET /api/financial/forecast/[modelId]/fetch] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
