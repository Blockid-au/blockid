// G34 DC01 / AF13 (25/09/2026) — which project an /analyze run belongs to.
//
// Conservative on purpose: a signed-in founder's run is linked to their
// ACTIVE project only when the company the run is about carries the same
// name as that project. A founder analysing a different startup (a
// competitor, a portfolio company) is never attributed to their own project
// and no project is ever created or renamed here (never overwrite a profile).

import "server-only";

import { getProjectScope } from "@/lib/projects";

const LEGAL_SUFFIX = /\b(pty|ltd|limited|inc|incorporated|llc|corp|corporation|co|company|holdings|group)\b/g;
const PLACEHOLDERS = new Set(["", "unknown", "your startup", "startup", "untitled", "company", "my startup", "idea"]);

/** Lower-case, strip legal suffixes and punctuation. Pure — exported for the test. */
export function normaliseCompanyName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same company? Exact match after normalisation, and never on a placeholder. Pure — exported for the test. */
export function isSameCompany(runCompany: string | null | undefined, projectName: string | null | undefined): boolean {
  const a = normaliseCompanyName(runCompany);
  const b = normaliseCompanyName(projectName);
  if (a.length < 3 || b.length < 3 || PLACEHOLDERS.has(a) || PLACEHOLDERS.has(b)) return false;
  return a === b;
}

/** The active project id when the run is about it and the caller may write to it; else null. Never throws. */
export async function projectForAnalysis(runCompany: string | null | undefined): Promise<string | null> {
  try {
    const scope = await getProjectScope();
    if (!scope || (scope.role !== "owner" && scope.role !== "admin" && scope.role !== "editor")) return null;
    return isSameCompany(runCompany, scope.project.name) ? scope.projectId : null;
  } catch {
    return null;
  }
}
