import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Trash2, Plus, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  buildIdentityIndex,
  agoLabel,
  describePerson,
  acknowledgePerson,
  acknowledgeAll,
  getAcknowledgedSignatures,
  isAcknowledged,
  detectNameCollision,
  buildSetList,
  summariseSetList,
  formatClock,
  type PersonIdentity,
  type SetListEntry,
} from "@/lib/identity";
import {
  bootstrapEvents,
  ensureSingerInOrder,
  getEvents,
  getHostSelectedEvent,
  getNowSinging,
  getRequestsByEvent,
  getRequests,
  getSingerDisplayName,
  getSingerOrder,
  getEffectiveSingerOrder,
  setSingerOrder,
  isHostAuthed,
  getAuthMode,
  refreshHostSession,
  type AuthMode,
  moveSingerToIndex,
  reorderRequests,
  setHostSelectedEvent,
  shuffleSingerOrder,
  singerKey,
  transitionRequest,
  setSingerDisplayName,
  moveSingerUp,
  moveSingerDown,
  deleteSinger,
  removeSingerCompletely,
  removeSongFromQueue,
  getOnDeck,
  logoutHost,
  updateRequestInfo,
  addRequestAsHost,
  persistRequestOrderToRemote,
  persistSingerOrderToRemote,
  deleteRequest,
  setRequests,
  archiveEventRequests,
  cleanupOldArchive,
  checkSupabaseHealth,
  upsertEvent,
  setEvents,
  deleteEvent,
  endShift,
} from "@/lib/karaoke";
import type { EventItem, RequestItem } from "@/lib/karaoke";
import { dateOnlyToISO, getCurrentMSTDate } from "@/lib/utils";
import {
  participantStats,
  entryFairness,
  describeTurns,
  isGroupEntry,
} from "@/lib/singers";

export default function HostPage() {
  const nav = useNavigate();
  const previousEventRef = useRef<string | null>(null);
  const [authed, setAuthed] = useState(isHostAuthed());
  const [events, setEvents] = useState<EventItem[]>(getEvents());
  const [eventId, setEventId] = useState<string | null>(
    getHostSelectedEvent() || (events[0]?.id ?? null),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSinger, setDragSinger] = useState<string | null>(null);
  const [syncingOrder, setSyncingOrder] = useState(false);
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState({
    singer: "",
    songTitle: "",
    artist: "",
    status: "approved" as "pending" | "approved" | "performing",
  });
  const [showStartShiftModal, setShowStartShiftModal] = useState(!eventId);
  const [creatingShift, setCreatingShift] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    eventName: "",
    location: "",
    dateTime: getCurrentMSTDate(),
    requestsOpen: true,
  });

  const [authMode, setAuthMode] = useState<AuthMode>(getAuthMode());
  const [removingSinger, setRemovingSinger] = useState<string | null>(null);
  // Bumped when the host acknowledges a duplicate, to recompute the panel.
  const [ackTick, setAckTick] = useState(0);
  const [endingShift, setEndingShift] = useState(false);

  useEffect(() => {
    if (!authed) nav("/");
  }, [authed, nav]);

  // Keep the sync auth flag in step with the Supabase session across reloads.
  useEffect(() => {
    (async () => {
      await refreshHostSession();
      setAuthMode(getAuthMode());
      setAuthed(isHostAuthed());
    })();
  }, []);

  // Warn in the console if Supabase is unreachable. The on-screen
  // diagnostics panel was removed: it was builder.io-era debugging that
  // shouted at the host mid-event.
  useEffect(() => {
    (async () => {
      const health = await checkSupabaseHealth();
      if (!health.connected) {
        console.warn("[Host] Supabase is not accessible:", health.error);
      }
    })();
  }, []);

  // Clean up old archive data (older than 3 months) on component mount and daily
  useEffect(() => {
    cleanupOldArchive();
    const interval = setInterval(cleanupOldArchive, 24 * 60 * 60 * 1000); // Daily cleanup
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!events.length) {
      bootstrapEvents().then((es) => {
        setEvents(es);
        const firstActive = es.find((e) => e.isPublic);
        if (!eventId) setEventId(firstActive?.id ?? null);
      });
    } else {
      const cur = events.find((e) => e.id === eventId);
      const firstActive = events.find((e) => e.isPublic);

      if (!eventId || !cur) {
        // No event selected, or the selected one no longer exists.
        //
        // This branch previously only handled `cur && !cur.isPublic`, so when
        // eventId was null, `cur` was undefined and NOTHING ran. Ending a
        // shift sets eventId to null, which left the dashboard permanently
        // with no event selected: both the queue and pending lists rendered
        // empty even though requests existed on the server.
        if (firstActive) setEventId(firstActive.id);
      } else if (!cur.isPublic) {
        setEventId(firstActive?.id ?? null);
      }
    }
  }, [events.length, eventId, events]);

  // Refresh events list periodically to catch newly created events
  useEffect(() => {
    let mounted = true;
    const refreshEvents = async () => {
      const mod = await import("@/lib/karaoke");
      await mod.refreshEventsFromRemote?.();
      if (mounted) setEvents(mod.getEvents?.() || []);
    };
    refreshEvents();
    const i = setInterval(refreshEvents, 5000); // Refresh every 5 seconds
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  // Fetch requests on mount and set up periodic refresh + realtime subscription
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const mod = await import("@/lib/karaoke");
      console.log("[Host] Refreshing requests from remote...");
      await mod.refreshRequestsFromRemote();
      if (mounted) {
        console.log(
          "[Host] Requests refreshed. Current total:",
          mod.getRequests().length,
        );
        setTick((t) => t + 1);
      }
    };
    // Initial load immediately
    run();
    // Then every 2 seconds
    const i = setInterval(run, 2000);
    let unsub = () => {};
    (async () => {
      const mod = await import("@/lib/karaoke");
      unsub = mod.subscribeRequestsRealtime(() => {
        console.log("[Host] Realtime update triggered");
        setTick((t) => t + 1);
      });
    })();
    return () => {
      mounted = false;
      clearInterval(i);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (eventId) {
      // If switching from a different event, archive the previous event's requests
      if (previousEventRef.current && previousEventRef.current !== eventId) {
        archiveEventRequests(previousEventRef.current);
      }
      previousEventRef.current = eventId;
      setHostSelectedEvent(eventId);
    }
  }, [eventId]);

  const now = eventId ? getNowSinging(eventId) : undefined;

  const all = useMemo(() => {
    if (!eventId) return [];
    const allRequests = getRequests();
    const requests = getRequestsByEvent(eventId);
    // Debug log
    console.log(
      `[Host] Request filter - Event: ${eventId}, Total: ${allRequests.length}, For this event: ${requests.length}`,
    );
    if (requests.length > 0) {
      console.log("[Host] Requests for event:", requests);
    } else if (allRequests.length > 0) {
      console.log(
        "[Host] No requests match event. Available requests by eventId:",
        allRequests.map((r) => ({
          id: r.id,
          eventId: r.eventId,
          status: r.status,
        })),
      );
    }
    return requests;
  }, [eventId, tick]);

  // Clean up orphaned requests (those belonging to deleted/archived events)
  // Only run this after events have loaded to avoid deleting requests for events that haven't loaded yet
  useEffect(() => {
    if (events.length === 0) return; // Wait for events to load

    const allRequests = getRequests();
    if (allRequests.length === 0) return; // Nothing to clean

    const validEventIds = new Set(events.map((e) => e.id));

    // Find orphaned requests (only delete if we have events AND request doesn't match any)
    const orphaned = allRequests.filter((r) => !validEventIds.has(r.eventId));

    // Only delete orphans if there are actual archived/deleted events
    // Check if any orphaned request's eventId looks intentionally deleted (was in archive, etc)
    const recentlyCreatedOrphanThreshold = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const actualOrphans = orphaned.filter(
      (r) => r.createdAt < recentlyCreatedOrphanThreshold,
    );

    if (actualOrphans.length > 0) {
      const cleaned = allRequests.filter(
        (r) => !actualOrphans.some((o) => o.id === r.id),
      );
      setRequests(cleaned);
    }
  }, [events]);

  // Session-wide identity index. Unlike the old duplicate-IP check this
  // includes COMPLETED requests, so a singer who performed earlier under a
  // different name is still linked to their new submission.
  const identity = useMemo(
    () =>
      eventId
        ? buildIdentityIndex(getRequestsByEvent(eventId))
        : buildIdentityIndex([]),
    [eventId, tick],
  );

  const personForRequest = (r?: RequestItem | null) =>
    r ? identity.byRequestId.get(r.id) : undefined;

  // Flagged people the host has not yet dismissed. Acknowledging is keyed to
  // the person's current names, so a brand new alias brings them back.
  const unackedFlagged = useMemo(() => {
    if (!eventId) return identity.flagged;
    const acked = getAcknowledgedSignatures(eventId);
    return identity.flagged.filter((p) => !isAcknowledged(eventId, p, acked));
  }, [identity, eventId, ackTick]);

  // Per-individual turn counts. A group entry like "Bill and Mary" credits
  // each person separately, so Bill's first song is visible even though Mary
  // has already sung.
  const pStats = useMemo(
    () => (eventId ? participantStats(getRequestsByEvent(eventId)) : new Map()),
    [eventId, tick],
  );

  // The night in performance order, for the set list card.
  const setList = useMemo(
    () => (eventId ? buildSetList(getRequestsByEvent(eventId)) : []),
    [eventId, tick],
  );

  // Self-healing: includes any approved singer missing from the stored
  // roster, so a lost sync can never hide them from the queue.
  const singerOrder = useMemo(
    () => (eventId ? getEffectiveSingerOrder(eventId) : []),
    [eventId, tick],
  );

  const bySinger = useMemo(() => {
    const map = new Map<
      string,
      { performing?: RequestItem; approved?: RequestItem[] }
    >();
    for (const r of all) {
      if (r.status === "complete") continue;
      const key = singerKey(r.singer);
      if (!map.has(key)) map.set(key, {});
      const entry = map.get(key)!;
      if (r.status === "performing") entry.performing = r;
      else if (r.status === "approved") (entry.approved ||= []).push(r);
    }
    for (const entry of map.values()) {
      if (entry.approved)
        entry.approved.sort((a, b) => a.createdAt - b.createdAt);
    }
    return map;
  }, [all]);

  const pending = useMemo(() => {
    return all
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [all]);

  const onDragStart = (id: string) => setDraggingId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: string) => {
    if (!draggingId || !eventId) {
      setDraggingId(null);
      return;
    }
    const ids = all
      .filter((r) => r.status === "approved" || r.status === "performing")
      .map((r) => r.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDraggingId(null);
      return;
    }
    console.log(
      "[Host] Reordering requests - moving from index",
      from,
      "to",
      to,
    );
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderRequests(eventId, ids);
    persistRequestOrderToRemote(eventId, ids)
      .then(() => {
        console.log("[Host] Request order synced to remote successfully");
        setTick((t) => t + 1);
      })
      .catch((err) => {
        console.error("[Host] Failed to sync request order to remote:", err);
        setTick((t) => t + 1);
      });
    setDraggingId(null);
  };

  const onDragStartSinger = (key: string) => setDragSinger(key);
  const onDropSinger = (targetKey: string) => {
    if (!eventId || !dragSinger || syncingOrder) {
      console.warn("[Host] Drag operation blocked - already syncing or invalid state");
      setDragSinger(null);
      return;
    }

    const order = getSingerOrder(eventId);
    const from = order.indexOf(dragSinger);
    const to = order.indexOf(targetKey);

    if (from === -1 || to === -1) {
      console.error(
        "[Host] Drag failed - singer not found",
        { from, to, dragSinger, targetKey },
      );
      setDragSinger(null);
      return;
    }

    if (from === to) {
      console.log("[Host] Drag cancelled - same position");
      setDragSinger(null);
      return;
    }

    console.log(
      "[Host] Starting reorder - moving singer from index",
      from,
      "to",
      to,
      "order length:",
      order.length,
    );

    // Save the state before making changes (for rollback if needed)
    const originalOrder = [...order];

    // Apply the move locally
    moveSingerToIndex(eventId, dragSinger, to);
    const newOrder = getSingerOrder(eventId);

    console.log(
      "[Host] Order after local move:",
      originalOrder,
      "→",
      newOrder,
    );

    // Mark as syncing
    setSyncingOrder(true);
    setDragSinger(null);

    // Sync to backend
    persistSingerOrderToRemote(eventId)
      .then(() => {
        console.log("[Host] ✓ Singer order synced to remote successfully");
        setSyncingOrder(false);
        setTick((t) => t + 1);
      })
      .catch((err) => {
        console.error(
          "[Host] ✗ Failed to sync singer order to remote:",
          err,
        );
        // Rollback to original order on failure
        console.log("[Host] Rolling back to original order after sync failure");
        setSingerOrder(eventId, originalOrder);
        setSyncingOrder(false);
        setTick((t) => t + 1);
      });
  };

  const handleStartShift = async () => {
    if (!shiftForm.eventName.trim() || !shiftForm.location.trim()) {
      console.warn("[Host] Missing required fields");
      return;
    }

    setCreatingShift(true);
    try {
      // Create a slug ID from the event name (lowercase, replace spaces with hyphens)
      const eventId = shiftForm.eventName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      // Date only, pinned to noon so no timezone offset can shift the day.
      const shiftDateTime = dateOnlyToISO(shiftForm.dateTime);

      const newEvent: EventItem = {
        id: eventId,
        name: shiftForm.eventName,
        location: shiftForm.location,
        datetime: shiftDateTime,
        isPublic: true,
        requestsOpen: shiftForm.requestsOpen,
      };

      await upsertEvent(newEvent);
      setEventId(eventId);
      setHostSelectedEvent(eventId);

      // Reset form and close modal
      setShowStartShiftModal(false);
      setShiftForm({
        eventName: "",
        location: "",
        dateTime: getCurrentMSTDate(),
        requestsOpen: true,
      });

      console.log("[Host] Shift started:", newEvent);
    } catch (err) {
      console.error("[Host] Error starting shift:", err);
    } finally {
      setCreatingShift(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-extrabold">Host Dashboard</h1>
          {eventId && (
            <p className="text-sm text-muted-foreground mt-1">
              {events.find((e) => e.id === eventId)?.name} •{" "}
              {events.find((e) => e.id === eventId)?.location}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {eventId ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowStartShiftModal(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                New Shift
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const current = events.find((e) => e.id === eventId);
                  if (current) {
                    upsertEvent({
                      ...current,
                      requestsOpen: !current.requestsOpen,
                    }).catch(() => {});
                  }
                }}
              >
                {events.find((e) => e.id === eventId)?.requestsOpen
                  ? "Close Requests"
                  : "Open Requests"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={endingShift}
                onClick={async () => {
                  if (
                    !confirm(
                      "End this shift?\n\nThe event comes off the main screen and stops taking requests. Tonight's songs are kept for the set list and stats.",
                    )
                  )
                    return;
                  setEndingShift(true);
                  try {
                    const res = await endShift(eventId);
                    if (!res.ok) {
                      alert(
                        `Could not end the shift.\n\n${res.reason || "Unknown error"}\n\n` +
                          `The event is still live on the main page. Try signing out and back in, then end the shift again.`,
                      );
                      return;
                    }
                    // Mark it private in local component state too. The events
                    // poll is on a 5s cycle, and until it runs the auto-select
                    // effect would see a still-public event and reopen the one
                    // we just ended.
                    setEvents((prev) =>
                      prev.map((e) =>
                        e.id === eventId
                          ? { ...e, isPublic: false, requestsOpen: false }
                          : e,
                      ),
                    );
                    setEventId(null);
                    setHostSelectedEvent("");
                    setTick((t) => t + 1);
                  } finally {
                    setEndingShift(false);
                  }
                }}
              >
                {endingShift ? "Ending…" : "End Shift"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setShowStartShiftModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Start New Shift
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => nav("/host/archive")}
          >
            Archive
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => nav("/host/settings")}
          >
            Settings
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              logoutHost();
              setAuthed(false);
              nav("/host/login");
            }}
          >
            Log out
          </Button>
        </div>
      </div>



      {!eventId ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-2">No event selected</p>
            {events.some((e) => e.isPublic) ? (
              <>
                <p className="text-sm text-muted-foreground">
                  There is a live event with requests waiting. Open it to
                  manage the queue.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {events
                    .filter((e) => e.isPublic)
                    .map((e) => (
                      <Button
                        key={e.id}
                        size="sm"
                        onClick={() => {
                          setEventId(e.id);
                          setHostSelectedEvent(e.id);
                          setTick((t) => t + 1);
                        }}
                      >
                        Open “{e.name}”
                      </Button>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Start a shift to begin taking requests.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Manual Entry</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  placeholder="Singer"
                  value={manual.singer}
                  onChange={(e) =>
                    setManual({ ...manual, singer: e.target.value })
                  }
                />
                <Input
                  placeholder="Song Title"
                  value={manual.songTitle}
                  onChange={(e) =>
                    setManual({ ...manual, songTitle: e.target.value })
                  }
                />
                <Input
                  placeholder="Artist"
                  value={manual.artist}
                  onChange={(e) =>
                    setManual({ ...manual, artist: e.target.value })
                  }
                />
                <Select
                  value={manual.status}
                  onValueChange={(v) =>
                    setManual({ ...manual, status: v as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="performing">Start Now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    console.log("[Host] Manual entry Add button clicked");
                    if (!eventId) {
                      console.warn("[Host] No eventId selected");
                      return;
                    }
                    const s = manual.singer.trim();
                    const t = manual.songTitle.trim();
                    const a = manual.artist.trim();
                    console.log("[Host] Manual entry data:", {
                      s,
                      t,
                      a,
                      status: manual.status,
                    });
                    if (!s || !t || !a) {
                      console.warn(
                        "[Host] Missing required fields - cannot submit",
                      );
                      return;
                    }
                    try {
                      console.log("[Host] Calling addRequestAsHost with:", {
                        eventId,
                        singer: s,
                        songTitle: t,
                        artist: a,
                        status: manual.status,
                      });
                      const res = await addRequestAsHost({
                        eventId,
                        singer: s,
                        songTitle: t,
                        artist: a,
                        status: manual.status,
                      });
                      console.log("[Host] addRequestAsHost response:", res);
                      if (res.ok) {
                        console.log(
                          "[Host] Request added successfully with id:",
                          res.id,
                        );
                        if (manual.status !== "pending") {
                          ensureSingerInOrder(eventId, s);
                          setSingerDisplayName(eventId, singerKey(s), s);
                        }
                        setManual({
                          singer: "",
                          songTitle: "",
                          artist: "",
                          status: manual.status,
                        });
                        setTick((x) => x + 1);
                      } else {
                        console.error(
                          "[Host] Request failed:",
                          res.reason || "Unknown error",
                        );
                      }
                    } catch (err) {
                      console.error(
                        "[Host] Exception during manual entry:",
                        err,
                      );
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
          {authMode === "legacy" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
              <span className="font-semibold text-amber-300">
                Legacy login in use.
              </span>{" "}
              <span className="text-muted-foreground">
                You are signed in with the in-browser account, not Supabase
                Auth. Do not run supabase-rls-step2.sql while in this mode, it
                restricts writes to authenticated sessions and would lock this
                dashboard.
              </span>
            </div>
          )}

          <NightAtAGlance
            now={now}
            onDeck={eventId ? getOnDeck(eventId) : undefined}
            singersInQueue={singerOrder.length}
            pendingCount={pending.length}
            sungCount={all.filter((r) => r.status === "complete").length}
            flaggedCount={unackedFlagged.length}
            nowPerson={personForRequest(now)}
            onDeckPerson={personForRequest(
              eventId ? getOnDeck(eventId) : undefined,
            )}
          />

          {unackedFlagged.length > 0 && (
            <Card className="border-red-500/40 bg-red-500/5">
              <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>⚠️</span>
                  Same person, different names ({unackedFlagged.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (!eventId) return;
                    acknowledgeAll(eventId, unackedFlagged);
                    setAckTick((t) => t + 1);
                  }}
                >
                  Dismiss all
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-3">
                  These devices have submitted under more than one name tonight.
                  Dismissing clears the alert here but keeps the flag on the
                  queue row. If they use another new name, they return.
                </p>
                <ul className="space-y-2">
                  {unackedFlagged.map((p) => (
                    <li
                      key={p.id}
                      className={`rounded-md p-2.5 text-sm ${p.rowClass} ring-1 ring-border`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.badgeClass}`}
                        >
                          {p.short}
                        </span>
                        <span className="font-medium">
                          {p.aliases.map((a) => `"${a.name}"`).join("  →  ")}
                        </span>
                        {p.completedCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {p.completedCount} already sung
                          </span>
                        )}
                        {p.activeCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                            {p.activeCount} in queue
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs ml-auto"
                          onClick={() => {
                            if (!eventId) return;
                            acknowledgePerson(eventId, p);
                            setAckTick((t) => t + 1);
                          }}
                        >
                          ✓ Got it
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {p.aliases.map((a) => (
                          <span key={a.name}>
                            "{a.name}" · {agoLabel(a.lastAt)}
                          </span>
                        ))}
                        {p.ips.length > 0 && (
                          <span className="font-mono opacity-70">
                            {p.ips.join(", ")}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">
                  Active Queue ({singerOrder.length})
                </CardTitle>
                {/* Queue Status Badge */}
                <span
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${
                    singerOrder.length >= 10
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : singerOrder.length >= 5
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-destructive/20 text-destructive"
                  }`}
                >
                  {singerOrder.length} of 15
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Queue alert for low capacity */}
              {singerOrder.length < 5 && (
                <div className="bg-destructive/10 border border-destructive/30 p-3 rounded-lg text-sm">
                  <p className="text-destructive font-semibold">
                    ⚠️ Queue Running Low
                  </p>
                  <p className="text-destructive/80 text-xs mt-1">
                    Only {singerOrder.length} singers queued. Approve pending
                    requests to keep the party going!
                  </p>
                </div>
              )}
              {singerOrder.length === 0 ? (
                <p className="text-muted-foreground">No singers in roster.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-semibold w-8">
                          #
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-32">
                          Singer
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-40">
                          Song Title
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-32">
                          Artist
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-44">
                          Who / Device
                        </th>
                        <th className="text-left py-2 px-2 font-semibold">
                          Status
                        </th>
                        <th className="text-left py-2 px-2 font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {singerOrder
                        .map((key) => {
                          const entry = bySinger.get(key);
                          const current =
                            entry?.performing || entry?.approved?.[0];
                          if (!current) return null;
                          return { key, entry, current };
                        })
                        .filter(Boolean)
                        .map((row, i) => {
                          const { key, current } = row as any;
                          const name =
                            (eventId && getSingerDisplayName(eventId, key)) ||
                            current?.singer ||
                            key;
                          const isUpNext =
                            i === 0 && current?.status === "approved";
                          const person = personForRequest(current);
                          return (
                            <tr
                              key={key}
                              draggable={!syncingOrder}
                              onDragStart={() => onDragStartSinger(key)}
                              onDragOver={onDragOver}
                              onDrop={() => onDropSinger(key)}
                              className={`border-b transition ${
                                syncingOrder ? "opacity-50 cursor-not-allowed" : ""
                              } ${
                                isUpNext
                                  ? "bg-amber-500/20 hover:bg-amber-500/30"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <td className="py-3 px-2 font-semibold text-center">
                                {i + 1}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-base">
                                    {name}
                                  </span>
                                  {isUpNext && (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/30 text-amber-600 dark:text-amber-400">
                                      NEXT
                                    </span>
                                  )}
                                  <DuoBadge request={current} />
                                  <AliasFlag person={person} />
                                  <TurnsBadge
                                    request={current}
                                    stats={pStats}
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-2">
                                {current?.songTitle || "—"}
                              </td>
                              <td className="py-3 px-2">
                                {current?.artist || "—"}
                              </td>
                              <td className="py-3 px-2">
                                <PersonCell
                                  person={person}
                                  ip={current?.ip}
                                  currentName={current?.singer}
                                />
                              </td>
                              <td className="py-3 px-2">
                                <span
                                  className={`text-xs px-2 py-1 rounded capitalize whitespace-nowrap ${
                                    current?.status === "performing"
                                      ? "bg-primary/20 text-primary"
                                      : current?.status === "approved"
                                        ? "bg-accent/20 text-accent"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {current?.status || "—"}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    title="Move up"
                                    onClick={() => {
                                      if (eventId) {
                                        moveSingerUp(eventId, key);
                                        persistSingerOrderToRemote(
                                          eventId,
                                        ).catch(() => {});
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    title="Move down"
                                    onClick={() => {
                                      if (eventId) {
                                        moveSingerDown(eventId, key);
                                        persistSingerOrderToRemote(
                                          eventId,
                                        ).catch(() => {});
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs"
                                    onClick={async () => {
                                      if (!eventId) return;
                                      const nm = (
                                        prompt("Singer", name) ?? name
                                      ).trim();
                                      const st = (
                                        prompt(
                                          "Song Title",
                                          current?.songTitle || "",
                                        ) ??
                                        (current?.songTitle || "")
                                      ).trim();
                                      const ar = (
                                        prompt(
                                          "Artist",
                                          current?.artist || "",
                                        ) ??
                                        (current?.artist || "")
                                      ).trim();
                                      setSingerDisplayName(
                                        eventId,
                                        singerKey(nm),
                                        nm,
                                      );
                                      if (current) {
                                        await updateRequestInfo(current.id, {
                                          singer: nm,
                                          songTitle: st,
                                          artist: ar,
                                        });
                                      }
                                      setTick((t) => t + 1);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  {current &&
                                    current.status !== "performing" &&
                                    current.status !== "complete" && (
                                      <Button
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() =>
                                          transitionRequest(
                                            current.id,
                                            "performing",
                                          )
                                        }
                                      >
                                        Start
                                      </Button>
                                    )}
                                  {current &&
                                    current.status === "performing" && (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-8 text-xs"
                                        onClick={() => {
                                          console.log(
                                            "[Host] Completing song:",
                                            current.id,
                                            "Singer key:",
                                            key,
                                            "Singer name:",
                                            current.singer,
                                          );
                                          transitionRequest(
                                            current.id,
                                            "complete",
                                          );
                                          if (eventId) {
                                            console.log(
                                              "[Host] Deleting singer from queue:",
                                              key,
                                              "from event:",
                                              eventId,
                                            );
                                            deleteSinger(eventId, key);
                                            setTick((t) => t + 1);
                                          }
                                        }}
                                      >
                                        Complete
                                      </Button>
                                    )}
                                  {/* Remove just this song. Singer stays in
                                      the queue if they have others. */}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-9 w-9 text-amber-500 hover:bg-amber-500/15"
                                    title={`Remove this song (${current?.songTitle || "song"}) but keep ${name} in the queue`}
                                    disabled={
                                      removingSinger === key || !current?.id
                                    }
                                    onClick={async () => {
                                      if (!eventId || !current?.id) return;
                                      const others =
                                        (bySinger.get(key)?.approved?.length ||
                                          0) +
                                        (bySinger.get(key)?.performing
                                          ? 1
                                          : 0) -
                                        1;
                                      const msg =
                                        others > 0
                                          ? `Remove "${current.songTitle}"? ${name} stays in the queue with ${others} more song${others === 1 ? "" : "s"}.`
                                          : `Remove "${current.songTitle}"? It is ${name}'s only song, so they will leave the queue too.`;
                                      if (!confirm(msg)) return;
                                      setRemovingSinger(key);
                                      try {
                                        const res = await removeSongFromQueue(
                                          eventId,
                                          current.id,
                                        );
                                        if (!res.ok) {
                                          alert(
                                            `Could not remove that song: ${res.reason || "unknown error"}`,
                                          );
                                        }
                                      } finally {
                                        setRemovingSinger(null);
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    <Music className="h-4 w-4" />
                                  </Button>

                                  {/* Remove the singer and everything queued
                                      under their name. */}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-9 w-9 text-destructive hover:bg-destructive/15"
                                    title={`Remove ${name} and all their songs`}
                                    disabled={removingSinger === key}
                                    onClick={async () => {
                                      if (!eventId) return;
                                      const songCount =
                                        (bySinger.get(key)?.approved?.length ||
                                          0) +
                                        (bySinger.get(key)?.performing ? 1 : 0);
                                      const msg =
                                        songCount > 1
                                          ? `Remove ${name} and all ${songCount} of their queued songs?`
                                          : `Remove ${name} from the queue?`;
                                      if (!confirm(msg)) return;
                                      setRemovingSinger(key);
                                      try {
                                        const res =
                                          await removeSingerCompletely(
                                            eventId,
                                            key,
                                          );
                                        if (!res.ok) {
                                          alert(
                                            `Could not remove ${name}: ${res.reason || "unknown error"}`,
                                          );
                                        }
                                      } finally {
                                        setRemovingSinger(null);
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                Pending Requests ({pending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {pending.length === 0 ? (
                <p className="text-muted-foreground">No pending requests.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-semibold min-w-32">
                          Singer
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-40">
                          Song Title
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-32">
                          Artist
                        </th>
                        <th className="text-left py-2 px-2 font-semibold min-w-44">
                          Who / Device
                        </th>
                        <th className="text-left py-2 px-2 font-semibold">
                          Submitted
                        </th>
                        <th className="text-left py-2 px-2 font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((r) => {
                        const person = personForRequest(r);
                        return (
                          <tr
                            key={r.id}
                            className={`border-b hover:bg-muted/50 transition ${person?.multiName ? person.rowClass : ""}`}
                          >
                            <td className="py-3 px-2 font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-base">
                                  {r.singer}
                                </span>
                                <DuoBadge request={r} />
                                <AliasFlag person={person} />
                                {eventId &&
                                  detectNameCollision(
                                    r,
                                    getRequestsByEvent(eventId),
                                  ) && (
                                    <span
                                      className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-500/25 text-orange-700 dark:text-orange-200 ring-1 ring-orange-500/50 whitespace-nowrap"
                                      title="Another person with this same name is already in the queue. Approving will prompt you to tell them apart."
                                    >
                                      ⚠ NAME CLASH
                                    </span>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 px-2">{r.songTitle}</td>
                            <td className="py-3 px-2">{r.artist}</td>
                            <td className="py-3 px-2">
                              <PersonCell
                                person={person}
                                ip={r.ip}
                                currentName={r.singer}
                              />
                            </td>
                            <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(r.createdAt).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={async () => {
                                    if (!eventId) return;

                                    // The queue is keyed by name, so a second
                                    // person with the same name would stack on
                                    // top of the first. Catch that here.
                                    let nameToUse = r.singer;
                                    const clash = detectNameCollision(
                                      r,
                                      getRequestsByEvent(eventId),
                                    );
                                    if (clash) {
                                      const other = clash.otherPerson;
                                      const detail = other
                                        ? `already in the queue from a different device${
                                            other.ips.length
                                              ? ` (${other.ips[0]})`
                                              : ""
                                          }`
                                        : "already in the queue from a different device";
                                      const entered = prompt(
                                        `Heads up: "${clash.name}" is ${detail}.\n\n` +
                                          `Approving with the same name would stack them into one queue slot.\n\n` +
                                          `Enter a name to tell them apart, or press Cancel to approve as-is:`,
                                        clash.suggestion,
                                      );
                                      if (entered && entered.trim()) {
                                        nameToUse = entered.trim();
                                        await updateRequestInfo(r.id, {
                                          singer: nameToUse,
                                        });
                                      }
                                    }

                                    ensureSingerInOrder(eventId, nameToUse);
                                    setSingerDisplayName(
                                      eventId,
                                      singerKey(nameToUse),
                                      nameToUse,
                                    );
                                    await transitionRequest(r.id, "approved");
                                    await persistSingerOrderToRemote(eventId);
                                    setTick((t) => t + 1);
                                  }}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 text-xs"
                                  onClick={async () => {
                                    if (
                                      confirm(
                                        `Delete ${r.singer} - ${r.songTitle}?`,
                                      )
                                    ) {
                                      await deleteRequest(r.id);
                                      setTick((t) => t + 1);
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reference only - kept at the bottom, below the live queues. */}
          <SetListCard entries={setList} />
        </>
      )}

      {/* Start Shift Modal */}
      <Dialog open={showStartShiftModal} onOpenChange={setShowStartShiftModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Shift</DialogTitle>
            <DialogDescription>
              Create a new karaoke event for tonight.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-name">Event Name *</Label>
              <Input
                id="event-name"
                placeholder="e.g., Thursday Karaoke"
                value={shiftForm.eventName}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, eventName: e.target.value })
                }
                disabled={creatingShift}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                placeholder="e.g., The Place Bar"
                value={shiftForm.location}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, location: e.target.value })
                }
                disabled={creatingShift}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-time">Date</Label>
              <Input
                id="date-time"
                type="date"
                value={shiftForm.dateTime}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, dateTime: e.target.value })
                }
                disabled={creatingShift}
              />
            </div>
            <div className="flex items-center space-x-3">
              <Switch
                id="requests-open"
                checked={shiftForm.requestsOpen}
                onCheckedChange={(checked) =>
                  setShiftForm({ ...shiftForm, requestsOpen: checked })
                }
                disabled={creatingShift}
              />
              <Label htmlFor="requests-open">Requests Open</Label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowStartShiftModal(false)}
                disabled={creatingShift}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartShift}
                disabled={creatingShift || !shiftForm.eventName.trim()}
              >
                {creatingShift ? "Starting..." : "Start Shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Top-of-dashboard summary built for glancing at across a dark room:
 * who is on now, who is next, and the four numbers that answer
 * "how long until I sing" without reading the table.
 */
function NightAtAGlance({
  now,
  onDeck,
  singersInQueue,
  pendingCount,
  sungCount,
  flaggedCount,
  nowPerson,
  onDeckPerson,
}: {
  now?: RequestItem | null;
  onDeck?: RequestItem | null;
  singersInQueue: number;
  pendingCount: number;
  sungCount: number;
  flaggedCount: number;
  nowPerson?: PersonIdentity;
  onDeckPerson?: PersonIdentity;
}) {
  const Slot = ({
    label,
    req,
    person,
    accent,
  }: {
    label: string;
    req?: RequestItem | null;
    person?: PersonIdentity;
    accent: string;
  }) => (
    <div className="min-w-0 flex-1">
      <div
        className={`text-[11px] font-bold uppercase tracking-widest ${accent}`}
      >
        {label}
      </div>
      {req ? (
        <>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-2xl sm:text-3xl font-extrabold leading-tight truncate">
              {req.singer}
            </span>
            {req.isDuo && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-teal-500/25 text-teal-200 ring-1 ring-teal-400/50">
                DUET{req.partner ? ` · ${req.partner}` : ""}
              </span>
            )}
            {person?.multiName && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/30 text-red-200 ring-1 ring-red-400/60">
                ⚠ {person.aliases.length} NAMES
              </span>
            )}
          </div>
          <div className="text-base sm:text-lg text-foreground/85 truncate">
            {req.songTitle}
            {req.artist ? (
              <span className="text-foreground/55"> — {req.artist}</span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="text-2xl font-bold text-muted-foreground/60 mt-0.5">
          —
        </div>
      )}
    </div>
  );

  const Stat = ({
    n,
    label,
    tone = "",
  }: {
    n: number;
    label: string;
    tone?: string;
  }) => (
    <div className="rounded-lg border bg-background/40 px-3 py-2 text-center min-w-[84px]">
      <div className={`text-3xl font-extrabold leading-none ${tone}`}>{n}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );

  return (
    <Card className="border-primary/40 bg-gradient-to-r from-primary/15 to-accent/10">
      <CardContent className="py-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex flex-col sm:flex-row gap-5 flex-1 min-w-0">
            <Slot
              label="Now singing"
              req={now}
              person={nowPerson}
              accent="text-primary"
            />
            <div className="hidden sm:block w-px bg-border/60 self-stretch" />
            <Slot
              label="On deck"
              req={onDeck}
              person={onDeckPerson}
              accent="text-amber-400"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Stat n={singersInQueue} label="In queue" />
            <Stat
              n={pendingCount}
              label="Pending"
              tone={pendingCount > 0 ? "text-amber-400" : ""}
            />
            <Stat n={sungCount} label="Sung" />
            <Stat
              n={flaggedCount}
              label="Flagged"
              tone={flaggedCount > 0 ? "text-red-400" : ""}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The night so far, in the order people actually sang.
 *
 * Answers "who sang where" at a glance, so the host can keep rotation fair
 * without having to remember it. Newest first, since the recent end of the
 * night is what usually gets questioned.
 */
function SetListCard({ entries }: { entries: SetListEntry[] }) {
  const [open, setOpen] = useState(true);
  const summary = useMemo(() => summariseSetList(entries), [entries]);

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Set list</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            No songs finished yet. Completed songs appear here in order.
          </p>
        </CardContent>
      </Card>
    );
  }

  const newestFirst = [...entries].reverse();
  const repeats = summary.filter((s) => s.count > 1);

  return (
    <Card>
      <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          Set list — {entries.length} sung
          {repeats.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {repeats.length} repeat{repeats.length === 1 ? "" : "s"}
            </span>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-4">
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {summary.map((s) => (
                <span
                  key={s.singer}
                  className={`text-xs px-2 py-1 rounded-md border ${
                    s.count > 1
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                      : "bg-muted/40 border-border text-muted-foreground"
                  }`}
                  title={`Sang at position ${s.positions.join(", ")}`}
                >
                  {s.singer}
                  {s.count > 1 && (
                    <span className="font-bold"> ×{s.count}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <ol className="space-y-1.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
            {newestFirst.map((e) => (
              <li
                key={e.request.id}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-background/30 px-3 py-2"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                  {e.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{e.singer}</span>
                    {e.nthForSinger > 1 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-700 dark:text-amber-200">
                        {e.nthForSinger}
                        {e.nthForSinger === 2
                          ? "nd"
                          : e.nthForSinger === 3
                            ? "rd"
                            : "th"}{" "}
                        SONG
                      </span>
                    )}
                    {e.isDuo && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/25 text-teal-700 dark:text-teal-200">
                        DUET{e.partner ? ` · ${e.partner}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {e.songTitle}
                    {e.artist ? ` — ${e.artist}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{formatClock(e.at)}</div>
                  {e.gapMinutes != null && (
                    <div className="opacity-60">+{e.gapMinutes}m</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Loud inline flag for a singer whose device has used other names tonight.
 * Sits directly beside the name so it is caught while scanning, rather than
 * requiring the Who/Device column to be read.
 */
function AliasFlag({ person }: { person?: PersonIdentity }) {
  if (!person?.multiName) return null;
  const others = person.aliases.map((a) => `"${a.name}" ${agoLabel(a.lastAt)}`);
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/30 text-red-700 dark:text-red-200 ring-1 ring-red-500/60 whitespace-nowrap"
      title={`Same device as: ${others.join(" · ")}`}
    >
      ⚠ ALSO {person.aliases.length - 1} OTHER
      {person.aliases.length - 1 === 1 ? " NAME" : " NAMES"}
      {person.completedCount > 0 ? ` · SUNG ${person.completedCount}×` : ""}
    </span>
  );
}

/** Small "DUET" pill shown next to a singer name. */
function DuoBadge({ request }: { request?: RequestItem | null }) {
  if (!request?.isDuo) return null;
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/25 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/40 whitespace-nowrap"
      title={
        request.partner
          ? `Duet with ${request.partner}`
          : "Marked as a duet / group song"
      }
    >
      DUET{request.partner ? ` · ${request.partner}` : ""}
    </span>
  );
}

/**
 * Shows which physical person a request belongs to. When the same device or IP
 * has used more than one name tonight the cell is colour-coded and lists every
 * alias with how long ago it was used.
 */
function PersonCell({
  person,
  ip,
  currentName,
}: {
  person?: PersonIdentity;
  ip?: string;
  currentName?: string;
}) {
  const displayIp = ip && ip !== "unknown" ? ip : "no IP";

  if (!person) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {displayIp}
      </span>
    );
  }

  const others = person.aliases.filter(
    (a) =>
      a.name.trim().toLowerCase() !== (currentName || "").trim().toLowerCase(),
  );

  return (
    <div className="flex flex-col gap-1" title={describePerson(person)}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${person.badgeClass}`}
        >
          {person.short}
        </span>
        {person.multiName && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/25 text-red-700 dark:text-red-300 ring-1 ring-red-500/50 whitespace-nowrap">
            ⚠ {person.aliases.length} NAMES
          </span>
        )}
        {person.completedCount > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap"
            title={`${person.completedCount} song(s) already performed tonight`}
          >
            sung {person.completedCount}×
          </span>
        )}
      </div>
      {person.multiName && others.length > 0 && (
        <div className="text-[11px] leading-tight text-muted-foreground">
          also:{" "}
          {others.map((a, i) => (
            <span key={a.name}>
              {i > 0 && ", "}
              <span className="font-medium text-foreground/80">"{a.name}"</span>{" "}
              <span className="opacity-70">{agoLabel(a.lastAt)}</span>
            </span>
          ))}
        </div>
      )}
      <span className="font-mono text-[10px] text-muted-foreground/70">
        {displayIp}
      </span>
    </div>
  );
}

/**
 * Shows which turn each individual is on for a group entry.
 *
 * "Bill and Mary" inherits Mary's history if you read it as one name, so Bill
 * gets pushed down the order on his first song of the night. Across this
 * venue's real history that happened 68 times, affecting 71 people. This
 * surfaces the per-person count so the running order can be set fairly.
 */
function TurnsBadge({
  request,
  stats,
}: {
  request?: RequestItem | null;
  stats: Map<string, any>;
}) {
  if (!request || !isGroupEntry(request.singer)) return null;
  const f = entryFairness(request, stats as any);
  if (f.participants.length < 2) return null;

  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
        f.hasWaitingNewcomer
          ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-200 ring-1 ring-emerald-500/50"
          : "bg-muted text-muted-foreground"
      }`}
      title={describeTurns(f)}
    >
      {f.hasWaitingNewcomer
        ? `★ ${f.firstTimers.join(", ")} 1st tonight`
        : describeTurns(f)}
    </span>
  );
}
