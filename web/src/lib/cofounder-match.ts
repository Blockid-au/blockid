// Cofounder Match — shared zod schema, constants, and types.
//
// This module is imported from BOTH client and server (the form needs the
// option lists; the API route needs the schema). Keep it dependency-light:
// no supabase, no `server-only`, no Node built-ins. Server-only helpers
// (Supabase reads/writes) live in `cofounder-match.server.ts`.

import { z } from "zod";

// -----------------------------------------------------------------------------
// Enumerated option lists. Kept here so client + server agree.
// -----------------------------------------------------------------------------

export const LOCATIONS = [
  "Sydney",
  "Parramatta",
  "Melbourne",
  "Brisbane",
  "Other AU",
  "International",
] as const;

export const ROLE_TAGS = [
  "Technical cofounder",
  "Commercial cofounder",
  "Designer",
  "Domain expert",
] as const;

export const TIME_COMMITMENTS = [
  "FT-now",
  "FT-3mo",
  "PT-now",
  "Exploring",
] as const;

export const STAGES = [
  "Idea",
  "Validating",
  "Prototype",
  "MVP",
  "Paying users",
] as const;

export const VISIBILITIES = ["directory", "private"] as const;

export type Location = (typeof LOCATIONS)[number];
export type RoleTag = (typeof ROLE_TAGS)[number];
export type TimeCommitment = (typeof TIME_COMMITMENTS)[number];
export type Stage = (typeof STAGES)[number];
export type Visibility = (typeof VISIBILITIES)[number];

// -----------------------------------------------------------------------------
// Zod schema — used both client-side (helpful errors) and server-side (truth).
// -----------------------------------------------------------------------------

export const cofounderProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name")
    .max(120, "Name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email"),
  location: z.enum(LOCATIONS),
  lookingFor: z
    .array(z.enum(ROLE_TAGS))
    .min(1, "Pick at least one role you're looking for")
    .max(ROLE_TAGS.length),
  iAm: z
    .array(z.enum(ROLE_TAGS))
    .min(1, "Pick at least one role you bring")
    .max(ROLE_TAGS.length),
  skills: z
    .string()
    .trim()
    .max(280, "Keep skills under 280 characters")
    .optional()
    .or(z.literal("")),
  ideaPitch: z
    .string()
    .trim()
    .max(500, "Keep your pitch under 500 characters")
    .optional()
    .or(z.literal("")),
  timeCommitment: z.enum(TIME_COMMITMENTS),
  stage: z.enum(STAGES),
  linkedinUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .max(300)
    .optional()
    .or(z.literal("")),
  visibility: z.enum(VISIBILITIES).default("directory"),
});

export type CofounderProfileInput = z.infer<typeof cofounderProfileSchema>;

// -----------------------------------------------------------------------------
// Anonymized directory row — what the public profile list renders. Defined
// here (rather than the server module) because it's a plain shape that the
// directory component's child markup happens to be fine to ship in either
// runtime.
// -----------------------------------------------------------------------------

export interface DirectoryProfile {
  id: string;
  displayName: string; // "Sam D."
  location: string;
  lookingFor: string[];
  iAm: string[];
  timeCommitment: string;
  stage: string;
  createdAt: string;
}

// Helper used by the server module to anonymize a stored full_name to a
// "first name + last initial" form. Kept here so the rule lives next to the
// type so future tweaks stay co-located.
export function anonymizeName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Anonymous";
  const parts = trimmed.split(/\s+/);
  const first = parts[0] ?? "";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}
