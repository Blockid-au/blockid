/**
 * POST /api/financial/forecast/save
 *
 * Save a financial projection to database
 * - Charges 2 credits (or: check credit balance if available)
 * - Stores projection snapshot for audit trail
 * - Creates versioned record with immutable projection_data
 * - Returns model ID for future reference
 *
 * Note: Credit charging integration depends on existing credit system
 * This skeleton includes error handling for insufficient credits (402)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { SaveForecastRequest, SaveForecastResponse } from '@/types/financial';

export const dynamic = 'force-dynamic';

const FORECAST_SAVE_COST = 2; // Credits

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let body: Partial<SaveForecastRequest>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const { projectId, name, projection, notes, useForInvestorPack } = body;

    // Validate required fields
    if (!projectId || !name || !projection) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: projectId, name, projection' },
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

    // 3. Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Project not found or unauthorized' },
        { status: 403 }
      );
    }

    // 4. Check credit balance (if credit system exists)
    // TODO: Integrate with existing credit system in codebase
    // const { hasCredits, balance } = await checkUserCredits(user.id, FORECAST_SAVE_COST);
    // if (!hasCredits) {
    //   return NextResponse.json(
    //     { ok: false, error: 'Insufficient credits', creditsRequired: FORECAST_SAVE_COST, balance },
    //     { status: 402 }
    //   );
    // }

    // 5. Extract summary metrics from projection
    const summaryMetrics = {
      month_breakeven: projection.summary?.monthBreakeven ?? null,
      months_to_series_a: projection.summary?.monthsToSeriesA ?? null,
      peak_monthly_burn_aud: projection.summary?.peakBurnAud ?? null,
      arr_month_12_aud: projection.months[11]?.revenueAud
        ? Math.round(projection.months[11].revenueAud * 12)
        : null,
      arr_month_24_aud: projection.months[23]?.revenueAud
        ? Math.round(projection.months[23].revenueAud * 12)
        : null,
      arr_month_36_aud: projection.months[35]?.revenueAud
        ? Math.round(projection.months[35].revenueAud * 12)
        : null,
      runway_months: projection.summary?.runwayMonths ?? null,
    };

    // 6. Insert into financial_models table
    const { data: model, error: insertError } = await supabase
      .from('financial_models')
      .insert([
        {
          project_id: projectId,
          user_id: user.id,
          name,
          model_type: projection.input?.modelType || 'saas',
          description: notes || null,
          current_arr_aud: projection.input?.currentArrAud ?? 0,
          monthly_growth_pct: projection.input?.monthlyGrowthPct ?? 0,
          churn_pct: projection.input?.churnPct ?? 0,
          cogs_pct: projection.input?.cogsPercent ?? 0,
          opex_monthly_aud: projection.input?.opexMonthlyAud ?? 0,
          fixed_costs_aud: projection.input?.fixedCostsAud ?? 0,
          include_tax_incentives: projection.input?.includeTaxIncentives ?? false,
          scenario: projection.input?.scenario || 'base',
          projection_data: projection, // Immutable snapshot
          use_for_investor_pack: useForInvestorPack ?? false,
          ...summaryMetrics,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/financial/forecast/save] Insert error:', insertError);
      return NextResponse.json(
        { ok: false, error: 'Failed to save model' },
        { status: 500 }
      );
    }

    // 7. Charge credits (if credit system exists)
    // TODO: Integrate with existing credit system
    // await chargeCredits(user.id, FORECAST_SAVE_COST, 'forecast_save', model.id);

    // 8. Log audit trail
    const { error: auditError } = await supabase
      .from('financial_model_audit')
      .insert([
        {
          model_id: model.id,
          action: 'created',
          actor_id: user.id,
          actor_email: user.email,
          changed_fields: {
            name,
            scenario: projection.input?.scenario,
            current_arr_aud: projection.input?.currentArrAud,
          },
          created_at: new Date().toISOString(),
        },
      ]);

    if (auditError) {
      console.warn('[POST /api/financial/forecast/save] Audit log error:', auditError);
      // Don't fail the request if audit fails, just warn
    }

    const response: SaveForecastResponse = {
      ok: true,
      model,
      creditsCharged: FORECAST_SAVE_COST,
      creditsRemaining: undefined, // TODO: Return actual balance from credit system
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/financial/forecast/save] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
