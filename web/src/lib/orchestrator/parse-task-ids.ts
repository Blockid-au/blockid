// Parse `git log --pretty=format:%h%x1f%B%x1e` output into a mapping of
// task ids (T0XXX / T0XXXX) to the earliest commit sha that mentions them.
// Extracted from stageUpdateArtifacts so the ID-matching contract (T0216 fix)
// is testable in isolation without shelling out to git.

export interface ParsedTaskCommits {
  idToCommit: Map<string, string>;
  lastCommit: string;
}

const COMMIT_SEP = "\x1e";
const FIELD_SEP = "\x1f";
const SHA_RE = /^[0-9a-f]{7,40}$/;
const TASK_ID_RE = /\bT0\d{3,4}\b/g;
const RELEASE_SUBJECT_RE = /^chore\(release\):/m;

export function parseCompletedTaskIds(gitLogOutput: string): ParsedTaskCommits {
  const idToCommit = new Map<string, string>();
  let lastCommit = "";

  for (const entry of gitLogOutput.split(COMMIT_SEP)) {
    const sep = entry.indexOf(FIELD_SEP);
    if (sep < 0) continue;
    const sha = entry.slice(0, sep).trim();
    const body = entry.slice(sep + 1);
    if (!SHA_RE.test(sha)) continue;
    if (!lastCommit) lastCommit = sha;
    // Skip the orchestrator's own release commits — they list every task ID
    // already shipped, which would mask future false-positives if anyone
    // manually reopens a task.
    if (RELEASE_SUBJECT_RE.test(body)) continue;
    const idMatches = body.match(TASK_ID_RE);
    if (!idMatches) continue;
    for (const id of idMatches) {
      if (!idToCommit.has(id)) idToCommit.set(id, sha);
    }
  }

  return { idToCommit, lastCommit };
}
