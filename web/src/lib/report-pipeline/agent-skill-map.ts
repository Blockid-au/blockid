// Agent → Skill map — data-only mirror of `.claude/skills/AGENT-SKILL-MAP.md`,
// keyed by the intake phase bucket so `selectSkillsForAgent` can inject a
// phase-appropriate prompt addon into the agent system prompt.
//
// No runtime side-effects. Consumed by `agent-prompts.ts:buildAgentPrompt`
// through the new `skillAddon` argument.

import type { AgentRole } from "./types";
import type { PhaseBucket } from "./agent-selector";

export interface SkillDescriptor {
  skills: string[];
  promptAddon: string;
}

type PhaseMap = Record<PhaseBucket, SkillDescriptor>;

const NEUTRAL: SkillDescriptor = { skills: [], promptAddon: "" };

function bandFor(_agent: AgentRole, base: PhaseMap): PhaseMap {
  // Fill in any missing bucket with the neutral descriptor so callers can
  // trust every (agent, bucket) pair returns a value. The agent id is kept
  // in the signature so future overrides can specialise per role.
  return {
    idea: base.idea ?? NEUTRAL,
    mvp: base.mvp ?? NEUTRAL,
    revenue: base.revenue ?? NEUTRAL,
    scale: base.scale ?? NEUTRAL,
  };
}

// ── Per-agent skill map ────────────────────────────────────────────────────

export const SKILL_MAP: Record<AgentRole, Record<PhaseBucket, SkillDescriptor>> = {
  ceo: bandFor("ceo", {
    idea: {
      skills: ["cpo-advisor", "cmo-advisor"],
      promptAddon:
        "Idea stage — focus on vision clarity, problem framing, and whether the founder can articulate a testable hypothesis. Do NOT recommend fundraising until MVP.",
    },
    mvp: {
      skills: ["cpo-advisor", "cro-advisor"],
      promptAddon:
        "MVP stage — focus on activation, first customer proof, and product-market-fit signals.",
    },
    revenue: {
      skills: ["cfo-advisor", "cro-advisor", "investor-relations"],
      promptAddon:
        "Revenue stage — call out unit economics, retention, and the fundraise path with concrete AU comps.",
    },
    scale: {
      skills: ["cfo-advisor", "clo-advisor", "senior-pm"],
      promptAddon:
        "Scale stage — investor memo tone, governance, exit-path optionality, board readiness.",
    },
  }),

  cto: bandFor("cto", {
    idea: NEUTRAL,
    mvp: {
      skills: ["nextjs-developer", "typescript-pro", "api-designer"],
      promptAddon:
        "MVP — evaluate whether the tech choice supports fast iteration; avoid demanding enterprise-grade tests yet.",
    },
    revenue: {
      skills: ["architecture-designer", "database-optimizer", "devops-engineer"],
      promptAddon:
        "Revenue — assess uptime, SLO fitness, and whether the codebase can absorb 10x load.",
    },
    scale: {
      skills: ["cloud-architect", "microservices-architect", "monitoring-expert"],
      promptAddon:
        "Scale — multi-region, cost efficiency, observability, incident response maturity.",
    },
  }),

  cpo: bandFor("cpo", {
    idea: {
      skills: ["cpo-advisor", "ui-ux-pro-max"],
      promptAddon:
        "Idea — lead an idea-clarification pass: problem, target user, 3 tests to run in 30 days.",
    },
    mvp: {
      skills: ["cpo-advisor", "cro-advisor"],
      promptAddon:
        "MVP — activation funnel, aha-moment placement, onboarding friction.",
    },
    revenue: {
      skills: ["cpo-advisor", "conversion-optimizer"],
      promptAddon:
        "Revenue — retention loops, feature adoption, roadmap tied to revenue.",
    },
    scale: {
      skills: ["cpo-advisor", "senior-pm"],
      promptAddon:
        "Scale — platform bets, category expansion, PLG vs enterprise motion.",
    },
  }),

  cmo: bandFor("cmo", {
    idea: {
      skills: ["cmo-advisor", "seo-content-au"],
      promptAddon:
        "Idea — validate positioning with 5 keyword hypotheses and 3 competitor snapshots; skip campaign planning.",
    },
    mvp: {
      skills: ["cmo-advisor", "seo-content-au", "conversion-optimizer"],
      promptAddon:
        "MVP — landing page conversion, first content pillar, waitlist growth.",
    },
    revenue: {
      skills: ["cmo-advisor", "seo-content-au", "conversion-optimizer"],
      promptAddon:
        "Revenue — CAC by channel, content-market fit, paid vs organic mix.",
    },
    scale: {
      skills: ["cmo-advisor", "senior-pm"],
      promptAddon:
        "Scale — brand strategy, category creation, international expansion.",
    },
  }),

  cfo: bandFor("cfo", {
    // Idea stage intentionally skips CFO valuation deep-dive.
    idea: NEUTRAL,
    mvp: {
      skills: ["cfo-advisor"],
      promptAddon:
        "MVP — burn discipline, runway math, first pricing test. Do NOT publish a valuation multiple.",
    },
    revenue: {
      skills: ["cfo-advisor", "fundraising-au", "stripe-saas-billing"],
      promptAddon:
        "Revenue — full valuation deep-dive: DCF sanity, ARR/MRR multiples, cohort economics, AU tax incentives.",
    },
    scale: {
      skills: ["cfo-advisor", "fundraising-au", "cap-table-esop"],
      promptAddon:
        "Scale — waterfall, 409A comparable, secondaries, exit-multiple reality check.",
    },
  }),

  cro: bandFor("cro", {
    idea: NEUTRAL,
    mvp: {
      skills: ["cro-advisor", "conversion-optimizer"],
      promptAddon:
        "MVP — first activation, aha-moment, early retention curve.",
    },
    revenue: {
      skills: ["cro-advisor", "conversion-optimizer"],
      promptAddon:
        "Revenue — funnel A/B tests, dunning, expansion revenue.",
    },
    scale: {
      skills: ["cro-advisor", "senior-pm"],
      promptAddon:
        "Scale — sales-led vs PLG, enterprise ACV expansion, NRR.",
    },
  }),

  clo: bandFor("clo", {
    idea: NEUTRAL,
    mvp: {
      skills: ["clo-advisor", "au-compliance"],
      promptAddon:
        "MVP — ABN, ASIC, founder agreement, ToS/privacy baseline.",
    },
    revenue: {
      skills: ["clo-advisor", "cap-table-esop", "au-compliance"],
      promptAddon:
        "Revenue — SHA, ESIC, R&D Tax Incentive, customer contracts.",
    },
    scale: {
      skills: ["clo-advisor", "cap-table-esop", "au-compliance"],
      promptAddon:
        "Scale — board constitution, IP portfolio, regulator posture, cross-border compliance.",
    },
  }),

  chro: bandFor("chro", {
    idea: {
      skills: ["chro-advisor"],
      promptAddon:
        "Idea — founder skills gap, co-founder search, advisor pipeline.",
    },
    mvp: {
      skills: ["chro-advisor", "cap-table-esop"],
      promptAddon:
        "MVP — first hires, ESOP pool sizing, vesting.",
    },
    revenue: {
      skills: ["chro-advisor", "cap-table-esop"],
      promptAddon:
        "Revenue — org design, role clarity, hiring plan tied to milestones.",
    },
    scale: {
      skills: ["chro-advisor", "senior-pm"],
      promptAddon:
        "Scale — leveling, comp benchmarking, leadership benches, culture at 100+.",
    },
  }),

  ciso: bandFor("ciso", {
    idea: NEUTRAL,
    mvp: NEUTRAL,
    revenue: {
      skills: ["ciso-advisor", "security-review"],
      promptAddon:
        "Revenue — Essential Eight baseline, secret handling, incident response tabletop.",
    },
    scale: {
      skills: ["ciso-advisor", "security-audit", "secure-code-guardian"],
      promptAddon:
        "Scale — SOC2/ISO27001 gap analysis, pentest cadence, DR posture.",
    },
  }),

  cdo: bandFor("cdo", {
    idea: NEUTRAL,
    mvp: NEUTRAL,
    revenue: {
      skills: ["cdo-advisor"],
      promptAddon:
        "Revenue — event schema, PII classification, data quality gates.",
    },
    scale: {
      skills: ["cdo-advisor", "cdo"],
      promptAddon:
        "Scale — data moat assessment, AI governance, cohort percentile modelling.",
    },
  }),

  coo: bandFor("coo", {
    idea: NEUTRAL,
    mvp: {
      skills: ["coo-advisor"],
      promptAddon:
        "MVP — weekly cadence, sprint definition-of-done.",
    },
    revenue: {
      skills: ["coo-advisor", "senior-pm"],
      promptAddon:
        "Revenue — release management, KPI dashboards, cross-team coordination.",
    },
    scale: {
      skills: ["coo-advisor", "senior-pm"],
      promptAddon:
        "Scale — operating rhythm at 100+, portfolio health, program management.",
    },
  }),
};

export function selectSkillsForAgent(
  agent: AgentRole,
  phase: PhaseBucket,
): SkillDescriptor {
  return SKILL_MAP[agent]?.[phase] ?? NEUTRAL;
}
