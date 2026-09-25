/** Effective contract used by the current stream endpoint (no paid-tier selection). */
export const STREAM_REQUEST_SCOPE = { tier: "free", locale: "en" } as const;
export interface StreamStorageScope {
  userId?: string;
  projectId?: string;
  deckText?: string;
  /** AF12: the upload this run belongs to (pitchdeck id). A NEW upload of the
   * same deck must never restore the previous run it was charged for. */
  runId?: string;
  tier: string;
  locale: string;
}
type Digest = (bytes: Uint8Array) => Promise<ArrayBuffer>;

/** Full received input, no trim/truncation. No source text appears in the key.
 * Failure disables result persistence only; the caller retains its intake props.
 */
export async function streamStorageIdentity(scope: StreamStorageScope, digest: Digest = bytes => globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource)): Promise<string | null> {
  if (!scope.userId?.trim() || !scope.projectId?.trim()) return null;
  try {
    const base = ["stream-final-v1", scope.userId, scope.projectId, scope.tier, scope.locale,
      scope.deckText === undefined ? "stored-project" : "received-deck", scope.deckText ?? null];
    // Keys without a run id are unchanged (existing restores keep working).
    const input = JSON.stringify(scope.runId?.trim() ? [...base, "run", scope.runId.trim()] : base);
    const hash = await digest(new TextEncoder().encode(input));
    return `svi-stream:v2:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")}`;
  } catch { return null; }
}

/** Only this exact new identity is read; legacy project keys are left untouched. */
export function readStreamState<T extends { savedAt: number }>(storage: Pick<Storage, "getItem">, key: string | null, now: number, maxAgeMs: number): T | null {
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    if (!value || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > maxAgeMs) return null;
    return value;
  } catch { return null; }
}

/** Cancel stale hashing when the intake changes or the component unmounts. */
export function resolveStreamStorageIdentity(scope: StreamStorageScope, onResolved: (key: string | null) => void,
  resolve: (scope: StreamStorageScope) => Promise<string | null> = streamStorageIdentity): () => void {
  let cancelled = false;
  void resolve(scope).then(key => { if (!cancelled) onResolved(key); }, () => { if (!cancelled) onResolved(null); });
  return () => { cancelled = true; };
}

/** One bounded auth+hash resolution per intake. Timeout disables persistence
 * for this mounted intake; a late auth response cannot remount an active run. */
export function resolveAuthenticatedStreamIdentity(scope: Omit<StreamStorageScope, "userId">,
  onResolved: (key: string | null) => void,
  options: { fetcher?: typeof fetch; timeoutMs?: number; identity?: typeof streamStorageIdentity } = {}): () => void {
  const controller = new AbortController();
  let settled = false;
  const finish = (key: string | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    onResolved(key);
  };
  const timer = setTimeout(() => { controller.abort(); finish(null); }, options.timeoutMs ?? 3000);
  void (async () => {
    try {
      const response = await (options.fetcher ?? fetch)("/api/auth/me", { credentials: "same-origin", signal: controller.signal });
      if (settled) return;
      if (!response.ok) { finish(null); return; }
      const body = await response.json() as { ok?: boolean; user?: { id?: unknown } };
      if (settled) return;
      if (!body.ok || typeof body.user?.id !== "string" || !body.user.id.trim()) { finish(null); return; }
      const key = await (options.identity ?? streamStorageIdentity)({ ...scope, userId: body.user.id });
      finish(key);
    } catch { finish(null); }
  })();
  return () => { settled = true; clearTimeout(timer); controller.abort(); };
}
