export type RequestStatus = "pending" | "approved" | "performing" | "complete";

export interface EventItem {
  id: string;
  name: string;
  datetime: string; // ISO-like
  location: string;
  isPublic: boolean;
  requestsOpen: boolean;
}

export interface RequestItem {
  id: string;
  eventId: string;
  singer: string;
  songTitle: string;
  artist: string;
  status: RequestStatus;
  createdAt: number;
  deviceId: string;
  ip?: string;
  order?: number; // for manual ordering
  startedAt?: number;
  completedAt?: number;
  /** singer marked this as a duet / group number */
  isDuo?: boolean;
  /** optional name(s) of the singing partner(s) */
  partner?: string;
}

export interface ArchiveItem {
  id: string; // request id
  eventId: string;
  eventName: string;
  singer: string;
  songTitle: string;
  artist: string;
  submittedAt: number;
  startedAt: number | null;
  completedAt: number;
  queueWaitMs: number | null;
}

const EVENTS_KEY = "karaoke_events";
const REQUESTS_KEY = "karaoke_requests";
const DEVICE_ID_KEY = "karaoke_deviceId";
const HOST_AUTH_KEY = "karaoke_hostAuthed";
const HOST_EVENT_KEY = "karaoke_hostEvent";
const CLIENT_IP_KEY = "karaoke_clientIp";
const MIN_SONG_MINUTES = 3;
const MAX_SONG_MINUTES = 4;
const SINGER_ORDER_KEY = "karaoke_singerOrder"; // map of eventId -> string[] keys
const SINGER_NAMES_KEY = "karaoke_singerNames"; // map of eventId -> Record<key, name>
const SINGER_ORDER_SYNC_TIME_KEY = "karaoke_singerOrderSyncTime"; // map of eventId -> timestamp (ms)
const ARCHIVE_KEY = "karaoke_archive"; // array of ArchiveItem
const SETTINGS_KEY = "karaoke_settings"; // global settings
const TERMS_KEY = "karaoke_terms"; // map of eventId -> terms text
const DEFAULT_TERMS_KEY = "karaoke_defaultTerms"; // global default terms
const USERS_KEY = "karaoke_users"; // host users
const HOST_USER_KEY = "karaoke_hostUser"; // current authed username

type RawEventItem = Partial<EventItem> & Record<string, unknown>;

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeEvent(raw: RawEventItem): EventItem {
  const source = raw as Record<string, unknown>;
  const getString = (key: keyof EventItem | string): string => {
    const direct = raw[key as keyof EventItem];
    if (typeof direct === "string" && direct) return direct;
    const value = source[key];
    return typeof value === "string" ? value : "";
  };
  return {
    id: getString("id"),
    name: getString("name"),
    datetime: getString("datetime"),
    location: getString("location"),
    isPublic: parseBoolean(
      raw.isPublic,
      parseBoolean(source["is_public"], false),
    ),
    requestsOpen: parseBoolean(
      raw.requestsOpen,
      parseBoolean(source["requests_open"], true),
    ),
  };
}

type SingerNameMap = Record<string, string>;

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function sanitizeSingerNameMap(value: unknown): SingerNameMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const map: SingerNameMap = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") {
      map[key] = val;
    }
  }
  return map;
}

function getSingerOrderSyncTimes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SINGER_ORDER_SYNC_TIME_KEY) || "{}");
  } catch {
    return {};
  }
}

function setSingerOrderSyncTime(eventId: string, timeMs: number) {
  const times = getSingerOrderSyncTimes();
  times[eventId] = timeMs;
  localStorage.setItem(SINGER_ORDER_SYNC_TIME_KEY, JSON.stringify(times));
}

function getTimeSinceLastSync(eventId: string): number {
  const times = getSingerOrderSyncTimes();
  const lastSync = times[eventId];
  if (!lastSync) return Infinity;
  return Date.now() - lastSync;
}

function applyRemoteRoster(
  eventId: string,
  orderData: unknown,
  namesData: unknown,
) {
  // Don't overwrite singer order if we just synced it within the last 2 seconds
  // This prevents real-time subscriptions from reverting local drag-drop changes
  const timeSinceSync = getTimeSinceLastSync(eventId);
  const SYNC_GRACE_PERIOD = 2000; // 2 seconds

  if (isStringArray(orderData)) {
    if (timeSinceSync > SYNC_GRACE_PERIOD) {
      console.log(
        `[karaoke] Applying remote singer order (last sync was ${timeSinceSync}ms ago)`
      );
      setSingerOrderLocal(eventId, orderData);
    } else {
      console.log(
        `[karaoke] Skipping singer order update - recently synced (${timeSinceSync}ms ago, within grace period)`
      );
    }
  } else if (orderData === null) {
    setSingerOrderLocal(eventId, []);
  }
  if (namesData !== undefined) {
    const names = sanitizeSingerNameMap(namesData);
    setSingerNamesMapLocal(eventId, names);
  }
}

const rosterSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function syncEventRosterToRemote(eventId: string): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  const order = getSingerOrder(eventId);
  const names = getSingerDisplayNameMap(eventId);
  try {
    await supa
      .from("events")
      .update({
        singer_order: order,
        singer_display_names: names,
      })
      .eq("id", eventId);
  } catch {}
}

function scheduleRosterSync(eventId: string) {
  if (!getSupabase()) return;
  const existing = rosterSyncTimers.get(eventId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    rosterSyncTimers.delete(eventId);
    persistSingerOrderToRemote(eventId).catch(() => {});
  }, 200);
  rosterSyncTimers.set(eventId, timer);
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      crypto && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

import { getSupabase } from "@/lib/supabaseClient";

export async function bootstrapEvents(): Promise<EventItem[]> {
  const supa = getSupabase();
  if (supa) {
    const { data, error } = await supa
      .from("events")
      .select(
        "id,name,datetime,location,is_public,requests_open,singer_order,singer_display_names",
      )
      .order("datetime", { ascending: true });
    if (!error && data) {
      for (const row of data as any[]) {
        applyRemoteRoster(row.id, row.singer_order, row.singer_display_names);
      }
      const mapped: EventItem[] = (data as any[]).map((e) => normalizeEvent(e));
      setEvents(mapped);
      return mapped;
    }
  }
  const saved = localStorage.getItem(EVENTS_KEY);
  if (saved) {
    const parsed = JSON.parse(saved) as RawEventItem[];
    return parsed.map((e) => normalizeEvent(e));
  }
  const res = await fetch("/events.json", { cache: "no-store" });
  const data = (await res.json()) as RawEventItem[];
  const normalized = data.map((e) => normalizeEvent(e));
  setEvents(normalized);
  return normalized;
}

export async function forceReloadEvents(): Promise<EventItem[]> {
  const res = await fetch("/events.json", { cache: "no-store" });
  const data = (await res.json()) as RawEventItem[];
  const normalized = data.map((e) => normalizeEvent(e));
  setEvents(normalized);
  return normalized;
}

export async function refreshEventsFromRemote(): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  try {
    const { data, error } = await supa
      .from("events")
      .select(
        "id,name,datetime,location,is_public,requests_open,singer_order,singer_display_names",
      )
      .order("datetime", { ascending: true });
    if (error || !data) return;
    for (const row of data as any[]) {
      applyRemoteRoster(row.id, row.singer_order, row.singer_display_names);
    }
    const mapped: EventItem[] = (data as any[]).map((e) => normalizeEvent(e));
    setEvents(mapped);
  } catch {}
}

export function subscribeEventsRealtime(onChange?: () => void): () => void {
  const supa = getSupabase();
  if (!supa) return () => {};
  const channel = supa
    .channel("events-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events" },
      async () => {
        try {
          await refreshEventsFromRemote();
        } catch {}
        try {
          onChange?.();
        } catch {}
      },
    )
    .subscribe();
  return () => {
    try {
      supa.removeChannel(channel);
    } catch {}
  };
}

export function resetAllLocalData() {
  try {
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(REQUESTS_KEY);
    localStorage.removeItem(SINGER_ORDER_KEY);
    localStorage.removeItem(SINGER_NAMES_KEY);
    localStorage.removeItem(SINGER_ORDER_SYNC_TIME_KEY);
    localStorage.removeItem(ARCHIVE_KEY);
  } catch {}
}

export function getEvents(): EventItem[] {
  const raw = localStorage.getItem(EVENTS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as RawEventItem[];
  const normalized = parsed.map((e) => normalizeEvent(e));
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export function setEvents(events: EventItem[]) {
  const normalized = events.map((e) => normalizeEvent(e));
  localStorage.setItem(EVENTS_KEY, JSON.stringify(normalized));
}

function canAcceptRequests(eventId: string): boolean {
  const event = getEvents().find((e) => e.id === eventId);
  return !event || event.requestsOpen;
}

export async function upsertEvent(ev: EventItem): Promise<void> {
  const normalized = normalizeEvent(ev);
  const supa = getSupabase();
  if (supa) {
    await supa.from("events").upsert({
      id: normalized.id,
      name: normalized.name,
      datetime: normalized.datetime,
      location: normalized.location,
      is_public: normalized.isPublic,
      requests_open: normalized.requestsOpen,
    });
  }
  const list = getEvents()
    .filter((e) => e.id !== normalized.id)
    .concat([normalized]);
  setEvents(list);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const supa = getSupabase();
  if (supa) {
    await supa.from("events").delete().eq("id", eventId);
  }
  const list = getEvents().filter((e) => e.id !== eventId);
  setEvents(list);
}

export async function clearAllPublicEvents(): Promise<void> {
  const events = getEvents();
  const updatedEvents = events.map((e) => ({
    ...e,
    isPublic: false,
  }));

  // Update in Supabase FIRST (wait for completion)
  const supa = getSupabase();
  if (supa) {
    for (const event of updatedEvents) {
      try {
        await supa
          .from("events")
          .update({ is_public: false })
          .eq("id", event.id);
      } catch (err) {
        console.error(`Failed to update event ${event.id}:`, err);
      }
    }
  }

  // Update locally AFTER Supabase is complete
  setEvents(updatedEvents);

  // Clear localStorage to ensure no stale data
  localStorage.removeItem(EVENTS_KEY);
}

export async function fixEventIdMismatch(
  oldEventId: string,
  newEventId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Get the event with the old ID
    const events = getEvents();
    const eventToFix = events.find((e) => e.id === oldEventId);

    if (!eventToFix) {
      return {
        success: false,
        message: `Event with ID "${oldEventId}" not found`,
      };
    }

    // Create a new event object with the new ID
    const updatedEvent: EventItem = {
      ...eventToFix,
      id: newEventId,
    };

    // Update locally: remove old, add new
    const updatedEvents = events
      .filter((e) => e.id !== oldEventId)
      .concat([updatedEvent]);
    setEvents(updatedEvents);

    // Update in Supabase if connected
    const supa = getSupabase();
    if (supa) {
      // First, update the event table with the new ID
      await supa.from("events").upsert({
        id: updatedEvent.id,
        name: updatedEvent.name,
        datetime: updatedEvent.datetime,
        location: updatedEvent.location,
        is_public: updatedEvent.isPublic,
        requests_open: updatedEvent.requestsOpen,
      });

      // Delete the old event ID from Supabase
      await supa.from("events").delete().eq("id", oldEventId);

      // Update all requests with the old event ID to use the new one
      await supa
        .from("requests")
        .update({ event_id: newEventId })
        .eq("event_id", oldEventId);
    }

    // Update requests locally
    const requests = getRequests();
    const updatedRequests = requests.map((r) =>
      r.eventId === oldEventId ? { ...r, eventId: newEventId } : r,
    );
    setRequests(updatedRequests);

    return {
      success: true,
      message: `Successfully updated event ID from "${oldEventId}" to "${newEventId}" (${updatedRequests.filter((r) => r.eventId === newEventId).length} requests updated)`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Error fixing event ID: ${err?.message || "Unknown error"}`,
    };
  }
}

export function getRequests(): RequestItem[] {
  const raw = localStorage.getItem(REQUESTS_KEY);
  return raw ? (JSON.parse(raw) as RequestItem[]) : [];
}

export function setRequests(reqs: RequestItem[]) {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(reqs));
}

let refreshPromise: Promise<void> | null = null;

export async function checkSupabaseHealth(): Promise<{
  connected: boolean;
  error?: string;
  requestsTableAccessible?: boolean;
  rlsPolicyIssue?: boolean;
  diagnosticMessage?: string;
}> {
  const supa = getSupabase();
  if (!supa) {
    return { connected: false, error: "Supabase not initialized" };
  }

  try {
    // Try to fetch just one request to check connection
    const { data, error } = await supa.from("requests").select("id").limit(1);

    if (error) {
      const msg = error.message.toLowerCase();
      const isRlsIssue =
        msg.includes("policy") ||
        msg.includes("permission") ||
        msg.includes("not permitted");

      return {
        connected: false,
        requestsTableAccessible: false,
        rlsPolicyIssue: isRlsIssue,
        error: `${error.message} (Code: ${(error as any).code}, Status: ${(error as any).status})`,
        diagnosticMessage: isRlsIssue
          ? "This looks like a Row-Level Security (RLS) policy issue. Check database RLS settings."
          : "Error accessing requests table. Check table exists and columns are correct.",
      };
    }

    return {
      connected: true,
      requestsTableAccessible: true,
      diagnosticMessage: `Successfully read requests table. Found ${Array.isArray(data) ? data.length : 0} rows.`,
    };
  } catch (e: any) {
    return {
      connected: false,
      error: e?.message || "Unknown error",
      diagnosticMessage: "Exception thrown during health check",
    };
  }
}

export async function refreshRequestsFromRemote(): Promise<void> {
  // If refresh is already in progress, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  // Create and store the refresh promise immediately to prevent race conditions
  refreshPromise = performRefresh().finally(() => {
    // Clear the promise after it completes
    refreshPromise = null;
  });

  return refreshPromise;
}

async function performRefresh(): Promise<void> {
  try {
    const supa = getSupabase();
    if (!supa) {
      console.warn("[Karaoke] Supabase not initialized");
      return;
    }

    console.log("[Karaoke] Attempting to fetch requests from Supabase...");
    const fresh = await supa
      .from("requests")
      .select(
        "id,event_id,singer,song_title,artist,status,created_at,device_id,ip,order,started_at,completed_at",
      );

    if (fresh.error) {
      const errorMsg = fresh.error.message || "Unknown error";
      const errorCode = (fresh.error as any).code || "N/A";
      const errorDetails = (fresh.error as any).details || "No details";
      const errorHint = (fresh.error as any).hint || "No hint";
      const errorStatus = (fresh.error as any).status || "N/A";

      console.error(
        `[Karaoke] Error fetching requests from Supabase: ${errorMsg}`,
      );
      console.error(`[Karaoke]   Code: ${errorCode}, Status: ${errorStatus}`);
      console.error(`[Karaoke]   Details: ${errorDetails}`);
      if (errorHint) console.error(`[Karaoke]   Hint: ${errorHint}`);

      // Try a simpler query to diagnose the issue
      console.log("[Karaoke] Attempting simpler diagnostic query...");
      try {
        const diagnostic = await supa.from("requests").select("id").limit(1);

        if (diagnostic.error) {
          console.error(
            `[Karaoke] Even simple query failed: ${diagnostic.error.message}`,
          );
        } else {
          console.log(
            `[Karaoke] Simple query succeeded. Issue is with column selection.`,
          );
          if (diagnostic.data && diagnostic.data.length > 0) {
            console.log(
              `[Karaoke] Available columns in requests table:`,
              Object.keys(diagnostic.data[0]),
            );
          }
        }
      } catch (diagErr) {
        console.error(
          `[Karaoke] Diagnostic query exception:`,
          diagErr instanceof Error ? diagErr.message : String(diagErr),
        );
      }
      return;
    }

    if (!fresh.data) {
      console.warn("[Karaoke] No data returned from Supabase requests query");
      return;
    }

    console.log(
      `[Karaoke] Fetched ${fresh.data.length} requests from Supabase`,
    );

    // Deduplicate by ID in case Supabase returns duplicates
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const r of fresh.data) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        deduped.push(r);
      }
    }

    const mapped: RequestItem[] = deduped.map((r) => {
      // Validate required fields
      if (!r.id || !r.event_id) {
        console.warn(`[Karaoke] Request missing required fields:`, {
          id: r.id,
          event_id: r.event_id,
        });
      }
      return {
        id: r.id,
        eventId: r.event_id,
        singer: r.singer || "",
        songTitle: r.song_title || "",
        artist: r.artist || "",
        status: (r.status || "pending") as RequestStatus,
        createdAt: Number(r.created_at || Date.now()),
        deviceId: r.device_id || "unknown",
        ip: r.ip ?? undefined,
        order: r.order ?? undefined,
        startedAt: r.started_at ?? undefined,
        completedAt: r.completed_at ?? undefined,
        isDuo: r.is_duo ?? undefined,
        partner: r.partner ?? undefined,
      };
    });
    console.log(
      `[Karaoke] Successfully mapped ${mapped.length} requests to local format`,
    );
    setRequests(mapped);
    for (const r of mapped) {
      if (r.status === "complete" && r.completedAt) {
        archiveRequest(r);
      }
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[Karaoke] Exception during performRefresh: ${errorMsg}`);
    if (e instanceof Error && e.stack) {
      console.error("[Karaoke] Stack trace:", e.stack);
    }
  }
}

export function subscribeRequestsRealtime(onChange?: () => void): () => void {
  const supa = getSupabase();
  if (!supa) return () => {};
  const channel = supa
    .channel("requests-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "requests" },
      async () => {
        try {
          await refreshRequestsFromRemote();
        } catch {}
        try {
          onChange?.();
        } catch {}
      },
    )
    .subscribe();
  return () => {
    try {
      supa.removeChannel(channel);
    } catch {}
  };
}

export function getRequestsByEvent(eventId: string): RequestItem[] {
  return getRequests().filter((r) => r.eventId === eventId);
}

export function subscribeSettingsRealtime(onChange?: () => void): () => void {
  const supa = getSupabase();
  if (!supa) return () => {};
  const channel = supa
    .channel("settings-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings" },
      async () => {
        try {
          await refreshSettingsFromRemote();
        } catch {}
        try {
          onChange?.();
        } catch {}
      },
    )
    .subscribe();
  return () => {
    try {
      supa.removeChannel(channel);
    } catch {}
  };
}

export function subscribeTermsRealtime(
  eventId: string,
  onChange?: () => void,
): () => void {
  const supa = getSupabase();
  if (!supa) return () => {};
  const channel = supa
    .channel(`terms-changes-${eventId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_terms",
        filter: `event_id=eq.${eventId}`,
      },
      async () => {
        try {
          await refreshTermsFromRemote(eventId);
        } catch {}
        try {
          onChange?.();
        } catch {}
      },
    )
    .subscribe();
  return () => {
    try {
      supa.removeChannel(channel);
    } catch {}
  };
}

export function addRequest(
  newReq: Omit<RequestItem, "id" | "status" | "createdAt" | "deviceId"> & {
    ip?: string;
  },
): { ok: true; id: string } | { ok: false; reason: string } {
  if (!canAcceptRequests(newReq.eventId)) {
    return { ok: false, reason: "Song requests are currently closed." };
  }
  const deviceId = getDeviceId();
  const all = getRequests();
  const eventReqs = all.filter(
    (r) => r.eventId === newReq.eventId && r.status !== "complete",
  );

  // Removed 2-request limit; allow multiple active requests per singer

  const dup = eventReqs.find(
    (r) =>
      r.singer.trim().toLowerCase() === newReq.singer.trim().toLowerCase() &&
      r.songTitle.trim().toLowerCase() ===
        newReq.songTitle.trim().toLowerCase() &&
      r.artist.trim().toLowerCase() === newReq.artist.trim().toLowerCase(),
  );
  if (dup) {
    return { ok: false, reason: "Duplicate song request removed" };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const req: RequestItem = {
    id,
    eventId: newReq.eventId,
    singer: newReq.singer.trim(),
    songTitle: newReq.songTitle.trim(),
    artist: newReq.artist.trim(),
    status: "pending",
    createdAt: Date.now(),
    deviceId,
    ip: newReq.ip,
    isDuo: newReq.isDuo ?? false,
    partner: newReq.partner?.trim() || undefined,
  };
  all.push(req);
  setRequests(all);
  return { ok: true, id };
}

/** Detects a Postgres "column does not exist" style error from Supabase. */
function isMissingColumnError(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("column") ||
    msg.includes("schema cache")
  );
}

export async function getClientIP(): Promise<string> {
  const cached = localStorage.getItem(CLIENT_IP_KEY);
  if (cached) return cached;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    const ip = data?.ip || "unknown";
    localStorage.setItem(CLIENT_IP_KEY, ip);
    return ip;
  } catch {
    return "unknown";
  }
}

export async function addRequestAsync(
  newReq: Omit<RequestItem, "id" | "status" | "createdAt" | "deviceId" | "ip">,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const ip = await getClientIP();
  await refreshEventsFromRemote();
  if (!canAcceptRequests(newReq.eventId)) {
    return { ok: false, reason: "Song requests are currently closed." };
  }
  const supa = getSupabase();
  if (supa) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base = {
      id,
      event_id: newReq.eventId,
      singer: newReq.singer.trim(),
      song_title: newReq.songTitle.trim(),
      artist: newReq.artist.trim(),
      status: "pending",
      created_at: Date.now(),
      device_id: getDeviceId(),
      ip,
    };
    const withDuo = {
      ...base,
      is_duo: newReq.isDuo ?? false,
      partner: newReq.partner?.trim() || null,
    };
    let { error } = await supa.from("requests").insert(withDuo);
    if (error && isMissingColumnError(error)) {
      // Supabase table has not been migrated yet - fall back so the night
      // is never blocked by a missing column.
      console.warn(
        "[Karaoke] requests table missing is_duo/partner columns; inserting without them. Run the migration in supabase-migrations.sql.",
      );
      ({ error } = await supa.from("requests").insert(base));
    }
    if (error) return { ok: false, reason: error.message };
    // Use the in-flight guard to fetch all requests after insert
    await refreshRequestsFromRemote();
    return { ok: true, id };
  }
  return addRequest({ ...newReq, ip });
}

export async function addRequestAsHost(
  params: Omit<
    RequestItem,
    "id" | "createdAt" | "deviceId" | "ip" | "status"
  > & {
    status?: RequestStatus;
  },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const status: RequestStatus = params.status || "approved";
  const supa = getSupabase();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (supa) {
    const payload: any = {
      id,
      event_id: params.eventId,
      singer: params.singer.trim(),
      song_title: params.songTitle.trim(),
      artist: params.artist.trim(),
      status: status,
      created_at: Date.now(),
      device_id: "host",
      ip: "host",
      is_duo: params.isDuo ?? false,
      partner: params.partner?.trim() || null,
    };
    try {
      let { error } = await supa.from("requests").insert(payload);
      if (error && isMissingColumnError(error)) {
        const { is_duo, partner, ...fallback } = payload;
        ({ error } = await supa.from("requests").insert(fallback));
      }
      if (error) return { ok: false, reason: error.message };
      // For "performing", we need transitionRequest to handle startedAt and marking previous as complete
      // For other statuses, the insert already set them correctly
      if (status === "performing") {
        await transitionRequest(id, status);
      } else {
        await refreshRequestsFromRemote();
      }
      return { ok: true, id };
    } catch (e: any) {
      return { ok: false, reason: e?.message || "Insert failed" };
    }
  }
  // Local fallback
  const res = addRequest({
    eventId: params.eventId,
    singer: params.singer,
    songTitle: params.songTitle,
    artist: params.artist,
    ip: "host",
  });
  if (!res.ok) return res;
  // Set the status on the locally stored request
  const allRequests = getRequests();
  const idx = allRequests.findIndex((r) => r.id === res.id);
  if (idx !== -1) {
    allRequests[idx].status = status;
    setRequests(allRequests);
  }
  return res;
}

export async function transitionRequest(id: string, next: RequestStatus) {
  const supa = getSupabase();
  if (supa) {
    const { data: targetRows } = await supa
      .from("requests")
      .select("*")
      .eq("id", id)
      .limit(1);
    const target = targetRows && (targetRows as any[])[0];
    if (!target) return;
    const now = Date.now();
    if (next === "performing") {
      const { data: cur } = await supa
        .from("requests")
        .select("id")
        .eq("event_id", target.event_id)
        .eq("status", "performing")
        .limit(1);
      if (cur && (cur as any[])[0]) {
        await supa
          .from("requests")
          .update({ status: "complete", completed_at: now })
          .eq("id", (cur as any[])[0].id);
      }
      await supa
        .from("requests")
        .update({ status: "performing", started_at: now })
        .eq("id", id);
    } else if (next === "complete") {
      await supa
        .from("requests")
        .update({ status: "complete", completed_at: now })
        .eq("id", id);
    } else {
      await supa.from("requests").update({ status: next }).eq("id", id);
    }
    // Use the in-flight guard to fetch all requests after update
    await refreshRequestsFromRemote();
    return;
  }
  const all = getRequests();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const now = Date.now();
  if (next === "performing") {
    const current = all.find(
      (r) => r.status === "performing" && r.eventId === all[idx].eventId,
    );
    if (current) {
      current.status = "complete";
      current.completedAt = now;
      archiveRequest(current);
    }
    all[idx].startedAt = now;
  }
  if (next === "complete") {
    all[idx].completedAt = now;
    archiveRequest(all[idx]);
  }
  all[idx].status = next;
  setRequests(all);
}


export function getArchive(): ArchiveItem[] {
  const raw = localStorage.getItem(ARCHIVE_KEY);
  return raw ? (JSON.parse(raw) as ArchiveItem[]) : [];
}
export function setArchive(items: ArchiveItem[]) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(items));
}
export function getArchiveByEvent(eventId: string): ArchiveItem[] {
  return getArchive()
    .filter((a) => a.eventId === eventId)
    .sort((a, b) => b.completedAt - a.completedAt);
}

function archiveRequest(r: RequestItem) {
  // Only archive if completedAt set
  if (!r.completedAt) return;
  const events = getEvents();
  const ev = events.find((e) => e.id === r.eventId);
  const item: ArchiveItem = {
    id: r.id,
    eventId: r.eventId,
    eventName: ev?.name || r.eventId,
    singer: r.singer,
    songTitle: r.songTitle,
    artist: r.artist,
    submittedAt: r.createdAt,
    startedAt: r.startedAt ?? null,
    completedAt: r.completedAt,
    queueWaitMs: r.startedAt ? r.startedAt - r.createdAt : null,
  };
  const list = getArchive();
  // avoid duplicates
  if (!list.some((x) => x.id === r.id)) {
    list.push(item);
    setArchive(list);
  }
}

export function archiveEventRequests(eventId: string): void {
  // Move all requests for this event to archive, regardless of status
  const all = getRequests();
  const eventRequests = all.filter((r) => r.eventId === eventId);
  const events = getEvents();
  const ev = events.find((e) => e.id === eventId);

  const archive = getArchive();
  const now = Date.now();

  for (const r of eventRequests) {
    // Create archive entry if it doesn't already exist
    if (!archive.some((x) => x.id === r.id)) {
      archive.push({
        id: r.id,
        eventId: r.eventId,
        eventName: ev?.name || r.eventId,
        singer: r.singer,
        songTitle: r.songTitle,
        artist: r.artist,
        submittedAt: r.createdAt,
        startedAt: r.startedAt ?? null,
        completedAt: r.completedAt ?? now,
        queueWaitMs: r.startedAt ? r.startedAt - r.createdAt : null,
      });
    }
  }

  setArchive(archive);

  // Remove archived requests from active requests
  const remaining = all.filter((r) => r.eventId !== eventId);
  setRequests(remaining);
}

export function cleanupOldArchive(): void {
  // Remove archive entries older than 3 months
  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days
  const archive = getArchive();
  const filtered = archive.filter((a) => a.completedAt > threeMonthsAgo);

  if (filtered.length < archive.length) {
    setArchive(filtered);
  }
}

export function reorderRequests(eventId: string, orderedIds: string[]) {
  const all = getRequests();
  const map = new Map<string, number>();
  orderedIds.forEach((id, i) => map.set(id, i));
  for (const r of all) {
    if (r.eventId === eventId && map.has(r.id)) {
      r.order = map.get(r.id)!;
    }
  }
  setRequests(all);
}

export async function persistRequestOrderToRemote(
  eventId: string,
  orderedIds: string[],
): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    try {
      await supa.from("requests").update({ order: i }).eq("id", id);
    } catch {}
  }
  await refreshRequestsFromRemote();
}

export async function updateRequestInfo(
  id: string,
  updates: Partial<Pick<RequestItem, "singer" | "songTitle" | "artist">>,
): Promise<void> {
  const supa = getSupabase();
  if (supa) {
    const payload: any = {};
    if (updates.singer != null) payload.singer = updates.singer.trim();
    if (updates.songTitle != null)
      payload.song_title = updates.songTitle.trim();
    if (updates.artist != null) payload.artist = updates.artist.trim();
    if (Object.keys(payload).length) {
      try {
        await supa.from("requests").update(payload).eq("id", id);
      } catch {}
    }
    await refreshRequestsFromRemote();
    return;
  }
  const all = getRequests();
  const idx = all.findIndex((r) => r.id === id);
  if (idx !== -1) {
    if (updates.singer != null) all[idx].singer = updates.singer.trim();
    if (updates.songTitle != null)
      all[idx].songTitle = updates.songTitle.trim();
    if (updates.artist != null) all[idx].artist = updates.artist.trim();
    setRequests(all);
  }
}

export async function deleteRequest(id: string): Promise<void> {
  const supa = getSupabase();
  if (supa) {
    try {
      await supa.from("requests").delete().eq("id", id);
    } catch {}
    await refreshRequestsFromRemote();
    return;
  }
  const all = getRequests();
  const filtered = all.filter((r) => r.id !== id);
  setRequests(filtered);
}

export async function persistSingerOrderToRemote(
  eventId: string,
): Promise<void> {
  // Record the time we're initiating this sync
  // This prevents real-time updates from reverting our local changes during sync
  setSingerOrderSyncTime(eventId, Date.now());

  const supa = getSupabase();
  if (!supa) {
    console.warn(
      "[Karaoke] Skipping persistSingerOrderToRemote - Supabase not available",
    );
    return;
  }
  try {
    const order = getSingerOrder(eventId);
    const names = getSingerDisplayNameMap(eventId);
    const rank: Record<string, number> = {};
    order.forEach((k, i) => (rank[k] = i));
    const reqs = getRequestsByEvent(eventId).filter(
      (r) => r.status === "approved" || r.status === "performing",
    );
    console.log(
      "[Karaoke] persistSingerOrderToRemote - syncing",
      reqs.length,
      "requests with order",
      Object.keys(rank).length,
      "singers",
    );

    // Update individual request order fields
    for (const r of reqs) {
      const k = singerKey(r.singer);
      const i = rank[k] ?? null;
      if (i != null) {
        try {
          await supa.from("requests").update({ order: i }).eq("id", r.id);
        } catch (err) {
          console.error(
            "[Karaoke] Failed to update order for request",
            r.id,
            ":",
            err,
          );
        }
      }
    }
    console.log("[Karaoke] Order updates sent to Supabase");

    // CRITICAL: Also sync the singer_order and singer_display_names to the events table
    // This ensures that real-time subscriptions reload the correct order
    console.log("[Karaoke] Also syncing singer_order to events table");
    await supa
      .from("events")
      .update({
        singer_order: order,
        singer_display_names: names,
      })
      .eq("id", eventId);
    console.log("[Karaoke] Singer order synced to events table successfully");
  } catch (err) {
    console.error("[Karaoke] Error in persistSingerOrderToRemote:", err);
    throw err;
  }
}

export function getPublicQueue(eventId: string): RequestItem[] {
  const reqs = getRequestsByEvent(eventId).filter(
    (r) =>
      r.status !== "complete" &&
      (r.status === "approved" || r.status === "performing"),
  );
  const order = getSingerOrder(eventId);
  const indexOf = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  // group by singer and pick next-up per singer
  const bySinger = new Map<string, RequestItem[]>();
  for (const r of reqs) {
    const key = singerKey(r.singer);
    if (!bySinger.has(key)) bySinger.set(key, []);
    bySinger.get(key)!.push(r);
  }
  const picks: RequestItem[] = [];
  for (const [, list] of bySinger) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    const perf = list.find((r) => r.status === "performing");
    picks.push(perf || list[0]);
  }
  // sort strictly by assigned order (request.order), fallback to roster order
  const rank = (r: RequestItem) =>
    r.order != null ? r.order : indexOf(singerKey(r.singer));
  picks.sort((a, b) => rank(a) - rank(b));
  return picks;
}

export function getNowSinging(eventId: string): RequestItem | undefined {
  return getRequestsByEvent(eventId).find((r) => r.status === "performing");
}

export function getOnDeck(eventId: string): RequestItem | undefined {
  const now = getNowSinging(eventId);
  const orderKeys = getPublicQueue(eventId).map((r) => singerKey(r.singer));
  const reqs = getRequestsByEvent(eventId).filter(
    (r) => r.status === "approved" || r.status === "performing",
  );
  const bySinger = new Map<string, RequestItem[]>();
  for (const r of reqs) {
    const key = singerKey(r.singer);
    if (!bySinger.has(key)) bySinger.set(key, []);
    bySinger.get(key)!.push(r);
  }
  for (const list of bySinger.values())
    list.sort((a, b) => a.createdAt - b.createdAt);

  const startIdx = now ? orderKeys.indexOf(singerKey(now.singer)) : -1;
  const n = orderKeys.length;
  if (n === 0) return undefined;
  for (let step = 1; step <= n; step++) {
    const idx = (((startIdx + step) % n) + n) % n;
    const key = orderKeys[idx];
    const list = bySinger.get(key) || [];
    const next = list.find((r) => r.status === "approved");
    if (next) return next;
  }
  return undefined;
}

export function getDuplicateWarnings(
  eventId: string,
): { type: "device" | "ip"; key: string; singers: string[] }[] {
  const reqs = getRequestsByEvent(eventId).filter(
    (r) => r.status !== "complete",
  );
  const deviceMap = new Map<string, Set<string>>();
  const ipMap = new Map<string, Set<string>>();
  for (const r of reqs) {
    if (!deviceMap.has(r.deviceId)) deviceMap.set(r.deviceId, new Set());
    deviceMap.get(r.deviceId)!.add(r.singer.toLowerCase());
    const ip = r.ip || "unknown";
    if (!ipMap.has(ip)) ipMap.set(ip, new Set());
    ipMap.get(ip)!.add(r.singer.toLowerCase());
  }
  const out: { type: "device" | "ip"; key: string; singers: string[] }[] = [];
  for (const [k, set] of deviceMap)
    if (set.size > 1)
      out.push({ type: "device", key: k, singers: Array.from(set).sort() });
  for (const [k, set] of ipMap)
    if (set.size > 1 && k !== "unknown")
      out.push({ type: "ip", key: k, singers: Array.from(set).sort() });
  return out;
}

export function getDuplicateSets(eventId: string): {
  deviceIds: Set<string>;
  ips: Set<string>;
} {
  const warnings = getDuplicateWarnings(eventId);
  const deviceIds = new Set<string>();
  const ips = new Set<string>();
  for (const w of warnings) {
    if (w.type === "device") deviceIds.add(w.key);
    else if (w.type === "ip") ips.add(w.key);
  }
  return { deviceIds, ips };
}

export function getDuplicateSingerMaps(eventId: string): {
  deviceSingerMap: Map<string, string[]>;
  ipSingerMap: Map<string, string[]>;
} {
  const reqs = getRequestsByEvent(eventId).filter(
    (r) => r.status !== "complete",
  );
  const deviceSingerMap = new Map<string, Map<string, string>>(); // deviceId -> lowerSinger -> original
  const ipSingerMap = new Map<string, Map<string, string>>(); // ip -> lowerSinger -> original
  for (const r of reqs) {
    const lower = r.singer.trim().toLowerCase();
    if (!deviceSingerMap.has(r.deviceId))
      deviceSingerMap.set(r.deviceId, new Map());
    deviceSingerMap.get(r.deviceId)!.set(lower, r.singer.trim());
    const ip = r.ip || "unknown";
    if (!ipSingerMap.has(ip)) ipSingerMap.set(ip, new Map());
    ipSingerMap.get(ip)!.set(lower, r.singer.trim());
  }
  const deviceOut = new Map<string, string[]>();
  for (const [dev, m] of deviceSingerMap)
    deviceOut.set(dev, Array.from(m.values()));
  const ipOut = new Map<string, string[]>();
  for (const [ip, m] of ipSingerMap) ipOut.set(ip, Array.from(m.values()));
  return { deviceSingerMap: deviceOut, ipSingerMap: ipOut };
}

export function getQueueMismatchDiagnostics(
  eventId: string,
): {
  hostQueueOrder: string[];
  publicQueueSingers: string[];
  missingFromPublic: string[];
  extraInHost: string[];
  orderMismatch: boolean;
  matchCount: number;
  totalInHost: number;
  totalInPublic: number;
} {
  const hostOrder = getSingerOrder(eventId);
  const publicQueue = getPublicQueue(eventId);
  const publicSingers = publicQueue.map((r) => singerKey(r.singer));

  // Find singers in host queue but not in public queue
  const missingFromPublic = hostOrder.filter(
    (key) => !publicSingers.includes(key),
  );

  // Find singers in public queue but not in host queue
  const extraInHost = publicSingers.filter((key) => !hostOrder.includes(key));

  // Check if order matches (ignoring singers only in one list)
  const commonKeys = hostOrder.filter((key) => publicSingers.includes(key));
  const commonPublic = publicSingers.filter((key) => hostOrder.includes(key));
  const orderMismatch =
    commonKeys.length !== commonPublic.length ||
    !commonKeys.every((key, i) => key === commonPublic[i]);

  let matchCount = 0;
  for (let i = 0; i < Math.min(commonKeys.length, commonPublic.length); i++) {
    if (commonKeys[i] === commonPublic[i]) matchCount++;
    else break;
  }

  return {
    hostQueueOrder: hostOrder,
    publicQueueSingers: publicSingers,
    missingFromPublic,
    extraInHost,
    orderMismatch,
    matchCount,
    totalInHost: hostOrder.length,
    totalInPublic: publicSingers.length,
  };
}

export function isHostAuthed(): boolean {
  return localStorage.getItem(HOST_AUTH_KEY) === "true";
}

export function setHostAuthed(val: boolean) {
  localStorage.setItem(HOST_AUTH_KEY, val ? "true" : "false");
  if (!val) localStorage.removeItem(HOST_USER_KEY);
}

export function logoutHost() {
  try {
    setHostAuthed(false);
    setAuthedUsername(null);
  } catch {}
}

export interface HostUserOptions {
  isAdmin?: boolean;
}
export interface HostUser {
  username: string;
  passwordHash: string;
  options?: HostUserOptions;
  createdAt: number;
  updatedAt: number;
}

function readUsers(): HostUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
function writeUsers(users: HostUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
export function getUsers(): HostUser[] {
  return readUsers();
}
export function findUser(username: string): HostUser | undefined {
  return readUsers().find(
    (u) => u.username.trim().toLowerCase() === username.trim().toLowerCase(),
  );
}
export function setAuthedUsername(username: string | null) {
  if (username) localStorage.setItem(HOST_USER_KEY, username);
  else localStorage.removeItem(HOST_USER_KEY);
}
export function getAuthedUsername(): string | null {
  return localStorage.getItem(HOST_USER_KEY);
}
async function sha256Hex(input: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const data = enc.encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    try {
      return "plain:" + btoa(unescape(encodeURIComponent(input)));
    } catch {
      return "plain:" + input;
    }
  }
}
export async function ensureDefaultUser(): Promise<void> {
  const users = readUsers();
  if (users.length === 0 || !users.some((u) => u.username === "djross")) {
    const now = Date.now();
    const passwordHash = await sha256Hex("merlinthedog");
    const next = users.filter((u) => u.username !== "djross");
    next.push({
      username: "djross",
      passwordHash,
      options: { isAdmin: true },
      createdAt: now,
      updatedAt: now,
    });
    writeUsers(next);
  }
}
export async function addUser(
  username: string,
  password: string,
  options?: HostUserOptions,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const users = readUsers();
  if (!username.trim() || !password)
    return { ok: false, reason: "Username and password required" };
  if (
    users.some(
      (u) => u.username.trim().toLowerCase() === username.trim().toLowerCase(),
    )
  )
    return { ok: false, reason: "Username already exists" };
  const now = Date.now();
  const passwordHash = await sha256Hex(password);
  users.push({
    username: username.trim(),
    passwordHash,
    options,
    createdAt: now,
    updatedAt: now,
  });
  writeUsers(users);
  return { ok: true };
}
export async function updateUserPassword(
  username: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const users = readUsers();
  const idx = users.findIndex(
    (u) => u.username.trim().toLowerCase() === username.trim().toLowerCase(),
  );
  if (idx === -1) return { ok: false, reason: "User not found" };
  users[idx].passwordHash = await sha256Hex(newPassword);
  users[idx].updatedAt = Date.now();
  writeUsers(users);
  return { ok: true };
}
export function setUserAdmin(
  username: string,
  isAdmin: boolean,
): { ok: true } | { ok: false; reason: string } {
  const users = readUsers();
  const idx = users.findIndex(
    (u) => u.username.trim().toLowerCase() === username.trim().toLowerCase(),
  );
  if (idx === -1) return { ok: false, reason: "User not found" };
  users[idx].options = { ...(users[idx].options || {}), isAdmin };
  users[idx].updatedAt = Date.now();
  writeUsers(users);
  return { ok: true };
}
export function deleteUser(
  username: string,
): { ok: true } | { ok: false; reason: string } {
  const users = readUsers();
  const filtered = users.filter(
    (u) => u.username.trim().toLowerCase() !== username.trim().toLowerCase(),
  );
  if (filtered.length === users.length)
    return { ok: false, reason: "User not found" };
  writeUsers(filtered);
  const authed = getAuthedUsername();
  if (authed && authed.trim().toLowerCase() === username.trim().toLowerCase()) {
    setHostAuthed(false);
    setAuthedUsername(null);
  }
  return { ok: true };
}
export async function verifyUser(
  username: string,
  password: string,
): Promise<boolean> {
  const user = findUser(username);
  if (!user) return false;
  const hashed = await sha256Hex(password);
  return user.passwordHash === hashed;
}

export function estimateWaitMinutes(eventId: string): number {
  return estimateTimeToEndOfRoundMinutes(eventId);
}

export function estimateTimeToEndOfRoundMinutes(eventId: string): number {
  const orderKeys = getSingerOrder(eventId);
  if (orderKeys.length === 0) return 0;
  const now = getNowSinging(eventId);
  const reqs = getRequestsByEvent(eventId).filter(
    (r) =>
      r.status === "approved" ||
      r.status === "performing" ||
      r.status === "pending",
  );
  const hasActive: Record<string, boolean> = {};
  for (const r of reqs) hasActive[singerKey(r.singer)] = true;

  let remainingSlots = 0;
  if (now) {
    const startIdx = orderKeys.indexOf(singerKey(now.singer));
    const n = orderKeys.length;
    // include current singer as a full slot so value only changes when they complete
    for (let step = 0; step < n; step++) {
      const idx = (startIdx + step) % n;
      const key = orderKeys[idx];
      if (hasActive[key]) remainingSlots++;
    }
  } else {
    for (const key of orderKeys) if (hasActive[key]) remainingSlots++;
  }

  // deterministic pseudo-random average based on number of completed songs so it only changes when someone completes
  const completed = getRequestsByEvent(eventId).filter(
    (r) => r.status === "complete",
  ).length;
  const seed = completed + 1;
  const rand = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  const avg = MIN_SONG_MINUTES + rand * (MAX_SONG_MINUTES - MIN_SONG_MINUTES);
  return Math.round(remainingSlots * avg);
}

export interface AppSettings {
  welcomeTitle: string;
  welcomeSubtitle: string;
  logoUrl: string;
  footerText: string;
}

export function getSettings(): AppSettings {
  const defaults: AppSettings = {
    welcomeTitle: "Find Your Karaoke Night",
    welcomeSubtitle:
      "Choose an event to submit your song and view the live queue.",
    logoUrl: "/assets/logo.png",
    footerText: "Built for Rossco’s Karaoke · Purple & Gold Theme",
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "");
    return { ...defaults, ...(parsed || {}) };
  } catch {
    return defaults;
  }
}
export async function refreshSettingsFromRemote(): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  try {
    const { data, error } = await supa
      .from("app_settings")
      .select("id,logo_url,welcome_title,welcome_subtitle,footer_text")
      .eq("id", "global")
      .maybeSingle();
    if (!error && data) {
      const s: AppSettings = {
        logoUrl: data.logo_url || "/assets/logo.png",
        welcomeTitle: data.welcome_title || "Find Your Karaoke Night",
        welcomeSubtitle:
          data.welcome_subtitle ||
          "Choose an event to submit your song and view the live queue.",
        footerText:
          data.footer_text ||
          "Built for Rossco’s Karaoke · Purple & Gold Theme",
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }
  } catch {}
}
export async function setSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  const supa = getSupabase();
  if (supa) {
    try {
      await supa.from("app_settings").upsert({
        id: "global",
        logo_url: s.logoUrl,
        welcome_title: s.welcomeTitle,
        welcome_subtitle: s.welcomeSubtitle,
        footer_text: s.footerText,
      });
    } catch {}
  }
}

export function getDefaultTerms(): string {
  try {
    const stored = localStorage.getItem(DEFAULT_TERMS_KEY);
    if (stored) return stored;
  } catch {}
  // Fallback to hardcoded defaults
  return [
    "1. No Food or Drink on Stage",
    "2. Only Active Singer on Stage",
    "3. We reserve the right to refuse service for disrespectful behaviour",
    "4. Max singers per round is 15",
    "5. Singer order may change at any time",
    "6. Do not submit songs under multiple names. We know its you. Trust us.",
    "7. Songs are queued First Come First Serve",
    "8. New singers join queue in order till the max singers per round is reached (15)",
    "9. At the end of a round the singing order is randomly shuffled. But all singers keep a spot unless they drop out",
    "10. Singers who miss their turn will be bumped. A minimum of 2 singers",
    "11. Have fun and enjoy!",
  ].join("\n");
}

export function setDefaultTerms(text: string) {
  localStorage.setItem(DEFAULT_TERMS_KEY, text);
}

export function getTermsForEvent(eventId: string): string {
  // Check if there are event-specific terms
  try {
    const map = JSON.parse(localStorage.getItem(TERMS_KEY) || "{}");
    if (map[eventId]) return map[eventId];
  } catch {}
  // If no event-specific terms, use global default
  return getDefaultTerms();
}
export async function refreshTermsFromRemote(eventId: string): Promise<void> {
  const supa = getSupabase();
  if (!supa) return;
  try {
    const { data, error } = await supa
      .from("event_terms")
      .select("event_id,text")
      .eq("event_id", eventId)
      .maybeSingle();
    if (!error && data) {
      let map: Record<string, string> = {};
      try {
        map = JSON.parse(localStorage.getItem(TERMS_KEY) || "{}");
      } catch {}
      map[eventId] = data.text || "";
      localStorage.setItem(TERMS_KEY, JSON.stringify(map));
    }
  } catch {}
}
export async function setTermsForEvent(eventId: string, text: string) {
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(localStorage.getItem(TERMS_KEY) || "{}");
  } catch {}
  map[eventId] = text;
  localStorage.setItem(TERMS_KEY, JSON.stringify(map));
  const supa = getSupabase();
  if (supa) {
    try {
      await supa.from("event_terms").upsert({ event_id: eventId, text });
    } catch {}
  }
}

export function getHostSelectedEvent(): string | null {
  return localStorage.getItem(HOST_EVENT_KEY);
}

export function setHostSelectedEvent(id: string) {
  localStorage.setItem(HOST_EVENT_KEY, id);
}

export function singerKey(name: string) {
  return name.trim().toLowerCase();
}

function readOrderStore(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(SINGER_ORDER_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeOrderStore(obj: Record<string, string[]>) {
  localStorage.setItem(SINGER_ORDER_KEY, JSON.stringify(obj));
}
function readNamesStore(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(SINGER_NAMES_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeNamesStore(obj: Record<string, Record<string, string>>) {
  localStorage.setItem(SINGER_NAMES_KEY, JSON.stringify(obj));
}

function deriveSingerOrder(eventId: string): string[] {
  const reqs = getRequestsByEvent(eventId).filter(
    (r) => r.status === "approved" || r.status === "performing",
  );
  const bySinger = new Map<string, RequestItem[]>();
  for (const r of reqs) {
    const key = singerKey(r.singer);
    if (!bySinger.has(key)) bySinger.set(key, []);
    bySinger.get(key)!.push(r);
  }
  const keys = Array.from(bySinger.keys());
  keys.sort((a, b) => {
    const ea = (bySinger.get(a) || []).map((r) => r.createdAt);
    const eb = (bySinger.get(b) || []).map((r) => r.createdAt);
    const ma = ea.length ? Math.min(...ea) : Number.MAX_SAFE_INTEGER;
    const mb = eb.length ? Math.min(...eb) : Number.MAX_SAFE_INTEGER;
    return ma - mb;
  });
  console.log(
    "[karaoke] deriveSingerOrder for event",
    eventId,
    "- total reqs:",
    reqs.length,
    "- unique singers:",
    keys.length,
    "- order:",
    keys,
  );
  return keys;
}

function setSingerOrderLocal(eventId: string, order: string[]) {
  const store = readOrderStore();
  store[eventId] = [...order];
  writeOrderStore(store);
}

function setSingerNamesMapLocal(eventId: string, map: SingerNameMap) {
  const ns = readNamesStore();
  if (Object.keys(map).length) ns[eventId] = { ...map };
  else delete ns[eventId];
  writeNamesStore(ns);
}

function getSingerDisplayNameMap(eventId: string): SingerNameMap {
  const ns = readNamesStore();
  const entry = ns[eventId];
  if (!entry) return {};
  return { ...entry };
}

export function getSingerOrder(eventId: string): string[] {
  const store = readOrderStore();
  const stored = store[eventId];
  if (Array.isArray(stored) && stored.length) {
    // Sanitize stored order - only keep singers that have active requests
    const activeRequests = getRequestsByEvent(eventId).filter(
      (r) => r.status === "approved" || r.status === "performing",
    );
    const activeSingerKeys = new Set(
      activeRequests.map((r) => singerKey(r.singer)),
    );
    const sanitized = stored.filter((key) => activeSingerKeys.has(key));

    // If the sanitized order differs from stored, it means some singers were completed
    if (sanitized.length !== stored.length) {
      console.log(
        "[karaoke] Sanitizing singer order - removed stale entries from",
        stored.length,
        "to",
        sanitized.length,
        "- removed keys:",
        stored.filter((k) => !activeSingerKeys.has(k)),
      );
      setSingerOrderLocal(eventId, sanitized);
      return [...sanitized];
    }

    // Check if there are new singers in activeRequests that aren't in the stored order
    const missingFromOrder = Array.from(activeSingerKeys).filter(
      (key) => !stored.includes(key),
    );
    if (missingFromOrder.length > 0) {
      console.warn(
        "[karaoke] Found singers not in stored order! Missing:",
        missingFromOrder,
        "- stored order:",
        stored,
        "- all active keys:",
        Array.from(activeSingerKeys),
      );
      // Add missing singers to the end of the order
      const updated = [...stored, ...missingFromOrder];
      setSingerOrderLocal(eventId, updated);
      return [...updated];
    }

    return [...stored];
  }
  const derived = deriveSingerOrder(eventId);
  setSingerOrderLocal(eventId, derived);
  return [...derived];
}

export function setSingerOrder(eventId: string, order: string[]) {
  const store = readOrderStore();
  const existing = store[eventId] || [];
  const sameLength = existing.length === order.length;
  const sameOrder =
    sameLength && existing.every((value, idx) => value === order[idx]);
  if (!sameOrder) {
    console.log(
      "[karaoke] setSingerOrder - old length:",
      existing.length,
      "new length:",
      order.length,
      "old:",
      existing,
      "new:",
      order,
    );
    setSingerOrderLocal(eventId, order);
    scheduleRosterSync(eventId);
  }
}

export function getSingerDisplayName(
  eventId: string,
  key: string,
): string | undefined {
  const map = getSingerDisplayNameMap(eventId);
  return map[key];
}

export function setSingerDisplayName(
  eventId: string,
  key: string,
  name: string,
) {
  const trimmed = name.trim();
  const map = getSingerDisplayNameMap(eventId);
  if (trimmed) {
    if (map[key] === trimmed) return;
    map[key] = trimmed;
  } else {
    if (!(key in map)) return;
    delete map[key];
  }
  setSingerNamesMapLocal(eventId, map);
  scheduleRosterSync(eventId);
}

export function clearSingerDisplayName(eventId: string, key: string) {
  const map = getSingerDisplayNameMap(eventId);
  if (!(key in map)) return;
  delete map[key];
  setSingerNamesMapLocal(eventId, map);
  scheduleRosterSync(eventId);
}

export function ensureSingerInOrder(
  eventId: string,
  name: string,
  index?: number,
) {
  const key = singerKey(name);
  const order = getSingerOrder(eventId);
  if (!order.includes(key)) {
    console.log(
      "[karaoke] ensureSingerInOrder - adding",
      name,
      "to queue at event",
      eventId,
      "- current queue size:",
      order.length,
    );
    if (index != null && index >= 0 && index <= order.length)
      order.splice(index, 0, key);
    else order.push(key);
    console.log(
      "[karaoke] ensureSingerInOrder - new queue size:",
      order.length,
    );
    setSingerOrder(eventId, order);
  }
  setSingerDisplayName(eventId, key, name.trim());
}

export function moveSingerToIndex(
  eventId: string,
  key: string,
  toIndex: number,
) {
  const order = getSingerOrder(eventId);
  const from = order.indexOf(key);
  if (from === -1) return;
  const [item] = order.splice(from, 1);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, item);
  setSingerOrder(eventId, order);
}

export function shuffleSingerOrder(eventId: string) {
  const order = getSingerOrder(eventId);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  setSingerOrder(eventId, order);
}

export function removeSingerFromOrder(eventId: string, key: string) {
  const order = getSingerOrder(eventId).filter((k) => k !== key);
  setSingerOrder(eventId, order);
}

export function moveSingerUp(eventId: string, key: string) {
  const order = getSingerOrder(eventId);
  const idx = order.indexOf(key);
  if (idx > 0) moveSingerToIndex(eventId, key, idx - 1);
}

export function moveSingerDown(eventId: string, key: string) {
  const order = getSingerOrder(eventId);
  const idx = order.indexOf(key);
  if (idx !== -1 && idx < order.length - 1)
    moveSingerToIndex(eventId, key, idx + 1);
}

export function deleteSinger(eventId: string, key: string) {
  console.log("[karaoke] deleteSinger - removing", key, "from queue for event", eventId);
  const oldOrder = getSingerOrder(eventId);
  removeSingerFromOrder(eventId, key);
  const newOrder = getSingerOrder(eventId);
  console.log(
    "[karaoke] deleteSinger - queue changed from",
    oldOrder.length,
    "singers to",
    newOrder.length,
  );
}
