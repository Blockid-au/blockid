"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LOCATIONS,
  ROLE_TAGS,
  STAGES,
  TIME_COMMITMENTS,
  type Location,
  type RoleTag,
  type Stage,
  type TimeCommitment,
  type Visibility,
} from "@/lib/cofounder-match";

interface FormState {
  fullName: string;
  email: string;
  location: Location;
  lookingFor: RoleTag[];
  iAm: RoleTag[];
  skills: string;
  hasIdea: boolean;
  ideaPitch: string;
  timeCommitment: TimeCommitment;
  stage: Stage;
  linkedinUrl: string;
  visibility: Visibility;
}

const TIME_LABELS: Record<TimeCommitment, string> = {
  "FT-now": "Full-time now",
  "FT-3mo": "Full-time in ≤3 months",
  "PT-now": "Part-time now",
  Exploring: "Just exploring",
};

const INITIAL: FormState = {
  fullName: "",
  email: "",
  location: "Sydney",
  lookingFor: [],
  iAm: [],
  skills: "",
  hasIdea: false,
  ideaPitch: "",
  timeCommitment: "Exploring",
  stage: "Idea",
  linkedinUrl: "",
  visibility: "directory",
};

type Status = "idle" | "submitting" | "ok" | "err";

export function CofounderMatchForm() {
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleTag = (key: "lookingFor" | "iAm", tag: RoleTag) => {
    setForm((p) => {
      const has = p[key].includes(tag);
      return {
        ...p,
        [key]: has ? p[key].filter((t) => t !== tag) : [...p[key], tag],
      };
    });
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "submitting") return;
    setErrorMsg(null);

    // Local validation mirroring the server schema (basic).
    if (form.fullName.trim().length < 2) {
      setErrorMsg("Please enter your full name.");
      return;
    }
    if (!form.email.includes("@")) {
      setErrorMsg("Enter a valid email.");
      return;
    }
    if (form.lookingFor.length === 0) {
      setErrorMsg("Pick at least one role you're looking for.");
      return;
    }
    if (form.iAm.length === 0) {
      setErrorMsg("Pick at least one role you bring.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/cofounder-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          location: form.location,
          lookingFor: form.lookingFor,
          iAm: form.iAm,
          skills: form.skills,
          ideaPitch: form.hasIdea ? form.ideaPitch : "",
          timeCommitment: form.timeCommitment,
          stage: form.stage,
          linkedinUrl: form.linkedinUrl,
          visibility: form.visibility,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatus("err");
        setErrorMsg(json.error || "Could not submit. Try again.");
        return;
      }
      setStatus("ok");
    } catch {
      setStatus("err");
      setErrorMsg("Network error. Try again.");
    }
  };

  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-brand-500/30 bg-white p-8 text-center">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto h-10 w-10 text-brand-600"
        />
        <h2 className="mt-4 text-2xl font-semibold text-ink-800">
          You&apos;re on the list
        </h2>
        <p className="mt-2 max-w-md mx-auto text-sm text-ink-400">
          We&apos;ve sent a confirmation to{" "}
          <span className="font-mono text-ink-600">{form.email}</span>. Your
          anonymized card is now in the directory below.
        </p>
        <div className="mt-6">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => {
              setForm(INITIAL);
              setStatus("idle");
            }}
          >
            Submit another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
    >
      <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
        <Users strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        Your profile
      </h2>

      <div className="mt-6 grid sm:grid-cols-2 gap-5">
        <Field label="Full name" htmlFor="full_name" required>
          <Input
            id="full_name"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            placeholder="Sam Donaldson"
          />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="sam@yourstartup.com.au"
          />
        </Field>
        <Field label="Location" htmlFor="location" required>
          <select
            id="location"
            value={form.location}
            onChange={(e) => update("location", e.target.value as Location)}
            className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-4 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </Field>
        <Field label="LinkedIn URL (optional)" htmlFor="linkedin">
          <Input
            id="linkedin"
            type="url"
            inputMode="url"
            value={form.linkedinUrl}
            onChange={(e) => update("linkedinUrl", e.target.value)}
            placeholder="https://www.linkedin.com/in/…"
          />
        </Field>
      </div>

      <div className="mt-6 grid gap-5">
        <ChipsField
          label="I'm looking for"
          options={ROLE_TAGS}
          selected={form.lookingFor}
          onToggle={(t) => toggleTag("lookingFor", t)}
          required
        />
        <ChipsField
          label="I am"
          options={ROLE_TAGS}
          selected={form.iAm}
          onToggle={(t) => toggleTag("iAm", t)}
          required
        />
      </div>

      <div className="mt-6 grid gap-5">
        <Field label="Skills (max 280 characters)" htmlFor="skills">
          <textarea
            id="skills"
            value={form.skills}
            onChange={(e) =>
              update("skills", e.target.value.slice(0, 280))
            }
            rows={2}
            placeholder="Backend / Postgres / payments. Built and sold one B2B SaaS."
            className="w-full rounded-[10px] border border-surface-200 bg-white px-4 py-3 text-ink-800 placeholder:text-ink-8000 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <p className="mt-1 text-xs text-ink-8000 font-mono tabular-nums">
            {form.skills.length}/280
          </p>
        </Field>

        <div className="rounded-xl border border-surface-200 bg-white p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.hasIdea}
              onChange={(e) => update("hasIdea", e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            <span className="text-sm font-medium text-ink-600">
              I have an idea
            </span>
          </label>
          {form.hasIdea && (
            <div className="mt-4">
              <Label htmlFor="pitch">Idea pitch (max 500 characters)</Label>
              <textarea
                id="pitch"
                value={form.ideaPitch}
                onChange={(e) =>
                  update("ideaPitch", e.target.value.slice(0, 500))
                }
                rows={3}
                placeholder="One sentence on the problem, one on who it's for, one on why now."
                className="mt-2 w-full rounded-[10px] border border-surface-200 bg-white px-4 py-3 text-ink-800 placeholder:text-ink-8000 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <p className="mt-1 text-xs text-ink-8000 font-mono tabular-nums">
                {form.ideaPitch.length}/500
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-5">
        <Field label="Time commitment" htmlFor="time" required>
          <select
            id="time"
            value={form.timeCommitment}
            onChange={(e) =>
              update("timeCommitment", e.target.value as TimeCommitment)
            }
            className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-4 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {TIME_COMMITMENTS.map((tc) => (
              <option key={tc} value={tc}>
                {TIME_LABELS[tc]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage" htmlFor="stage" required>
          <select
            id="stage"
            value={form.stage}
            onChange={(e) => update("stage", e.target.value as Stage)}
            className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-4 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="mt-6 rounded-xl border border-surface-200 bg-white p-4">
        <legend className="px-1 text-sm font-medium text-ink-600">
          Visibility
        </legend>
        <div className="mt-2 grid gap-2">
          <VisibilityRadio
            value="directory"
            current={form.visibility}
            onChange={(v) => update("visibility", v)}
            title="Show in directory (anonymized)"
            sub="First name + last initial, city and role tags only. No email, no LinkedIn."
          />
          <VisibilityRadio
            value="private"
            current={form.visibility}
            onChange={(v) => update("visibility", v)}
            title="Private match only"
            sub="We hold your profile for direct match — nothing public."
          />
        </div>
      </fieldset>

      {errorMsg && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-6 text-sm text-amber-300"
        >
          {errorMsg}
        </p>
      )}

      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-ink-8000">
          By submitting you agree to be listed (anonymized) and to receive
          match notifications. We never share your email publicly.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={status === "submitting"}
          className="sm:min-w-[180px]"
        >
          {status === "submitting" ? "Submitting…" : "Add me to the directory"}
          <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-brand-600">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ChipsField({
  label,
  options,
  selected,
  onToggle,
  required,
}: {
  label: string;
  options: readonly RoleTag[];
  selected: RoleTag[];
  onToggle: (tag: RoleTag) => void;
  required?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-600">
        {label}
        {required && <span className="ml-1 text-brand-600">*</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              type="button"
              key={opt}
              aria-pressed={on}
              onClick={() => onToggle(opt)}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60",
                on
                  ? "border-brand-500/50 bg-brand-500/15 text-brand-500"
                  : "border-surface-200 bg-surface-100 text-ink-500 hover:border-brand-500/30 hover:text-ink-800",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VisibilityRadio({
  value,
  current,
  onChange,
  title,
  sub,
}: {
  value: Visibility;
  current: Visibility;
  onChange: (v: Visibility) => void;
  title: string;
  sub: string;
}) {
  const on = current === value;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        on
          ? "border-brand-500/40 bg-brand-500/5"
          : "border-surface-200 hover:border-brand-500/30",
      )}
    >
      <input
        type="radio"
        name="visibility"
        value={value}
        checked={on}
        onChange={() => onChange(value)}
        className="mt-1 h-4 w-4 accent-brand-500"
      />
      <span>
        <span className="block text-sm font-medium text-ink-700">
          {title}
        </span>
        <span className="block text-xs text-ink-8000">{sub}</span>
      </span>
    </label>
  );
}
