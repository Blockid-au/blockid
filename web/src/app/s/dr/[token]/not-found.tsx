import Link from "next/link";

export default function DataRoomNotFound() {
  return (
    <main id="main" className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-xl flex-col items-start px-4 py-24 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          This data room link is not available
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          The link may have been revoked by the founder, expired, or been typed
          incorrectly. Ask the founder for a fresh link.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-action px-4 py-2 text-sm font-medium text-on-action"
        >
          Go to BlockID
        </Link>
      </div>
    </main>
  );
}
