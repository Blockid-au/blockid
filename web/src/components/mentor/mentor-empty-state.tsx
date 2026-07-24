// Roster empty state — teaches onboarding rather than showing an empty table.

import { GraduationCap } from "lucide-react";
import MentorOnboardingChecklist from "./mentor-onboarding-checklist";

export function MentorEmptyState() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-surface-50 p-6 dark:border-surface-700 dark:bg-surface-900">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-full bg-brand-100 p-2 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
            No mentees yet
          </h2>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            You&apos;ll see attributed founders here as soon as they sign up with
            your promotion code. Meanwhile, walk through the 4-step setup:
          </p>
        </div>
      </div>
      <MentorOnboardingChecklist />
    </section>
  );
}

export default MentorEmptyState;
