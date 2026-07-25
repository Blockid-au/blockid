import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonMetric,
  SkeletonText,
} from "@/components/ui/skeleton";
import { Heading } from "@/components/ui/heading";
import { Container, Section } from "@/components/ui/section";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Design System — BlockID Golden Snapshot",
  description:
    "Every design-system primitive rendered in every variant, in both light and dark skins. Internal QA reference.",
  robots: { index: false, follow: false },
};

const DS_COLORS = [
  "--ds-surface", "--ds-surface-elevated", "--ds-surface-sunken",
  "--ds-border", "--ds-border-strong", "--ds-ink", "--ds-ink-muted",
  "--ds-ink-subtle", "--ds-accent", "--ds-accent-hover", "--ds-success",
  "--ds-warn", "--ds-danger", "--ds-info", "--ds-focus-ring",
];
const RADII = ["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl", "--radius-pill"];
const SHADOWS = ["--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl", "--shadow-glow-accent"];
const TYPE_RAMP = [
  ["display-2xl", "--text-display-2xl"], ["display-xl", "--text-display-xl"],
  ["h1", "--text-h1"], ["h2", "--text-h2"], ["h3", "--text-h3"], ["h4", "--text-h4"],
] as const;
const BUTTON_VARIANTS = [
  "primary", "default", "secondary", "ghost", "outline", "subtle",
  "link", "success", "danger", "destructive",
] as const;
const BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const BADGE_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;
const BADGE_SHAPES = ["solid", "subtle", "outline"] as const;
const CARD_VARIANTS = ["default", "elevated", "subtle"] as const;

function H({ children }: { children: React.ReactNode }) {
  return <Heading level="h4" tone="muted">{children}</Heading>;
}
function Mono({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] text-[var(--ds-ink-subtle)]">{children}</p>;
}

function Palette({ title }: { title: string }) {
  return (
    <div className="space-y-8">
      <Heading level="h3">{title}</Heading>

      <section className="space-y-3"><H>Semantic colors</H>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DS_COLORS.map((t) => (
            <div key={t} className="rounded-[var(--radius-md)] border border-[var(--ds-border)] p-3 bg-[var(--ds-surface-elevated)]">
              <div className="h-12 w-full rounded-[var(--radius-sm)] border border-[var(--ds-border)]" style={{ background: `var(${t})` }} aria-hidden />
              <p className="mt-2 font-mono text-[10px] text-[var(--ds-ink)] break-all">{t}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3"><H>Type ramp</H>
        {TYPE_RAMP.map(([level, token]) => (
          <div key={token} className="flex flex-wrap items-baseline gap-4 border-b border-[var(--ds-border)] pb-2">
            <span className="font-mono text-[10px] text-[var(--ds-ink-subtle)] w-36 shrink-0">{token}</span>
            <Heading level={level} balance={false}>The quick brown fox</Heading>
          </div>
        ))}
        <p className="text-[length:var(--text-body-lg)] leading-[var(--text-body-lg--line-height)] text-[var(--ds-ink)]">body-lg — Lead paragraphs.</p>
        <p className="text-[length:var(--text-body)] leading-[var(--text-body--line-height)] text-[var(--ds-ink-muted)]">body — Default paragraph copy.</p>
        <p className="text-[length:var(--text-body-sm)] leading-[var(--text-body-sm--line-height)] text-[var(--ds-ink-muted)]">body-sm — Form help, table cells.</p>
        <p className="text-[length:var(--text-caption)] text-[var(--ds-ink-subtle)]">caption — Micro-copy.</p>
        <p className="text-[length:var(--text-eyebrow)] tracking-[var(--text-eyebrow--letter-spacing)] uppercase text-[var(--ds-ink-subtle)]">eyebrow</p>
      </section>

      <section className="space-y-3"><H>Radius scale</H>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {RADII.map((r) => (
            <div key={r} className="space-y-1">
              <div className="h-16 w-full bg-[var(--ds-accent)]" style={{ borderRadius: `var(${r})` }} aria-hidden />
              <p className="font-mono text-[10px] text-[var(--ds-ink-subtle)] break-all">{r}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3"><H>Shadow scale</H>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {SHADOWS.map((s) => (
            <div key={s} className="space-y-2">
              <div className="h-20 w-full rounded-[var(--radius-md)] bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]" style={{ boxShadow: `var(${s})` }} aria-hidden />
              <p className="font-mono text-[10px] text-[var(--ds-ink-subtle)] break-all">{s}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4"><H>Button matrix</H>
        {BUTTON_VARIANTS.map((variant) => (
          <div key={variant} className="space-y-2">
            <Mono>variant = {variant}</Mono>
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>{size}</Button>
              ))}
              <Button variant={variant} disabled>disabled</Button>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Mono>icon sizes</Mono>
          <Button variant="secondary" size="icon" aria-label="add"><span aria-hidden>+</span></Button>
          <Button variant="secondary" size="icon-sm" aria-label="add"><span aria-hidden>+</span></Button>
        </div>
      </section>

      <section className="space-y-3"><H>Card variants</H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARD_VARIANTS.map((v) => (
            <Card key={v} variant={v}>
              <CardHeader>
                <CardTitle>variant = {v}</CardTitle>
                <CardDescription>Snapshot composition string.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-[length:var(--text-body-sm)] text-[var(--ds-ink-muted)]">Body copy.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3"><H>Badge grid</H>
        {BADGE_SHAPES.map((shape) => (
          <div key={shape} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--ds-ink-subtle)] w-20 shrink-0">{shape}</span>
            {BADGE_TONES.map((tone) => (
              <Badge key={tone} variant={shape} tone={tone}>{tone}</Badge>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--ds-ink-subtle)] w-20 shrink-0">legacy</span>
          {(["default", "brand", "teal", "amber", "success", "danger", "outline"] as const).map((v) => (
            <Badge key={v} variant={v}>{v}</Badge>
          ))}
        </div>
      </section>

      <section className="space-y-3"><H>Inputs</H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-in`}>Field label</Label>
            <Input id={`${title}-in`} placeholder="Type something" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${title}-in-d`}>Disabled</Label>
            <Input id={`${title}-in-d`} placeholder="Read-only" disabled />
          </div>
        </div>
      </section>

      <section className="space-y-3"><H>Skeletons</H>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2"><Mono>SkeletonText</Mono><SkeletonText lines={4} /></div>
          <div className="space-y-2"><Mono>SkeletonMetric</Mono><SkeletonMetric /></div>
          <div className="space-y-2"><Mono>SkeletonAvatar</Mono>
            <div className="flex items-center gap-3">
              <SkeletonAvatar size="sm" />
              <SkeletonAvatar size="md" />
              <SkeletonAvatar size="lg" />
            </div>
          </div>
          <div className="space-y-2"><Mono>Skeleton (base)</Mono><Skeleton className="h-4 w-64" /></div>
          <div className="space-y-2 md:col-span-2"><Mono>SkeletonCard</Mono><SkeletonCard /></div>
        </div>
      </section>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-[var(--ds-surface)] text-[var(--ds-ink)]">
      <Section spacing="sm">
        <Container size="lg">
          <Heading level="display-xl">Design system snapshot</Heading>
          <p className="mt-4 text-[length:var(--text-body-lg)] leading-[var(--text-body-lg--line-height)] text-[var(--ds-ink-muted)] max-w-2xl">
            Every primitive rendered in every variant across the light and{" "}
            <code>.dark</code> skins. Golden-snapshot QA target — noindex,
            not linked from navigation.
          </p>
        </Container>
      </Section>
      <Section spacing="md">
        <Container size="xl" className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="rounded-[var(--radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6">
            <Palette title="Light" />
          </div>
          <div className="dark rounded-[var(--radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6">
            <Palette title="Dark" />
          </div>
        </Container>
      </Section>
    </main>
  );
}
