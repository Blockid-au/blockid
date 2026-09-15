// Which model wrote which section (S32-C).
//
// Every agent section already records the dispatcher provider + model that
// served it. `buildReportMeta` folds those into `full_report_json.meta` so
// the PDF's "Prepared with" line, the status page's
// `ai_last_report_provider` and any audit can say truthfully which models
// wrote a founder's report — never a marketing name for a model that was
// not used. Pure: no I/O, no Next runtime, safe for the PDF renderer.

import { FIRST_ANALYSIS_AGENTS, type AgentSection, type FirstAnalysisAgent } from "./types";

export interface ReportSectionMeta {
  provider: string;
  model: string;
  taskClass: "report" | "synthesis";
}

export interface ReportMeta {
  /** Per-voice provider + model, in writing order, for the sections that exist. */
  sections: Partial<Record<FirstAnalysisAgent, ReportSectionMeta>>;
  /** Distinct "model via provider" labels, most-used first. */
  models: string[];
  /** The one-line "Prepared with …" statement for the PDF. */
  preparedWith: string;
}

/** Human label for a dispatcher provider id. */
export function providerLabel(provider: string): string {
  switch (provider) {
    case "claude-apikey": return "Anthropic API";
    case "claude-oauth": return "Claude";
    case "claude-haiku-direct": return "Anthropic API";
    case "claude-proxy": return "Claude";
    case "claude": return "Claude";
    case "deepinfra": return "DeepInfra";
    case "gemini": return "Google Gemini";
    case "groq": return "Groq";
    case "cerebras": return "Cerebras";
    case "sambanova": return "SambaNova";
    case "openrouter": return "OpenRouter";
    case "ollama": return "local model";
    default: return provider || "unknown provider";
  }
}

/** Short model name for a report line: strips the vendor path prefix. */
export function modelLabel(model: string): string {
  const base = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return base.replace(/:free$/, "");
}

export function sectionLabel(section: Pick<AgentSection, "provider" | "model">): string | null {
  if (!section.model && !section.provider) return null;
  const m = section.model ? modelLabel(section.model) : "unknown model";
  return section.provider ? `${m} via ${providerLabel(section.provider)}` : m;
}

export function buildReportMeta(agents: Partial<Record<FirstAnalysisAgent, AgentSection>>): ReportMeta {
  const sections: ReportMeta["sections"] = {};
  const counts = new Map<string, number>();
  for (const role of FIRST_ANALYSIS_AGENTS) {
    const s = agents[role];
    if (!s) continue;
    sections[role] = {
      provider: s.provider ?? "",
      model: s.model ?? "",
      taskClass: role === "ceo" ? "synthesis" : "report",
    };
    const label = sectionLabel(s);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const models = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const preparedWith = models.length === 0
    ? "Prepared with BlockID's C-level AI agents."
    : `Prepared with ${models.join(" · ")}.`;
  return { sections, models, preparedWith };
}
