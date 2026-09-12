/**
 * GET /api/financial/forecast/[modelId]/export?format=csv
 *
 * Export financial model as CSV
 * Format: date, revenue, cogs, gross margin, opex, ebitda, cash flow, cum cash, headcount, tax offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ProjectionMonth, ProjectionOutput } from '@/types/financial';
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
    const format = request.nextUrl.searchParams.get('format') || 'csv';

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

    // Export as CSV
    if (format === 'csv') {
      const projection = model.projection_data;
      const csv = generateCsv(projection, model.name);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="forecast-${modelId}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported format' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[GET /api/financial/forecast/[modelId]/export] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate CSV from projection
 */
function generateCsv(projection: Partial<ProjectionOutput>, name: string): string {
  const headers = [
    'Month',
    'Date',
    'Revenue (AUD)',
    'COGS (AUD)',
    'Gross Margin (AUD)',
    'OpEx (AUD)',
    'EBITDA (AUD)',
    'Cash Outflow (AUD)',
    'Cumulative Cash (AUD)',
    'Headcount',
    'Tax Offset (AUD)',
  ];

  const rows: string[] = [];
  rows.push(headers.join(','));

  if (projection?.months && Array.isArray(projection.months)) {
    projection.months.forEach((month: ProjectionMonth) => {
      rows.push(
        [
          month.month,
          month.date,
          month.revenueAud,
          month.cogsAud,
          month.grossMarginAud,
          month.opexAud,
          month.ebitdaAud,
          month.cashOutflowAud,
          month.cumCashAud,
          month.headcount,
          month.taxOffsetAud,
        ].join(',')
      );
    });
  }

  // Add summary section
  rows.push('');
  rows.push('Summary Metrics');
  rows.push('Year 1 Revenue (AUD),' + projection.summary?.revenueYear1);
  rows.push('Year 2 Revenue (AUD),' + projection.summary?.revenueYear2);
  rows.push('Year 3 Revenue (AUD),' + projection.summary?.revenueYear3);
  rows.push('Year 1 Burn (AUD),' + projection.summary?.burnYear1);
  rows.push('Month Breakeven,' + (projection.summary?.monthBreakeven || 'N/A'));
  rows.push('Months to Series A,' + (projection.summary?.monthsToSeriesA || 'N/A'));
  rows.push('Peak Monthly Burn (AUD),' + projection.summary?.peakBurnAud);
  rows.push('Runway (months),' + (projection.summary?.runwayMonths || 'Indefinite'));

  return rows.join('\n');
}
