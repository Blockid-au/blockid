/** Closes only browser transport. This is not server-side job cancellation. */
export function streamTransportCleanup(ref: { current: AbortController | null }): () => void {
  return () => { ref.current?.abort(); };
}
