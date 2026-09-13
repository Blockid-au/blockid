// Clean-room preparation guide (S29-A) — the checklist behind
// /workspace/clean-room for an M&A or strategic due diligence where the
// buyer competes with the company.
//
// Mirrors the standard clean-team process used in real transactions
// (deal team vs clean team, anonymised first pass, per-recipient access,
// NDA + clean-team agreement, logging, certified destruction) rather than a
// stylised journey. Seven stages, sixteen tasks. A task's `done` state is:
//
//   computed  — derived from the data room's own settings and links (NDA
//               gate, watermark, per-recipient links, restricted sections,
//               engagement log) — the founder cannot tick these, the room
//               proves them;
//   founder   — ticked by the founder on `clean_room_checklists.tasks`
//               (migration 0380) with a date and an optional note;
//   either    — done when the room proves it OR the founder ticks it (link
//               revocation at the end of the process).
//
// Pure — no I/O; `lib/dataroom/clean-room-server.ts` loads the signals.

export type CleanRoomTaskSource = "computed" | "founder" | "either";

export interface CleanRoomSignals {
  /** The project has a data room at all. */
  roomExists: boolean;
  ndaRequired: boolean;
  watermarkEnabled: boolean;
  links: Array<{
    /** A named recipient (investor_email or investor_name) is on the link. */
    hasRecipient: boolean;
    /** `sections_allowed` is a non-empty list — the link does not see the whole room. */
    sectionsRestricted: boolean;
    /** view | comment | download */
    accessLevel: string;
    active: boolean;
  }>;
  /** Engagement events (opens, section views, downloads) recorded for the room. */
  engagementEvents: number;
}

export interface CleanRoomStageDef {
  id: string;
  title: string;
  /** One paragraph — why this stage exists in a real clean-team process. */
  why: string;
}

export interface CleanRoomTaskDef {
  id: string;
  stage: string;
  label: string;
  /** How to do it — practical, one or two sentences. */
  detail: string;
  source: CleanRoomTaskSource;
  /** Where the existing control lives. */
  link?: { href: string; label: string };
}

export interface StoredTaskState {
  done: boolean;
  at: string | null;
  note: string | null;
}

export type StoredCleanRoomTasks = Record<string, StoredTaskState>;

export interface CleanRoomTaskState extends CleanRoomTaskDef {
  done: boolean;
  /** When the founder ticked it (founder / either), null for computed. */
  doneAt: string | null;
  note: string | null;
  /** What the room shows for a computed task ("NDA gate on", "0 of 3 links restrict sections"). */
  evidence: string | null;
}

export interface CleanRoomStageState extends CleanRoomStageDef {
  tasks: CleanRoomTaskState[];
  done: number;
  total: number;
}

export interface CleanRoomChecklist {
  stages: CleanRoomStageState[];
  done: number;
  total: number;
  /** 0–100. */
  pct: number;
  roomExists: boolean;
}

export const CLEAN_ROOM_STAGES: readonly CleanRoomStageDef[] = [
  {
    id: "scope",
    title: "Scope the clean team",
    why: "When the buyer competes with you, the people who see your customer contracts, pricing and roadmap must be people who cannot use them in the buyer's business — outside counsel, an accounting or consulting firm, or buyer staff walled off from sales, pricing and product decisions. Naming them in writing first is what makes every later control enforceable; the deal team sees only the anonymised set.",
  },
  {
    id: "classify",
    title: "Classify documents",
    why: "A standard data room sorts documents by function — corporate, financial, commercial, people, IP. A clean room adds a sensitivity layer on top: customer contracts with names and pricing, price books and discounting, the product roadmap, employee names and pay, and source code, because a competitor gains from these even if the deal falls over. Tag them before anything is uploaded so the sections and links can mirror the tiers.",
  },
  {
    id: "redact",
    title: "Redaction rules",
    why: "The first pass of diligence rarely needs names. An anonymised customer schedule (Customer A, contract value, term, renewal date), pricing bands instead of the price book and headcount by function instead of a payroll export answer the buyer's valuation questions without handing over a target list. The unredacted versions sit only in the clean-team tier.",
  },
  {
    id: "access",
    title: "Access tiers",
    why: "Mirror the tiers with links. Every recipient gets their own named link, so what they saw and when is attributable to a person; the deal team's link excludes the clean-team sections; downloads are the exception, not the default. A shared URL forwarded inside the buyer defeats all of it.",
  },
  {
    id: "nda",
    title: "NDA and clean-team agreement",
    why: "The NDA covers everyone in the process; the clean-team agreement adds what the NDA does not — a use restriction (evaluation of this transaction only), a reporting rule (aggregated conclusions to the deal team, never the underlying documents) and a destruction obligation. Turning on the NDA gate makes acceptance a logged event on every link, and the watermark ties every page to the person who viewed it.",
  },
  {
    id: "logging",
    title: "Logging and retention",
    why: "If a dispute arises later, the engagement log is the evidence of who opened which section and when. Agree up front how long each tier may keep what it saw and how long you keep the log — the log usually outlives the deal.",
  },
  {
    id: "post-deal",
    title: "Post-deal destruction",
    why: "Whether the deal closes or not, the clean-team materials are returned or destroyed and that is certified in writing by the buyer and by each clean-team member. Revoke every link the day the process ends so nothing stays reachable, and keep the certificates with the log.",
  },
];

const DATA_ROOM = { href: "/workspace/data-room", label: "Data room" };
const TRUST = { href: "/workspace/data-room#trust", label: "NDA and watermark settings" };
const SHARE = { href: "/workspace/data-room#share", label: "Investor share links" };

export const CLEAN_ROOM_TASKS: readonly CleanRoomTaskDef[] = [
  { id: "scope-team", stage: "scope", source: "founder", label: "Clean team named in writing", detail: "List the outside advisers and any buyer staff who will see the sensitive tier, and confirm each is walled off from the buyer's pricing, sales and product decisions for the duration of the process and a period after it." },
  { id: "scope-protocol", stage: "scope", source: "founder", label: "Clean-team protocol agreed", detail: "One page: what the clean team may see, what it may report back (aggregated conclusions only — no customer names, prices or roadmap items), for how long, and who arbitrates a dispute." },
  { id: "classify-tag", stage: "classify", source: "founder", label: "Competitively sensitive documents tagged", detail: "Mark customer contracts, price books and discounting, the product roadmap, employee data and source code as clean-team only; everything else is deal-team.", link: DATA_ROOM },
  { id: "classify-sections", stage: "classify", source: "computed", label: "Data room sections mirror the tiers", detail: "At least one share link restricts which sections it can open — the clean-team sections exist as separate folders rather than mixed into the general room.", link: SHARE },
  { id: "redact-customers", stage: "redact", source: "founder", label: "Customer schedule anonymised for the deal team", detail: "Customer A, B, C with contract value, term, renewal date and concentration; names and per-customer pricing only in the clean-team tier." },
  { id: "redact-people", stage: "redact", source: "founder", label: "Employee data aggregated", detail: "Headcount by function, role bands and total employment cost for the deal team; no names, salaries, ESOP grants or performance notes outside the clean team." },
  { id: "redact-code", stage: "redact", source: "founder", label: "Source code kept out of the room", detail: "Offer a third-party code review, an SBOM / licence-risk report or an escrow attestation instead of repository access; if code must be inspected, it is on your screen in a supervised session, never uploaded.", link: { href: "/workspace/data-room#data-room-checklist", label: "Open-source licence inventory (IP section)" } },
  { id: "access-links", stage: "access", source: "computed", label: "Every recipient has their own named share link", detail: "No shared URLs — each person on the buyer side and in the clean team gets a link with their name and email so every open is attributable.", link: SHARE },
  { id: "access-restricted", stage: "access", source: "computed", label: "The deal-team tier cannot open the clean-team sections", detail: "At least one link restricts sections and is view-only; downloads are granted per person, per section, and only when the clean-team agreement is signed.", link: SHARE },
  { id: "nda-gate", stage: "nda", source: "computed", label: "NDA acceptance required before the room opens", detail: "Turn the NDA gate on so every recipient accepts the current NDA text before the first document loads; acceptances are logged with version, email and time.", link: TRUST },
  { id: "nda-clean-team", stage: "nda", source: "founder", label: "Clean-team agreement signed by each clean-team member", detail: "Use restriction, aggregated reporting, no onward disclosure, destruction on exit; countersigned by the buyer. Store the signed copies in a founder-only section." },
  { id: "nda-watermark", stage: "nda", source: "computed", label: "Dynamic watermark on every viewed document", detail: "Each page carries the recipient's name and the date so a leaked screenshot is traceable to the link that produced it.", link: TRUST },
  { id: "log-engagement", stage: "logging", source: "computed", label: "Engagement log recording opens and section views", detail: "The room logs every open, section view and download per link; keep the export with the deal file.", link: { href: "/workspace/data-room#engagement", label: "Engagement heatmap" } },
  { id: "log-retention", stage: "logging", source: "founder", label: "Retention schedule agreed", detail: "How long each tier may keep what it saw (typically nothing beyond the process for the clean team), and how long you keep the log and acceptance records — align with the NDA's survival clause." },
  { id: "post-revoke", stage: "post-deal", source: "either", label: "All share links revoked or expired at the end of the process", detail: "Revoke every link the day the process ends — closing, withdrawal or lapse — so nothing stays reachable; the room shows this when no link is still active.", link: SHARE },
  { id: "post-certificate", stage: "post-deal", source: "founder", label: "Destruction or return certificate received", detail: "A signed certificate from the buyer and from each clean-team member that materials were destroyed or returned, kept with the engagement log." },
];

export const CLEAN_ROOM_TASK_IDS: readonly string[] = CLEAN_ROOM_TASKS.map((t) => t.id);

export function isCleanRoomTaskId(v: unknown): v is string {
  return typeof v === "string" && CLEAN_ROOM_TASK_IDS.includes(v);
}

/** Tasks the founder may tick (founder / either); computed ones are refused by the API. */
export function isFounderTickable(id: string): boolean {
  const t = CLEAN_ROOM_TASKS.find((x) => x.id === id);
  return Boolean(t && t.source !== "computed");
}

/* ── Computed state ──────────────────────────────────────────────────── */

function computed(id: string, s: CleanRoomSignals): { done: boolean; evidence: string } {
  const active = s.links.filter((l) => l.active);
  switch (id) {
    case "classify-sections":
    case "access-restricted": {
      const restricted = s.links.filter((l) => l.sectionsRestricted);
      const viewOnlyRestricted = restricted.filter((l) => l.accessLevel === "view");
      if (!s.roomExists) return { done: false, evidence: "No data room yet" };
      if (id === "classify-sections") return { done: restricted.length > 0, evidence: `${restricted.length} of ${s.links.length} share links restrict sections` };
      return { done: viewOnlyRestricted.length > 0, evidence: `${viewOnlyRestricted.length} of ${s.links.length} share links are view-only with restricted sections` };
    }
    case "access-links": {
      const named = active.filter((l) => l.hasRecipient);
      if (!s.roomExists) return { done: false, evidence: "No data room yet" };
      if (active.length === 0) return { done: false, evidence: "No active share links" };
      return { done: named.length === active.length, evidence: `${named.length} of ${active.length} active links carry a named recipient` };
    }
    case "nda-gate":
      return { done: s.roomExists && s.ndaRequired, evidence: !s.roomExists ? "No data room yet" : s.ndaRequired ? "NDA gate on" : "NDA gate off" };
    case "nda-watermark":
      return { done: s.roomExists && s.watermarkEnabled, evidence: !s.roomExists ? "No data room yet" : s.watermarkEnabled ? "Watermark on" : "Watermark off" };
    case "log-engagement":
      return { done: s.engagementEvents > 0, evidence: !s.roomExists ? "No data room yet" : `${s.engagementEvents.toLocaleString("en-AU")} engagement event${s.engagementEvents === 1 ? "" : "s"} logged` };
    case "post-revoke":
      if (!s.roomExists || s.links.length === 0) return { done: false, evidence: "No share links to revoke yet" };
      return { done: active.length === 0, evidence: active.length === 0 ? "No share link is still active" : `${active.length} of ${s.links.length} links still active` };
    default:
      return { done: false, evidence: "" };
  }
}

/** Coerce the stored jsonb into typed task states — unknown ids and malformed rows are dropped. */
export function normaliseStoredTasks(raw: unknown): StoredCleanRoomTasks {
  const out: StoredCleanRoomTasks = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCleanRoomTaskId(id) || !v || typeof v !== "object") continue;
    const r = v as { done?: unknown; at?: unknown; note?: unknown };
    out[id] = { done: r.done === true, at: typeof r.at === "string" ? r.at : null, note: typeof r.note === "string" ? r.note.slice(0, 500) : null };
  }
  return out;
}

export function buildCleanRoomChecklist(signals: CleanRoomSignals, stored: StoredCleanRoomTasks): CleanRoomChecklist {
  const stages: CleanRoomStageState[] = CLEAN_ROOM_STAGES.map((stage) => {
    const tasks: CleanRoomTaskState[] = CLEAN_ROOM_TASKS.filter((t) => t.stage === stage.id).map((t) => {
      const s = stored[t.id];
      if (t.source === "founder") return { ...t, done: Boolean(s?.done), doneAt: s?.done ? (s.at ?? null) : null, note: s?.note ?? null, evidence: null };
      const c = computed(t.id, signals);
      if (t.source === "computed") return { ...t, done: c.done, doneAt: null, note: null, evidence: c.evidence };
      const founderDone = Boolean(s?.done);
      return { ...t, done: c.done || founderDone, doneAt: founderDone ? (s?.at ?? null) : null, note: s?.note ?? null, evidence: c.evidence };
    });
    return { ...stage, tasks, done: tasks.filter((x) => x.done).length, total: tasks.length };
  });
  const total = stages.reduce((n, s) => n + s.total, 0);
  const done = stages.reduce((n, s) => n + s.done, 0);
  return { stages, done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0, roomExists: signals.roomExists };
}

/* ── PATCH body ──────────────────────────────────────────────────────── */

export type CleanRoomPatch = { ok: true; taskId: string; done: boolean; note: string | null } | { ok: false; error: string; status: 400 | 409 };

export function parseCleanRoomPatch(body: unknown): CleanRoomPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body must be an object", status: 400 };
  const b = body as { taskId?: unknown; done?: unknown; note?: unknown };
  if (!isCleanRoomTaskId(b.taskId)) return { ok: false, error: "unknown taskId", status: 400 };
  if (typeof b.done !== "boolean") return { ok: false, error: "done must be true or false", status: 400 };
  if (!isFounderTickable(b.taskId)) return { ok: false, error: "computed_task", status: 409 };
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") return { ok: false, error: "note must be a string", status: 400 };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : null;
  return { ok: true, taskId: b.taskId, done: b.done, note: note && note.length > 0 ? note : null };
}

export const CLEAN_ROOM_NOTE =
  "A practical checklist for a strategic sale, not legal advice: the clean-team protocol, NDA and clean-team agreement are drafted by the company's lawyers for the specific buyer. The computed rows show what the data room can prove; the rest is your record of what has been done.";
