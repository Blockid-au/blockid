/**
 * POST /api/financial/forecast/generate
 *
 * Generate a financial projection (preview)
 * - No database save (2 credits only charged on /save)
 * - Auth required: getCurrentUser() validates logged-in user
 * - Project ownership verified before calculation
 * - Returns complete 36-month projection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeProjection, validateForecastInput } from '@/lib/forecast-builder';
import type { GenerateForecastRequest, GenerateForecastResponse } from '@/types/financial';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required', disclaimer: getDisclaimer() },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let body: Partial<GenerateForecastRequest>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON', disclaimer: getDisclaimer() },
        { status: 400 }
      );
    }

    // 3. Validate project ownership
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: 'Service unavailable', disclaimer: getDisclaimer() },
        { status: 503 }
      );
    }
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by, sector')
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { ok: false, error: 'Project not found', disclaimer: getDisclaimer() },
        { status: 404 }
      );
    }

    if (project.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', disclaimer: getDisclaimer() },
        { status: 403 }
      );
    }

    // 4. Prepare input for calculation
    const forecastInput = {
      modelType: (body.modelType as any) || 'saas',
      currentArrAud: body.currentArrAud ?? 0,
      monthlyGrowthPct: body.monthlyGrowthPct ?? 5,
      churnPct: body.churnPct ?? 0,
      cogsPercent: body.cogsPercent ?? 25,
      opexMonthlyAud: body.opexMonthlyAud ?? 0,
      fixedCostsAud: body.fixedCostsAud ?? 0,
      scenario: (body.scenario as any) ?? 'base',
      includeTaxIncentives: body.includeTaxIncentives ?? false,
      sector: project.sector || 'saas',
    };

    // 5. Validate input
    const validation = validateForecastInput(forecastInput);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          ok: false,
          error: validation.errors.join('; '),
          disclaimer: getDisclaimer(),
        },
        { status: 400 }
      );
    }

    // 6. Compute projection (pure function, no side effects)
    const projection = computeProjection(forecastInput);

    // 7. Return result
    const response: GenerateForecastResponse = {
      ok: true,
      projection,
      creditsCharged: 0, // No charge for preview
      creditsRemaining: undefined, // Not tracked in preview
      disclaimer: projection.disclaimer,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[/api/financial/forecast/generate] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        disclaimer: getDisclaimer(),
      },
      { status: 500 }
    );
  }
}

/**
 * Get standard AFSL disclaimer
 */
function getDisclaimer(): string {
  return 'General information only. Not financial advice. Projections are illustrative estimates based on Australian sector benchmarks and may differ materially from actual outcomes.';
}
