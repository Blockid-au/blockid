"use client";

import * as React from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { profileCompletionPct, type FounderProfile } from "@/lib/founder-profile";

interface Props {
  initialProfile: FounderProfile;
}

function StringArray({ label, hint, values, onChange, max = 10 }: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = React.useState("");
  return (
    <div>
      <label className="text-xs font-semibold text-foreground block mb-1">{label}</label>
      <p className="text-[11px] text-muted-foreground mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs px-2 py-1 rounded-full border border-blue-200 dark:border-blue-800/40">
            {v}
            <button
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="hover:text-red-600"
              type="button"
              aria-label="remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onChange([...values, draft.trim()]);
                setDraft("");
                e.preventDefault();
              }
            }}
            placeholder="Type and press Enter…"
            className="flex-1 text-xs border border-border rounded-md px-2.5 py-1.5 bg-background"
          />
          <button
            type="button"
            onClick={() => {
              if (draft.trim()) {
                onChange([...values, draft.trim()]);
                setDraft("");
              }
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function PeopleArray({ label, hint, values, onChange, allowFrom = false }: {
  label: string;
  hint: string;
  values: Array<{ name: string; role: string; linkedin?: string; from?: string }>;
  onChange: (next: typeof values) => void;
  allowFrom?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-foreground block mb-1">{label}</label>
      <p className="text-[11px] text-muted-foreground mb-2">{hint}</p>
      <div className="space-y-2">
        {values.map((p, i) => (
          <div key={i} className="rounded-lg border border-border p-2 grid grid-cols-12 gap-2">
            <input
              className="col-span-3 text-xs border border-border rounded px-2 py-1 bg-background"
              placeholder="Name"
              value={p.name}
              onChange={(e) => {
                const next = [...values];
                next[i] = { ...p, name: e.target.value };
                onChange(next);
              }}
            />
            <input
              className="col-span-3 text-xs border border-border rounded px-2 py-1 bg-background"
              placeholder="Role"
              value={p.role}
              onChange={(e) => {
                const next = [...values];
                next[i] = { ...p, role: e.target.value };
                onChange(next);
              }}
            />
            <input
              className={cn("text-xs border border-border rounded px-2 py-1 bg-background", allowFrom ? "col-span-3" : "col-span-5")}
              placeholder="LinkedIn URL"
              value={p.linkedin ?? ""}
              onChange={(e) => {
                const next = [...values];
                next[i] = { ...p, linkedin: e.target.value };
                onChange(next);
              }}
            />
            {allowFrom && (
              <input
                className="col-span-2 text-xs border border-border rounded px-2 py-1 bg-background"
                placeholder="ex-Stripe"
                value={p.from ?? ""}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = { ...p, from: e.target.value };
                  onChange(next);
                }}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="col-span-1 text-red-500 hover:text-red-700 flex items-center justify-center"
              aria-label="remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, { name: "", role: "", linkedin: "" }])}
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-blue-500" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function FounderProfileClient({ initialProfile }: Props) {
  const [p, setP] = React.useState<FounderProfile>(initialProfile);
  const [saving, setSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saved" | "error">("idle");

  const completion = profileCompletionPct(p);

  async function save() {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/founder-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setSaveStatus(data.ok ? "saved" : "error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserIcon className="h-6 w-6 text-blue-600" />
          Founder Profile
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">Beta</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl leading-relaxed">
          The first thing every investor reads is the founder section. Fill this in once, and BlockID will weave it into your SVI analysis (lifting the Antler Team signal automatically) and surface it on your public share page.
        </p>
      </div>

      {/* Completion + save */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completion</span>
            <span className="text-sm font-bold">{completion}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                completion >= 80 ? "bg-emerald-500" : completion >= 50 ? "bg-blue-500" : "bg-amber-500",
              )}
              style={{ width: `${completion}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {completion >= 80 ? "Strong founder section. Antler Team signal will lift on next SVI analysis."
              : completion >= 50 ? "Good start. Add ship history + advisors to unlock the Team-signal boost."
              : "Fill in at least 5 fields to start boosting your Team signal."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        {saveStatus === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {saveStatus === "error" && (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Save failed
          </span>
        )}
      </div>

      {/* Sections */}
      <Section title="Basics">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold block mb-1">Full name</label>
            <input
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              value={p.full_name ?? ""}
              onChange={(e) => setP({ ...p, full_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Role / title</label>
            <input
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              value={p.role ?? ""}
              onChange={(e) => setP({ ...p, role: e.target.value })}
              placeholder="CEO & Co-founder"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold block mb-1">LinkedIn URL</label>
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-blue-500" />
              <input
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background"
                value={p.linkedin_url ?? ""}
                onChange={(e) => setP({ ...p, linkedin_url: e.target.value })}
                placeholder="https://www.linkedin.com/in/…"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold block mb-1">Bio (1-3 paragraphs)</label>
            <textarea
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background min-h-[100px]"
              value={p.bio ?? ""}
              onChange={(e) => setP({ ...p, bio: e.target.value })}
              placeholder="Who you are, what you're building, why now."
            />
          </div>
        </div>
      </Section>

      <Section title="Track record — what investors look for first">
        <StringArray
          label="Previous employers"
          hint="Drop in companies you worked at. Ex-Stripe / ex-Atlassian / ex-Canva etc. are signal magnets."
          values={p.prev_employers}
          onChange={(v) => setP({ ...p, prev_employers: v })}
        />
        <StringArray
          label="Ship history"
          hint="Products you've previously built, launched, acquired. One per line."
          values={p.ship_history}
          onChange={(v) => setP({ ...p, ship_history: v })}
        />
        <div>
          <label className="text-xs font-semibold block mb-1">Years in domain</label>
          <input
            type="number"
            min={0} max={60}
            className="w-32 text-sm border border-border rounded-lg px-3 py-2 bg-background"
            value={p.years_in_domain ?? ""}
            onChange={(e) => setP({ ...p, years_in_domain: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="0"
          />
        </div>
      </Section>

      <Section title="Insider insight + ambition">
        <div>
          <label className="text-xs font-semibold block mb-1">Domain insight</label>
          <p className="text-[11px] text-muted-foreground mb-1">Why you understand this problem better than anyone else.</p>
          <textarea
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background min-h-[80px]"
            value={p.domain_insight ?? ""}
            onChange={(e) => setP({ ...p, domain_insight: e.target.value })}
            placeholder="I spent 8 years inside the bank's fraud team and saw…"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">Ambition / what success looks like</label>
          <textarea
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background min-h-[80px]"
            value={p.ambition ?? ""}
            onChange={(e) => setP({ ...p, ambition: e.target.value })}
            placeholder="Become the category-defining valuation platform for every AU startup."
          />
        </div>
      </Section>

      <Section title="Team">
        <PeopleArray
          label="Co-founders"
          hint="Each co-founder + role + LinkedIn."
          values={p.co_founders}
          onChange={(v) => setP({ ...p, co_founders: v })}
        />
        <PeopleArray
          label="Advisors"
          hint="Brand-name advisors are 'attracts exceptional talent' signal."
          values={p.advisors}
          onChange={(v) => setP({ ...p, advisors: v })}
        />
        <PeopleArray
          label="Notable hires"
          hint="Early team members with pedigree. 'From' column captures ex-Stripe etc."
          values={p.notable_hires}
          onChange={(v) => setP({ ...p, notable_hires: v })}
          allowFrom
        />
      </Section>

      <Section title="Visibility">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.public_visible}
            onChange={(e) => setP({ ...p, public_visible: e.target.checked })}
            className="rounded"
          />
          Show founder section on public /s/[slug] share page (recommended)
        </label>
      </Section>

      {/* Final save */}
      <div className="flex items-center justify-end gap-3">
        {saveStatus === "saved" && <span className="text-xs text-emerald-600">Saved.</span>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
          Save profile
        </button>
      </div>
    </div>
  );
}
