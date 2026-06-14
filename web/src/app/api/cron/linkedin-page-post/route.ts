// POST /api/cron/linkedin-page-post — Weekly post to BlockID LinkedIn Company Page
//
// Auth: CRON_SECRET header (Bearer token)
// Schedule: Every Monday 01:00 UTC (vercel.json)
//
// Config (env vars):
//   LINKEDIN_PAGE_ID          — numeric organization ID (e.g. 12345678)
//   LINKEDIN_PAGE_ACCESS_TOKEN — token with w_organization_social scope
//
// How to get:
//   1. Go to https://www.linkedin.com/developers/ → your app → Settings
//   2. Add product: "Marketing Developer Platform" → enables w_organization_social
//   3. Generate an access token via OAuth with w_organization_social scope
//   4. Find page ID: go to blockid LinkedIn page → Admin view → URL contains /admin/page/{id}
//
// Content: Rotates through WEEKLY_POSTS array, cycling by ISO week number.
// Posts: Startup-focused, visual (emoji/symbol structure), short (<280 words),
//        CTA to blockid.au

import { NextResponse } from "next/server";
import { callAI } from "@/lib/ai-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// --- Static weekly post templates (cycle by week number) ----------------

interface PostTemplate {
  theme: string;
  text: string;
}

const WEEKLY_POSTS: PostTemplate[] = [
  {
    theme: "svi_intro",
    text: `🚀 How do investors actually value your startup?

Not gut feel. Not ARR alone. 8 dimensions.

━━━━━━━━━━━━━━━━━
📊 BlockID Startup Value Index™
━━━━━━━━━━━━━━━━━

✅ Founder & Team
✅ Market & Problem
✅ Product & Tech
✅ Traction & Revenue
✅ Cap Table & Governance
✅ Investor Readiness
✅ Legal & Compliance
✅ Strategic Vision

Each dimension scored 0–100. Each gap = a fundraising risk.

Most startups score strong in 2–3 areas. The other 5 are where deals die.

Know your score → blockid.au/score

#StartupAustralia #Fundraising #StartupValuation #BlockID`,
  },
  {
    theme: "founder_team",
    text: `👥 VCs fund people, not decks.

Here's what "Founder & Team" really means to an investor:

───────────────────
THE FTY SCORECARD
───────────────────
▪ Domain expertise depth
▪ Prior exits or near-exits
▪ Cofounder balance (tech + GTM)
▪ Equity split fairness
▪ Burn rate vs. team productivity
▪ Advisor quality (credibility, not vanity)

Average FTY score on BlockID: 58/100

The #1 gap: founders with great ideas but no evidence of execution.

What's your team score? → blockid.au/score

#StartupFounders #VCFunding #FounderAdvice #BlockID #StartupAustralia`,
  },
  {
    theme: "traction",
    text: `📈 "We're pre-revenue" is not a blocker. Vanity metrics are.

What traction actually signals to investors in 2026:

❌ Avoid                    ✅ Show instead
─────────────────────────────────────────
App downloads              → DAU / D7 retention
Total signups              → Paying users + MoM growth
"Viral" social posts       → Organic referral rate
LOIs & pilots              → Signed contracts + rev
Media features             → Customer testimonials

Traction doesn't mean revenue. It means proof of demand.

BlockID scores your traction objectively — no spin.

→ blockid.au/score

#StartupTraction #EarlyStage #PreRevenue #StartupAustralia #BlockID`,
  },
  {
    theme: "cap_table",
    text: `🧾 A messy cap table kills deals. Here's what clean looks like.

────────────────────────
CAP TABLE RED FLAGS
────────────────────────
🔴 Founders < 60% at Series A
🔴 No 4-year vesting + 1-year cliff
🔴 Investor consent needed for every decision
🔴 Option pool created post-term-sheet
🔴 Missing ESOP plan → talent can't be retained

────────────────────────
GREEN FLAGS
────────────────────────
🟢 Founders retain control votes
🟢 Clean SAFE/note structure
🟢 10–15% option pool pre-raise
🟢 Pro-rata rights for lead investor only

BlockID scores your cap table & governance automatically.

→ Check yours: blockid.au/score

#CapTable #StartupEquity #ESOP #VCFunding #StartupAustralia`,
  },
  {
    theme: "market_size",
    text: `🌏 "The market is $50B" → investors stop listening.

Here's how to present market size credibly:

WRONG → RIGHT
──────────────────────────────────────
"TAM: $50B global"     → SAM (AU): $420M (2,800 SMEs paying $150/mo)
"Growing 15% CAGR"     → "3 comps raised at $8M ARR — we're at $1.2M, 2 yrs behind"
"No competitors"        → Name 3 + your unfair advantage vs. each

Your SAM should make someone say "oh, that's real."
Your wedge should make someone say "they'll win this niche."

BlockID's Market & Problem score reveals if your positioning holds up.

→ blockid.au/score

#StartupStrategy #MarketSize #GTM #StartupAustralia #BlockID`,
  },
  {
    theme: "investor_readiness",
    text: `📋 Investor Readiness Checklist — how ready are you?

Most founders think they're ready. Most aren't.

─────────────────────────────────
BEFORE YOUR FIRST VC MEETING
─────────────────────────────────
☐ Pitch deck (problem → solution → traction → ask)
☐ Financial model (3-year, bottom-up)
☐ Data room live (NDA-gated, organised)
☐ Cap table in SAFE/Share format
☐ IP assigned to company (not founders)
☐ ASIC records current
☐ Key contracts signed (not verbal)
☐ Reference customers ready to take calls

Most startups have 3–5 of 8. That's a 37–62% readiness score.

BlockID measures all 8 — and tells you which gaps kill deals.

→ blockid.au/score

#InvestorReadiness #FundraisingTips #StartupAustralia #VCFunding #BlockID`,
  },
  {
    theme: "startup_index",
    text: `📊 Introducing the BlockID Startup Index™

Every week we track a snapshot of startups on BlockID:

━━━━━━━━━━━━━━━━━━━━━━
PLATFORM SNAPSHOT
━━━━━━━━━━━━━━━━━━━━━━
📌 Avg SVI Score:      64/100
📌 Strongest sector:   FinTech + LegalTech
📌 #1 gap:             Legal & Compliance (avg 51)
📌 Fastest improving:  Product & Tech
📌 Stage mix:          72% pre-seed, 28% seed+

The startups improving fastest aren't the ones with the best ideas.

They're the ones who know exactly where they're weak.

→ Get your baseline: blockid.au/score

#StartupIndex #BlockID #StartupAustralia #FounderInsights #EarlyStage`,
  },
  {
    theme: "data_room",
    text: `🗂️ Your data room is a signal before you say a word.

Professional investors judge your room before your pitch.

────────────────────────────
DATA ROOM CHECKLIST
────────────────────────────
MUST HAVE
☑ Executive Summary (1-pager)
☑ Pitch Deck (current)
☑ Financial Model + Actuals
☑ Cap Table (current, SAFE-updated)
☑ Company Registration + Shareholder Deeds
☑ IP Assignments
☑ Key Customer Contracts
☑ Founder Bios + LinkedIn

BONUS SIGNALS
★ Product demo video (<3 min)
★ Customer testimonials
★ Board/advisor update memos
★ Technical architecture overview

BlockID auto-generates your data room structure → NDA-gated, investor-ready.

→ blockid.au

#DataRoom #FundraisingTips #StartupAustralia #VCReady #BlockID`,
  },
];

// --- AI-generated fresh post (fallback enrichment) ----------------------

async function generateFreshPost(): Promise<string | null> {
  try {
    const result = await callAI({
      system: `You are a LinkedIn content creator for BlockID.au — an AI startup valuation platform in Australia.

Write ONE LinkedIn post (200–280 words) for the BlockID company page. Requirements:
- Target audience: early-stage AU startup founders (pre-seed to Series A)
- Tone: authoritative but not corporate, practical, founder-empathetic
- Visual structure: use ✅/❌/▪/→/━ for scannable lists (NOT tables, NOT code blocks)
- End with a clear CTA → blockid.au/score
- Include 4-5 relevant hashtags at the end
- Topics: startup valuation, fundraising, cap tables, ESOP, investor readiness, SVI scores, data rooms, founder advice
- NO generic motivation quotes. Data + frameworks + real founder problems only.
Return ONLY the post text, no preamble.`,
      user: `Write a fresh LinkedIn post for BlockID Australia. Pick a specific, practical angle a founder at pre-seed or seed stage would find immediately useful today. Make the visual structure clear with symbols.`,
      maxTokens: 600,
    });
    return result.text.trim() || null;
  } catch {
    return null;
  }
}

// --- LinkedIn ugcPosts helper -------------------------------------------

async function postToLinkedInPage(text: string, orgId: string, accessToken: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = {
    author: `urn:li:organization:${orgId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `${res.status}: ${body}` };
  }

  const data = await res.json() as { id?: string };
  return { ok: true, id: data.id };
}

// --- ISO week number ----------------------------------------------------

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// --- Main handler -------------------------------------------------------

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = process.env.LINKEDIN_PAGE_ID;
  const accessToken = process.env.LINKEDIN_PAGE_ACCESS_TOKEN;

  if (!orgId || !accessToken) {
    return NextResponse.json({
      ok: false,
      error: "Missing LINKEDIN_PAGE_ID or LINKEDIN_PAGE_ACCESS_TOKEN. See route.ts header for setup instructions.",
    }, { status: 503 });
  }

  // Rotate through static templates by ISO week; try AI-generated as fresh variant on week % 4 == 0
  const weekNum = getISOWeek(new Date());
  const useAI = weekNum % 4 === 0;

  let postText: string;
  let source: string;

  if (useAI) {
    const aiPost = await generateFreshPost();
    if (aiPost) {
      postText = aiPost;
      source = "ai_generated";
    } else {
      // Fallback to static template
      const template = WEEKLY_POSTS[weekNum % WEEKLY_POSTS.length];
      postText = template.text;
      source = `static:${template.theme}:ai_fallback`;
    }
  } else {
    const template = WEEKLY_POSTS[weekNum % WEEKLY_POSTS.length];
    postText = template.text;
    source = `static:${template.theme}`;
  }

  const result = await postToLinkedInPage(postText, orgId, accessToken);

  if (!result.ok) {
    console.error("[blockid:cron:linkedin-page-post] failed:", result.error);
    return NextResponse.json({ ok: false, error: result.error, source }, { status: 502 });
  }

  console.log(`[blockid:cron:linkedin-page-post] posted week=${weekNum} source=${source} id=${result.id}`);
  return NextResponse.json({ ok: true, postId: result.id, source, week: weekNum });
}

export { POST as GET };
