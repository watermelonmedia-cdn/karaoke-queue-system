import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatMSTTime } from "@/lib/utils";
import { Music, Users } from "lucide-react";
import {
  bootstrapEvents,
  getEvents,
  getSettings,
  getRequests,
  getRequestsByEvent,
  getNowSinging,
  getOnDeck,
  getPublicQueue,
  getTermsForEvent,
  addRequestAsync,
  refreshEventsFromRemote,
  refreshSettingsFromRemote,
  refreshRequestsFromRemote,
  subscribeEventsRealtime,
  subscribeSettingsRealtime,
  subscribeRequestsRealtime,
} from "@/lib/karaoke";
import type { EventItem } from "@/lib/karaoke";

export default function Index() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const doInit = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reset") === "1") {
        const mod = await import("@/lib/karaoke");
        mod.resetAllLocalData();
        history.replaceState(null, "", window.location.pathname);
      }
      const list = await bootstrapEvents();
      setEvents(list);
    };
    doInit();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshEventsFromRemote();
        if (mounted) {
          const evs = getEvents();
          console.log(
            "[Index] Events loaded:",
            evs.map((e) => ({ id: e.id, name: e.name, isPublic: e.isPublic })),
          );
          setEvents(evs);
        }
      } catch {}
    })();
    const unsub = subscribeEventsRealtime(() => {
      if (!mounted) return;
      const evs = getEvents();
      console.log("[Index] *** EVENT SUBSCRIPTION FIRED ***");
      console.log(
        "[Index] Events updated:",
        evs.map((e) => ({
          id: e.id,
          name: e.name,
          isPublic: e.isPublic,
          requestsOpen: e.requestsOpen,
        })),
      );
      setEvents(evs);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshSettingsFromRemote();
        setTick((t) => t + 1);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const unsub = subscribeSettingsRealtime(() => setTick((t) => t + 1));
    return () => unsub();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshRequestsFromRemote();
        if (mounted) setTick((t) => t + 1);
      } catch {}
    })();
    const unsub = subscribeRequestsRealtime(() => {
      if (!mounted) return;
      setTick((t) => t + 1);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const settings = getSettings();

  // Get the current active event
  // Show the most recent public event (regardless of open/closed status)
  // Only hide when End Shift is clicked (no public events)
  const activeEvent = [...events]
    .filter((e) => e.isPublic)
    .sort(
      (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
    )[0];
  const eventRequests = activeEvent ? getRequestsByEvent(activeEvent.id) : [];

  // Memoize queue state to ensure consistent calculations across all queue-related values
  const queueState = useMemo(() => {
    if (!activeEvent) return { pendingCount: 0, approvedCount: 0, nowSinging: null, onDeck: null, publicQueue: [] };

    const requests = getRequestsByEvent(activeEvent.id);
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const now = getNowSinging(activeEvent.id);
    const next = getOnDeck(activeEvent.id);
    const queue = getPublicQueue(activeEvent.id);

    return {
      pendingCount: pending,
      approvedCount: approved,
      nowSinging: now,
      onDeck: next,
      publicQueue: queue,
    };
  }, [activeEvent?.id, tick]);

  const { pendingCount, approvedCount, nowSinging, onDeck, publicQueue } = queueState;

  // Get the next 15 singers in the queue (approved status, excluding current performer)
  // Uses getPublicQueue() which respects the singerOrder from the host dashboard
  const upcomingQueue = useMemo(() => {
    // If someone is performing, start from the next person, otherwise show from the beginning
    if (nowSinging) {
      return publicQueue
        .filter((r) => r.singer !== nowSinging.singer)
        .slice(0, 15);
    }
    return publicQueue.slice(0, 15);
  }, [publicQueue, nowSinging]);

  if (!activeEvent) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 text-center space-y-3">
          <img
            src={settings.logoUrl || "/assets/logo.png"}
            alt="Logo"
            className="mx-auto h-[9.875rem] w-auto rounded"
          />
          <div className="mt-10">
            <div className="glass mx-auto max-w-lg rounded-2xl px-8 py-10">
              <p className="text-5xl">🎤✨</p>
              <div className="eyebrow mt-4 text-accent/90">Between shows</div>
              <h2 className="font-display mt-1 text-3xl md:text-4xl font-extrabold marquee-text">
                Coming Soon
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
                The host is preparing the stage. Warm up those vocal cords and
                get ready to shine, a new karaoke night is just around the
                corner.
              </p>
              <div className="rule-gold mx-auto mt-6 w-2/3 opacity-60" />
              <div className="pt-5 text-4xl animate-bounce text-primary">🎵</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isClosed = !activeEvent.requestsOpen;

  // Debug logging - triggers on every tick update
  console.log(
    `[Index] tick=${tick}, Active: ${activeEvent.name} (ID: ${activeEvent.id}), RequestsOpen: ${activeEvent.requestsOpen}, isClosed: ${isClosed}, Event requests: ${eventRequests.length} (${pendingCount} pending, ${approvedCount} approved), NOW: ${nowSinging?.singer || "none"}, ONDECK: ${onDeck?.singer || "none"}`,
  );
  // If there are requests, show them
  if (eventRequests.length > 0) {
    console.log(
      "[Index] Event requests:",
      eventRequests.map((r) => ({
        id: r.id,
        singer: r.singer,
        status: r.status,
        eventId: r.eventId,
      })),
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      {/* Logo and Welcome */}
      <div className="text-center space-y-2 mb-6">
        <img
          src={settings.logoUrl || "/assets/logo.png"}
          alt="Logo"
          className="mx-auto h-24 w-auto rounded"
        />
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight marquee-text">
          Sing! Laugh! Enjoy!
        </h1>
      </div>

      {/* Event Hero Section */}
      <Card className="spotlight rounded-2xl overflow-hidden">
        <CardContent className="relative p-7 sm:p-9">
          <div className="space-y-5">
            <div>
              <div className="eyebrow mb-2 text-accent/90">Now playing at</div>
              <h2 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.03] mb-4">
                {activeEvent.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full font-semibold border backdrop-blur",
                    isClosed
                      ? "bg-destructive/15 text-destructive border-destructive/40"
                      : "bg-emerald-500/12 text-emerald-300 border-emerald-500/40",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isClosed ? "bg-destructive" : "bg-emerald-400 animate-pulse",
                    )}
                  />
                  {isClosed ? "Requests Closed" : "Requests Open"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background/30 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
                  📅 {formatMSTTime(activeEvent.datetime)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background/30 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
                  📍 {activeEvent.location}
                </span>
              </div>
            </div>

            {isClosed && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-muted-foreground">
                This event is visible, but new song requests are paused.
              </p>
            )}

            {!isClosed && (
              <Button
                size="lg"
                onClick={() => {
                  const form = document.getElementById("submit-form-section");
                  if (form) {
                    form.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="mt-1 h-12 rounded-xl px-7 text-base font-bold shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:shadow-primary/50"
              >
                🎤 Request Your Song
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Request Queue Summary */}
      <Card className="glass rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Request Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending
              </p>
              <div className="bg-amber-500/20 p-4 rounded-lg text-center">
                <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                  {pendingCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  waiting to be approved
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Approved
              </p>
              <div className="bg-emerald-500/20 p-4 rounded-lg text-center">
                <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {approvedCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  in the queue
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Status */}
      <Card className="glass rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {nowSinging ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Now Singing
                </p>
                <div className="bg-primary/10 p-3 rounded-lg border-l-4 border-primary">
                  <p className="font-semibold text-lg">{nowSinging.singer}</p>
                  <p className="text-sm text-muted-foreground">
                    {nowSinging.songTitle} • {nowSinging.artist}
                  </p>
                </div>
              </div>
              {upcomingQueue.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Up Next ({upcomingQueue.length})
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-2 scrollbar-thin">
                    {upcomingQueue.map((request, idx) => {
                      const isUpNext = idx === 0;
                      return (
                        <div
                          key={request.id}
                          className={cn(
                            "p-3 rounded-lg border-l-4 transition-all",
                            isUpNext
                              ? "bg-amber-500/20 border-l-amber-500 ring-2 ring-amber-500/30"
                              : "bg-muted/50 border-l-accent",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col items-center min-w-fit">
                              <span
                                className={cn(
                                  "font-bold text-sm",
                                  isUpNext
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-accent",
                                )}
                              >
                                #{idx + 1}
                              </span>
                              {isUpNext && (
                                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  NEXT
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "truncate",
                                  isUpNext
                                    ? "font-bold text-base"
                                    : "font-semibold",
                                )}
                              >
                                {request.singer}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {request.songTitle} • {request.artist}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {upcomingQueue.length > 5 && (
                      <p className="text-xs text-muted-foreground/50 text-center py-2 italic">
                        ↓ Scroll to see more singers ↓
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : onDeck ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Up Next
                </p>
                <div className="bg-accent/10 p-3 rounded-lg border-l-4 border-accent ring-2 ring-accent/30">
                  <p className="font-semibold text-lg">{onDeck.singer}</p>
                  <p className="text-sm text-muted-foreground">
                    {onDeck.songTitle} • {onDeck.artist}
                  </p>
                </div>
              </div>
              {upcomingQueue.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Following ({upcomingQueue.length - 1})
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-2 scrollbar-thin">
                    {upcomingQueue.slice(1).map((request, idx) => {
                      return (
                        <div
                          key={request.id}
                          className="bg-muted/50 p-3 rounded-lg border-l-4 border-accent"
                        >
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-accent min-w-fit">
                              #{idx + 2}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate">
                                {request.singer}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {request.songTitle} • {request.artist}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {upcomingQueue.length > 5 && (
                      <p className="text-xs text-muted-foreground/50 text-center py-2 italic">
                        ↓ Scroll to see more singers ↓
                      </p>
                    )}
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground text-center py-2">
                Waiting for performance to start...
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-6">
              No one is singing yet. Be the first to submit!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Song Catalog Link */}
      <Card className="glass rounded-2xl">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Need help finding a song?</h3>
            <p className="text-sm text-muted-foreground">
              Browse our complete song catalog to find the perfect track
            </p>
          </div>
          <a
            href="https://www.karafun.com/karaoke/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Button>
              Browse Catalog →
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Submission Form */}
      <div id="submit-form-section">
        <RequestSubmissionForm eventId={activeEvent.id} isClosed={isClosed} />
      </div>
    </div>
  );
}

function RequestSubmissionForm({
  eventId,
  isClosed,
}: {
  eventId: string;
  isClosed: boolean;
}) {
  const [form, setForm] = useState({
    singer: "",
    songTitle: "",
    artist: "",
    isDuo: false,
    partner: "",
  });
  const [tos, setTos] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<{
    singer: string;
    songTitle: string;
    artist: string;
    isDuo?: boolean;
    partner?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const termsText = getTermsForEvent(eventId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!tos) {
      setError("You must accept the Terms of Service");
      return;
    }

    if (!form.singer || !form.songTitle || !form.artist) {
      setError("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const res = await addRequestAsync({
        eventId,
        singer: form.singer,
        songTitle: form.songTitle,
        artist: form.artist,
        isDuo: form.isDuo,
        partner: form.isDuo ? form.partner : "",
      });

      if (!res.ok) {
        setError(res.reason || "Failed to submit request");
        setSubmitting(false);
        return;
      }

      // Show success message with submitted data
      setSuccess({
        singer: form.singer,
        songTitle: form.songTitle,
        artist: form.artist,
        isDuo: form.isDuo,
        partner: form.partner,
      });
      setForm({
        singer: "",
        songTitle: "",
        artist: "",
        isDuo: false,
        partner: "",
      });
      setTos(false);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (isClosed) {
    return (
      <Card className="rounded-2xl border-destructive/40 bg-destructive/10 backdrop-blur">
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-lg font-semibold text-destructive">
            ⏸️ Song Requests Are Currently Closed
          </p>
          <p className="text-muted-foreground">
            The host has paused new song submissions for this event. Please
            check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="rounded-2xl border-emerald-500/40 bg-emerald-500/10 backdrop-blur mb-8">
        <CardContent className="p-8 text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h3 className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            Thank you for your request!
          </h3>
          <p className="text-lg text-emerald-700 dark:text-emerald-300">
            <strong>{success.singer}</strong> - {success.songTitle} by{" "}
            {success.artist}
          </p>
          {success.isDuo && (
            <p className="inline-flex items-center gap-2 rounded-full border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300">
              🎤🎤 Duet
              {success.partner ? ` with ${success.partner}` : ""}
            </p>
          )}
          <p className="text-muted-foreground">
            Your request is pending approval. Once approved, you'll see your
            spot in the singing order below. The host will review and add you to
            the queue shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass rounded-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Submit Your Song</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="text-sm font-semibold mb-3 text-muted-foreground">
            TERMS & RULES
          </div>
          <div className="rounded-md border p-4 text-sm text-muted-foreground bg-muted/30 whitespace-pre-line">
            {termsText}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="singer">Your Name *</Label>
              <Input
                id="singer"
                placeholder="Your name"
                value={form.singer}
                onChange={(e) => setForm({ ...form, singer: e.target.value })}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="song">Song Title *</Label>
              <Input
                id="song"
                placeholder="Song title"
                value={form.songTitle}
                onChange={(e) =>
                  setForm({ ...form, songTitle: e.target.value })
                }
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artist">Artist *</Label>
              <Input
                id="artist"
                placeholder="Artist name"
                value={form.artist}
                onChange={(e) => setForm({ ...form, artist: e.target.value })}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Duet / group song */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <label
              htmlFor="isDuo"
              className="flex items-start gap-3 cursor-pointer"
            >
              <Checkbox
                id="isDuo"
                checked={form.isDuo}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    isDuo: Boolean(v),
                    partner: v ? form.partner : "",
                  })
                }
                disabled={submitting}
                className="mt-0.5 h-5 w-5"
              />
              <span className="grid gap-0.5 leading-tight">
                <span className="font-semibold">
                  🎤🎤 This is a duet or group song
                </span>
                <span className="text-xs text-muted-foreground">
                  Tick this if more than one of you is singing.
                </span>
              </span>
            </label>
            {form.isDuo && (
              <div className="space-y-2 pl-8">
                <Label htmlFor="partner" className="text-sm">
                  Who’s singing with you?{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="partner"
                  placeholder="e.g. Sarah, or Sarah &amp; Mike"
                  value={form.partner}
                  onChange={(e) =>
                    setForm({ ...form, partner: e.target.value })
                  }
                  disabled={submitting}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="tos"
              checked={tos}
              onCheckedChange={(v) => setTos(Boolean(v))}
              disabled={submitting}
              className="h-5 w-5"
            />
            <Label htmlFor="tos" className="text-sm cursor-pointer">
              I accept the Terms of Service
            </Label>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="lg"
              disabled={
                submitting || !form.singer || !form.songTitle || !form.artist
              }
            >
              {submitting ? "Submitting..." : "Submit Your Song"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
