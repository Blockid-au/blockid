/**
 * FundingJsonLd — emits one or more schema.org objects as
 * `application/ld+json` with the per-request CSP nonce (same contract as
 * components/seo/json-ld.tsx). The objects themselves are built by the pure
 * helpers in lib/funding/directory.ts so tests can inspect them without
 * rendering. Async server component.
 */

import { headers } from "next/headers";

async function readNonce(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function FundingJsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return null;
  const nonce = await readNonce();
  return (
    <>
      {list.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }}
        />
      ))}
    </>
  );
}

export default FundingJsonLd;
