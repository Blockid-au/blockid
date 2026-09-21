/**
 * Loader for /docs/api/institutional (G22-C): reads the repo document
 * `docs/api/institutional.md` at BUILD time and renders it with
 * `renderMarkdownLite`. The page is fully static (no `revalidate`, no
 * request APIs), so the file is read once by `next build` from the source
 * checkout — the live server (which runs from `releases/<BUILD_ID>`, without
 * the repo's `docs/` tree) only ever serves the prerendered HTML. Should the
 * read ever fail, `loadInstitutionalDoc()` returns `null` and the page
 * renders a short notice with the GitHub link instead of a 500.
 *
 * Pure apart from the file read; the colocated test pins that the document
 * resolves from `web/` (the build's cwd) and renders its headings.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderMarkdownLite, type RenderedMarkdown } from "@/lib/markdown/lite";

/** Repo-relative path of the source document (shown on the page + the GitHub link). */
export const INSTITUTIONAL_DOC_REPO_PATH = "docs/api/institutional.md";
export const INSTITUTIONAL_DOC_GITHUB_URL = `https://github.com/Blockid-au/blockid/blob/master/${INSTITUTIONAL_DOC_REPO_PATH}`;

/** Candidate absolute paths, first hit wins: `web/` cwd (build), repo root, `web/` under root. */
export function institutionalDocCandidates(cwd: string = process.cwd()): string[] {
  return [
    path.join(cwd, "..", INSTITUTIONAL_DOC_REPO_PATH),
    path.join(cwd, INSTITUTIONAL_DOC_REPO_PATH),
    path.join(cwd, "..", "..", INSTITUTIONAL_DOC_REPO_PATH),
  ];
}

export function readInstitutionalDocSource(cwd?: string): string | null {
  for (const p of institutionalDocCandidates(cwd)) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function loadInstitutionalDoc(cwd?: string): RenderedMarkdown | null {
  const src = readInstitutionalDocSource(cwd);
  return src === null ? null : renderMarkdownLite(src);
}
