/**
 * FundingJsonLd — emits one or more schema.org objects as
 * `application/ld+json` data blocks (no nonce needed — same contract as
 * components/seo/json-ld.tsx). The objects themselves are built by the pure
 * helpers in lib/funding/directory.ts so tests can inspect them without
 * rendering. Async server component.
 */

export async function FundingJsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return null;
  return (
    <>
      {list.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }}
        />
      ))}
    </>
  );
}

export default FundingJsonLd;
