// S20-B — data access for webhook_endpoints / webhook_deliveries
// (migration 0336). Everything the registry (enqueue), the dispatcher and
// the management routes need is behind `WebhookStore` so the dispatcher's
// retry ladder / lease / auto-disable logic is unit-tested against an
// in-memory store (dispatch.test.ts) while `supabaseWebhookStore()` is the
// production implementation over the admin client.
//
// No `server-only`: colocated tests import it directly. Never import from a
// client component.

import { getSupabaseAdmin } from "@/lib/supabase";
import { listActiveStartupPackageUserIds } from "@/lib/funding/growth-extras";

export type DeliveryStatus = "queued" | "delivered" | "failed" | "dead";

export interface EndpointRow {
  id: string;
  user_id: string;
  project_id: string | null;
  url: string;
  description: string | null;
  secret_hash: string;
  secret_enc: string;
  events: string[];
  active: boolean;
  failure_count: number;
  disabled_reason: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRow {
  id: string;
  endpoint_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: DeliveryStatus;
  attempts: number;
  next_attempt_at: string;
  locked_until: string | null;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export type NewDelivery = Pick<DeliveryRow, "id" | "endpoint_id" | "event" | "payload"> &
  Partial<Pick<DeliveryRow, "status" | "next_attempt_at" | "attempts" | "locked_until">>;

export type EndpointPatch = Partial<
  Pick<
    EndpointRow,
    "url" | "description" | "events" | "active" | "failure_count" | "disabled_reason" | "last_success_at" | "last_failure_at"
  >
>;

export type DeliveryPatch = Partial<
  Pick<DeliveryRow, "status" | "attempts" | "next_attempt_at" | "locked_until" | "response_status" | "last_error" | "delivered_at">
>;

export interface NewEndpoint {
  user_id: string;
  project_id: string | null;
  url: string;
  description: string | null;
  secret_hash: string;
  secret_enc: string;
  events: string[];
}

export interface UserPlanRow {
  id: string;
  plan: string | null;
  role: string | null;
}

export interface WebhookStore {
  /** Active endpoints subscribed to `event` for this project OR user-level endpoints of `userIds`. */
  listActiveEndpointsFor(event: string, projectId: string | null, userIds: readonly string[]): Promise<EndpointRow[]>;
  insertDeliveries(rows: NewDelivery[]): Promise<number>;
  /** Deliveries due at `now` (queued|failed, next_attempt_at ≤ now, lease free), oldest first. */
  listDue(now: Date, limit: number): Promise<DeliveryRow[]>;
  /** Conditional lease: true when this call took the lease. */
  claim(deliveryId: string, now: Date, leaseMs: number): Promise<boolean>;
  getEndpoints(ids: readonly string[]): Promise<EndpointRow[]>;
  getEndpoint(id: string): Promise<EndpointRow | null>;
  listEndpoints(filter: { userId?: string; projectId?: string }): Promise<EndpointRow[]>;
  insertEndpoint(row: NewEndpoint): Promise<EndpointRow | null>;
  updateEndpoint(id: string, patch: EndpointPatch): Promise<void>;
  deleteEndpoint(id: string): Promise<void>;
  updateDelivery(id: string, patch: DeliveryPatch): Promise<void>;
  listDeliveries(endpointId: string, limit: number): Promise<DeliveryRow[]>;
  /** Plan + role for the plan re-check at dispatch time. */
  userPlans(userIds: readonly string[]): Promise<UserPlanRow[]>;
  /** Users among `userIds` holding an active Startup Package. */
  activePackageUserIds(userIds: readonly string[]): Promise<Set<string>>;
  /** Project owner ids — the default recipients of a project's user-level endpoints. */
  projectOwnerIds(projectIds: readonly string[]): Promise<Map<string, string>>;
}

const ENDPOINT_COLUMNS =
  "id, user_id, project_id, url, description, secret_hash, secret_enc, events, active, failure_count, disabled_reason, last_success_at, last_failure_at, created_at, updated_at";
const DELIVERY_COLUMNS =
  "id, endpoint_id, event, payload, status, attempts, next_attempt_at, locked_until, response_status, last_error, created_at, delivered_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any };

function uniq(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

/** Production store over the Supabase admin client. `null` when Supabase is not configured. */
export function supabaseWebhookStore(db: Db | null = getSupabaseAdmin()): WebhookStore | null {
  if (!db) return null;
  const sb = db;
  return {
    async listActiveEndpointsFor(event, projectId, userIds) {
      const out = new Map<string, EndpointRow>();
      if (projectId) {
        const { data } = await sb
          .from("webhook_endpoints")
          .select(ENDPOINT_COLUMNS)
          .eq("active", true)
          .eq("project_id", projectId)
          .contains("events", [event]);
        for (const r of (data ?? []) as EndpointRow[]) out.set(r.id, r);
      }
      const users = uniq(userIds);
      if (users.length) {
        const { data } = await sb
          .from("webhook_endpoints")
          .select(ENDPOINT_COLUMNS)
          .eq("active", true)
          .is("project_id", null)
          .in("user_id", users)
          .contains("events", [event]);
        for (const r of (data ?? []) as EndpointRow[]) out.set(r.id, r);
      }
      return [...out.values()];
    },
    async insertDeliveries(rows) {
      if (!rows.length) return 0;
      const { error } = await sb.from("webhook_deliveries").insert(rows);
      if (error) throw new Error(error.message ?? "insert failed");
      return rows.length;
    },
    async listDue(now, limit) {
      const iso = now.toISOString();
      const { data, error } = await sb
        .from("webhook_deliveries")
        .select(DELIVERY_COLUMNS)
        .in("status", ["queued", "failed"])
        .lte("next_attempt_at", iso)
        .or(`locked_until.is.null,locked_until.lt.${iso}`)
        .order("next_attempt_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message ?? "listDue failed");
      return (data ?? []) as DeliveryRow[];
    },
    async claim(deliveryId, now, leaseMs) {
      const iso = now.toISOString();
      const until = new Date(now.getTime() + leaseMs).toISOString();
      const { data, error } = await sb
        .from("webhook_deliveries")
        .update({ locked_until: until })
        .eq("id", deliveryId)
        .in("status", ["queued", "failed"])
        .or(`locked_until.is.null,locked_until.lt.${iso}`)
        .select("id");
      if (error) return false;
      return Array.isArray(data) ? data.length > 0 : Boolean(data);
    },
    async getEndpoints(ids) {
      const list = uniq(ids);
      if (!list.length) return [];
      const { data } = await sb.from("webhook_endpoints").select(ENDPOINT_COLUMNS).in("id", list);
      return (data ?? []) as EndpointRow[];
    },
    async getEndpoint(id) {
      const { data } = await sb.from("webhook_endpoints").select(ENDPOINT_COLUMNS).eq("id", id).maybeSingle();
      return (data as EndpointRow | null) ?? null;
    },
    async listEndpoints(filter) {
      let q = sb.from("webhook_endpoints").select(ENDPOINT_COLUMNS);
      if (filter.projectId) q = q.eq("project_id", filter.projectId);
      else if (filter.userId) q = q.eq("user_id", filter.userId);
      else return [];
      const { data } = await q.order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as EndpointRow[];
    },
    async insertEndpoint(row) {
      const { data, error } = await sb.from("webhook_endpoints").insert(row).select(ENDPOINT_COLUMNS).single();
      if (error) throw new Error(error.message ?? "insert failed");
      return (data as EndpointRow | null) ?? null;
    },
    async updateEndpoint(id, patch) {
      const { error } = await sb.from("webhook_endpoints").update(patch).eq("id", id);
      if (error) throw new Error(error.message ?? "update failed");
    },
    async deleteEndpoint(id) {
      const { error } = await sb.from("webhook_endpoints").delete().eq("id", id);
      if (error) throw new Error(error.message ?? "delete failed");
    },
    async updateDelivery(id, patch) {
      const { error } = await sb.from("webhook_deliveries").update(patch).eq("id", id);
      if (error) throw new Error(error.message ?? "update failed");
    },
    async listDeliveries(endpointId, limit) {
      const { data } = await sb
        .from("webhook_deliveries")
        .select(DELIVERY_COLUMNS)
        .eq("endpoint_id", endpointId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as DeliveryRow[];
    },
    async userPlans(userIds) {
      const list = uniq(userIds);
      if (!list.length) return [];
      const { data } = await sb.from("app_users").select("id, plan, role").in("id", list);
      return (data ?? []) as UserPlanRow[];
    },
    async activePackageUserIds(userIds) {
      const list = uniq(userIds);
      if (!list.length) return new Set();
      return listActiveStartupPackageUserIds(sb, { userIds: list });
    },
    async projectOwnerIds(projectIds) {
      const list = uniq(projectIds);
      const out = new Map<string, string>();
      if (!list.length) return out;
      const { data } = await sb.from("projects").select("id, user_id").in("id", list);
      for (const r of (data ?? []) as Array<{ id: string; user_id: string }>) if (r.user_id) out.set(r.id, r.user_id);
      return out;
    },
  };
}

// ── In-memory store (tests + dry runs) ──────────────────────────────────────

export interface MemoryStore extends WebhookStore {
  endpoints: EndpointRow[];
  deliveries: DeliveryRow[];
  plans: UserPlanRow[];
  packageUsers: Set<string>;
  owners: Map<string, string>;
}

let seq = 0;
export function memoryWebhookStore(seed: Partial<Pick<MemoryStore, "endpoints" | "deliveries" | "plans" | "packageUsers" | "owners">> = {}): MemoryStore {
  const endpoints = seed.endpoints ?? [];
  const deliveries = seed.deliveries ?? [];
  const plans = seed.plans ?? [];
  const packageUsers = seed.packageUsers ?? new Set<string>();
  const owners = seed.owners ?? new Map<string, string>();
  return {
    endpoints,
    deliveries,
    plans,
    packageUsers,
    owners,
    async listActiveEndpointsFor(event, projectId, userIds) {
      const users = new Set(userIds);
      return endpoints.filter(
        (e) =>
          e.active &&
          e.events.includes(event) &&
          ((projectId && e.project_id === projectId) || (e.project_id === null && users.has(e.user_id))),
      );
    },
    async insertDeliveries(rows) {
      for (const r of rows) {
        deliveries.push({
          status: "queued",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          locked_until: null,
          response_status: null,
          last_error: null,
          created_at: new Date().toISOString(),
          delivered_at: null,
          ...r,
        });
      }
      return rows.length;
    },
    async listDue(now, limit) {
      const t = now.getTime();
      return deliveries
        .filter(
          (d) =>
            (d.status === "queued" || d.status === "failed") &&
            Date.parse(d.next_attempt_at) <= t &&
            (!d.locked_until || Date.parse(d.locked_until) < t),
        )
        .sort((a, b) => Date.parse(a.next_attempt_at) - Date.parse(b.next_attempt_at))
        .slice(0, limit);
    },
    async claim(id, now, leaseMs) {
      const d = deliveries.find((x) => x.id === id);
      if (!d || (d.status !== "queued" && d.status !== "failed")) return false;
      if (d.locked_until && Date.parse(d.locked_until) >= now.getTime()) return false;
      d.locked_until = new Date(now.getTime() + leaseMs).toISOString();
      return true;
    },
    async getEndpoints(ids) {
      const set = new Set(ids);
      return endpoints.filter((e) => set.has(e.id));
    },
    async getEndpoint(id) {
      return endpoints.find((e) => e.id === id) ?? null;
    },
    async listEndpoints(filter) {
      if (filter.projectId) return endpoints.filter((e) => e.project_id === filter.projectId);
      if (filter.userId) return endpoints.filter((e) => e.user_id === filter.userId);
      return [];
    },
    async insertEndpoint(row) {
      const now = new Date().toISOString();
      const e: EndpointRow = {
        id: `ep-${++seq}`,
        active: true,
        failure_count: 0,
        disabled_reason: null,
        last_success_at: null,
        last_failure_at: null,
        created_at: now,
        updated_at: now,
        ...row,
      };
      endpoints.push(e);
      return e;
    },
    async updateEndpoint(id, patch) {
      const e = endpoints.find((x) => x.id === id);
      if (e) Object.assign(e, patch, { updated_at: new Date().toISOString() });
    },
    async deleteEndpoint(id) {
      const i = endpoints.findIndex((x) => x.id === id);
      if (i >= 0) endpoints.splice(i, 1);
    },
    async updateDelivery(id, patch) {
      const d = deliveries.find((x) => x.id === id);
      if (d) Object.assign(d, patch);
    },
    async listDeliveries(endpointId, limit) {
      return deliveries
        .filter((d) => d.endpoint_id === endpointId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, limit);
    },
    async userPlans(userIds) {
      const set = new Set(userIds);
      return plans.filter((p) => set.has(p.id));
    },
    async activePackageUserIds(userIds) {
      return new Set(userIds.filter((u) => packageUsers.has(u)));
    },
    async projectOwnerIds(projectIds) {
      const out = new Map<string, string>();
      for (const p of projectIds) {
        const o = owners.get(p);
        if (o) out.set(p, o);
      }
      return out;
    },
  };
}
