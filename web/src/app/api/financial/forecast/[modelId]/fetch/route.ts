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

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
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

    const { modelId } = params;
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

    // Verify ownership (via project)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by')
      .eq('id', model.project_id)
      .single();

    if (projectError || !project || project.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 403 }
      );
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
