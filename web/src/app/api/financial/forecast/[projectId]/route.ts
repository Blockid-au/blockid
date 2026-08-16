/**
 * GET/PUT/DELETE /api/financial/forecast/[projectId]
 *
 * GET: List all financial models for a project
 * PUT: Update a model (rename, toggle investor pack flag)
 * DELETE: Soft-delete a model
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type {
  ListForecastsResponse,
  FetchForecastResponse,
  UpdateForecastResponse,
  UpdateForecastRequest,
} from '@/types/financial';

export const dynamic = 'force-dynamic';

/**
 * GET /api/financial/forecast/[projectId]
 * List all active financial models for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
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

    const { projectId } = params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable' },
        { status: 503 }
      );
    }
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Fetch all active models
    const { data: models, error: modelsError } = await supabase
      .from('financial_models')
      .select(
        'id, project_id, user_id, name, model_type, description, current_arr_aud, monthly_growth_pct, churn_pct, cogs_pct, opex_monthly_aud, fixed_costs_aud, include_tax_incentives, scenario, month_breakeven, months_to_series_a, peak_monthly_burn_aud, arr_month_12_aud, arr_month_24_aud, arr_month_36_aud, runway_months, is_deleted, use_for_investor_pack, published_at, version, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (modelsError) {
      console.error('[GET /api/financial/forecast] Error:', modelsError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch models' },
        { status: 500 }
      );
    }

    const response: ListForecastsResponse = {
      ok: true,
      models: models || [],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[GET /api/financial/forecast/[projectId]] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/financial/forecast/[projectId]
 * Update a model (requires modelId in body)
 * Updates: name, useForInvestorPack, and other metadata
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string } }
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

    const { projectId } = params;
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const { modelId, name, useForInvestorPack, notes } = body;

    if (!modelId) {
      return NextResponse.json(
        { ok: false, error: 'modelId required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Verify project ownership and model exists
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('id, project_id, user_id')
      .eq('id', modelId)
      .eq('project_id', projectId)
      .single();

    if (modelError || !model || model.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Model not found or unauthorized' },
        { status: 404 }
      );
    }

    // Prepare update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (name) updateData.name = name;
    if (useForInvestorPack !== undefined) updateData.use_for_investor_pack = useForInvestorPack;
    if (notes) updateData.description = notes;

    // Update model
    const { data: updatedModel, error: updateError } = await supabase
      .from('financial_models')
      .update(updateData)
      .eq('id', modelId)
      .select()
      .single();

    if (updateError) {
      console.error('[PUT /api/financial/forecast] Error:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Failed to update model' },
        { status: 500 }
      );
    }

    const response: UpdateForecastResponse = {
      ok: true,
      model: updatedModel,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[PUT /api/financial/forecast/[projectId]] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/financial/forecast/[projectId]
 * Soft-delete a model (requires modelId in query)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
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

    const { projectId } = params;
    const modelId = request.nextUrl.searchParams.get('modelId');

    if (!modelId) {
      return NextResponse.json(
        { ok: false, error: 'modelId query parameter required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable' },
        { status: 503 }
      );
    }

    // Verify model ownership
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('id, project_id, user_id')
      .eq('id', modelId)
      .eq('project_id', projectId)
      .single();

    if (modelError || !model || model.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Model not found or unauthorized' },
        { status: 404 }
      );
    }

    // Soft-delete (mark as deleted)
    const { error: deleteError } = await supabase
      .from('financial_models')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', modelId);

    if (deleteError) {
      console.error('[DELETE /api/financial/forecast] Error:', deleteError);
      return NextResponse.json(
        { ok: false, error: 'Failed to delete model' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/financial/forecast/[projectId]] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
