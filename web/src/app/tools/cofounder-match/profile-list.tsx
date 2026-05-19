import { MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchRecentDirectoryProfiles } from "@/lib/cofounder-match.server";

// Server component. Renders up to 12 anonymized cards from the directory.
// Strict PII rules: no email, no LinkedIn, no full pitch — only first name +
// last initial, city, role tags, time commitment and stage.

export async function ProfileList() {
  const profiles = await fetchRecentDirectoryProfiles(12);

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50/60 p-10 text-center">
        <Sparkles
          strokeWidth={1.75}
          className="mx-auto h-8 w-8 text-brand-600"
          aria-hidden
        />
        <h3 className="mt-4 text-lg font-semibold text-ink-800">
          Be the first to post
        </h3>
        <p className="mt-2 text-sm text-ink-400">
          We&apos;re seeding the directory.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {profiles.map((p) => (
        <li
          key={p.id}
          className="rounded-2xl border border-surface-200 bg-white p-5 transition-colors hover:border-brand-500/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink-800">
                {p.displayName}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-8000">
                <MapPin
                  strokeWidth={1.75}
                  className="h-3.5 w-3.5"
                  aria-hidden
                />
                {p.location}
              </p>
            </div>
            <Badge variant="brand">{p.stage}</Badge>
          </div>

          <Section title="I am">
            {p.iAm.length === 0 ? (
              <span className="text-xs text-ink-8000">—</span>
            ) : (
              p.iAm.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))
            )}
          </Section>

          <Section title="Looking for">
            {p.lookingFor.length === 0 ? (
              <span className="text-xs text-ink-8000">—</span>
            ) : (
              p.lookingFor.map((t) => (
                <Badge key={t} variant="default">
                  {t}
                </Badge>
              ))
            )}
          </Section>

          <p className="mt-4 text-xs text-ink-8000">
            <span className="uppercase tracking-wider">Availability:</span>{" "}
            <span className="font-mono tabular-nums text-ink-500">
              {p.timeCommitment}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-8000">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
