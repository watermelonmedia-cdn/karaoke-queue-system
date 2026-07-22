import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import type { EventItem, RequestItem } from "@/lib/karaoke";
import {
  addRequestAsync,
  bootstrapEvents,
  getEvents,
  getNowSinging,
  getRequestsByEvent,
  getDeviceId,
  estimateTimeToEndOfRoundMinutes,
  getTermsForEvent,
  getSingerOrder,
  getSingerDisplayName,
  getOnDeck,
  getPublicQueue,
  singerKey,
  refreshRequestsFromRemote,
  subscribeRequestsRealtime,
  refreshTermsFromRemote,
  subscribeTermsRealtime,
  refreshEventsFromRemote,
  subscribeEventsRealtime,
} from "@/lib/karaoke";

export default function EventPage() {
  const { id } = useParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tos, setTos] = useState(false);
  const [form, setForm] = useState({
    singer: "",
    songTitle: "",
    artist: "",
    isDuo: false,
    partner: "",
  });
  const [error, setError] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"choose" | "request" | "queue">("queue");

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const list = await bootstrapEvents();
        if (mounted) setEvents(list);
      } catch {}
      try {
        await refreshEventsFromRemote();
        if (mounted) setEvents(getEvents());
      } catch {}
    };
    init();
    const unsub = subscribeEventsRealtime(() => {
      if (!mounted) return;
      setEvents(getEvents());
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const event = useMemo(() => {
    const exact = events.find((e) => e.id === id);
    if (exact) return exact;
    if (!id) return undefined;
    const slug = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const bySlug = events.find((e) => slug(e.name) === id || slug(e.id) === id);
    if (bySlug) return bySlug;
    const byStart = events.find(
      (e) => e.id.startsWith(id) || slug(e.name).startsWith(id),
    );
    return byStart;
  }, [events, id]);

  const requestsOpen = event?.requestsOpen ?? true;

  useEffect(() => {
    if (!requestsOpen) {
      setView("queue");
      setTos(false);
    } else {
      setError("");
    }
  }, [requestsOpen]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await refreshRequestsFromRemote();
      if (mounted) setTick((t) => t + 1);
    };
    run();
    const i = setInterval(run, 2000);
    const unsub = subscribeRequestsRealtime(() => setTick((t) => t + 1));
    return () => {
      mounted = false;
      clearInterval(i);
      unsub();
    };
  }, []);

  const all = useMemo(() => (id ? getRequestsByEvent(id) : []), [id, tick]);
  const singerOrder = useMemo(() => {
    if (!id) return [] as string[];
    const order = getSingerOrder(id);
    const reqs = all.filter(
      (r) => r.status === "approved" || r.status === "performing",
    );
    const activeSingerKeys = Array.from(
      new Set(reqs.map((r) => singerKey(r.singer))),
    );
    const perSingerMinOrder: Record<string, number | null> = {};
    for (const r of reqs) {
      const k = singerKey(r.singer);
      const v = r.order ?? null;
      if (
        perSingerMinOrder[k] == null ||
        (v != null && v < (perSingerMinOrder[k] as number))
      ) {
        perSingerMinOrder[k] = v;
      }
    }
    const filteredOrder = order.filter((k) => activeSingerKeys.includes(k));
    const extra = activeSingerKeys.filter((k) => !order.includes(k));
    extra.sort((a, b) => {
      const ra = perSingerMinOrder[a] ?? Number.MAX_SAFE_INTEGER;
      const rb = perSingerMinOrder[b] ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
    return [...filteredOrder, ...extra];
  }, [id, all, tick]);
  const bySinger = useMemo(() => {
    const map = new Map<
      string,
      {
        performing?: RequestItem;
        approved?: RequestItem[];
      }
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
  }, [all, tick]);

  if (!id || !event) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-muted-foreground">
          Event not found.{" "}
          <a className="underline" href="/">
            Back to events
          </a>
        </p>
      </div>
    );
  }

  const now = getNowSinging(id);
  const uniqueSingers = new Set(
    all
      .filter((r) => r.status === "approved" || r.status === "performing")
      .map((r) => r.singer.trim().toLowerCase()),
  ).size;
  const pendingCount = all.filter((r) => r.status === "pending").length;
  const termsText = getTermsForEvent(id);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!requestsOpen) {
      setError("Song requests are currently closed for this event.");
      return;
    }
    if (!tos) {
      setError("You must accept the Terms of Service");
      return;
    }
    if (!form.singer || !form.songTitle || !form.artist) {
      setError("Please fill all fields");
      return;
    }
    const res = await addRequestAsync({
      eventId: id,
      singer: form.singer,
      songTitle: form.songTitle,
      artist: form.artist,
      isDuo: form.isDuo,
      partner: form.isDuo ? form.partner : "",
    });
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setForm({
      singer: "",
      songTitle: "",
      artist: "",
      isDuo: false,
      partner: "",
    });
    setTos(false);
    toast({
      title: "Request received",
      description: "Your song has been submitted.",
    });
    setTick((t) => t + 1);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1
          className="text-2xl font-extrabold tracking-tight cursor-pointer hover:underline"
          onClick={() => setView("queue")}
        >
          {event.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(event.datetime).toLocaleString()} • {event.location}
        </p>
        <p
          className={`mt-2 text-sm font-semibold ${requestsOpen ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
        >
          {requestsOpen ? "Song requests are open" : "Song requests are closed"}
        </p>
      </div>

      {!requestsOpen && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Song requests are closed</AlertTitle>
          <AlertDescription>
            The host has paused new submissions for this event. Please check
            back soon.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <button
          type="button"
          onClick={() => setView("request")}
          disabled={!requestsOpen}
          aria-disabled={!requestsOpen}
          className={`rounded-lg border p-6 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${view === "request" ? "bg-primary/10 border-primary ring-1 ring-primary/40" : "bg-card/40 hover:bg-card/70"}`}
        >
          <h3 className="text-xl font-bold mb-2">Request a Song</h3>
          <p className="text-sm text-muted-foreground">
            {requestsOpen
              ? "Submit your name, song and artist to join the lineup."
              : "The host has paused new song submissions."}
          </p>
        </button>
      </div>

      <Card className="mb-8 bg-gradient-to-r from-primary/20 to-accent/20 border-primary/30">
        <CardHeader className="mr-[200px] pr-[200px]">
          <CardTitle className="text-xl self-start w-auto">
            Now Singing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-6">
            <div className="flex-1 min-w-0">
              {now ? (
                <>
                  <p className="font-semibold truncate">
                    Now Singing: {now.singer} — {now.songTitle} — {now.artist}
                  </p>
                  {(() => {
                    const next = getOnDeck(id);
                    return next ? (
                      <p className="text-sm text-muted-foreground truncate">
                        On deck: {next.singer} — {next.songTitle} —{" "}
                        {next.artist}
                      </p>
                    ) : null;
                  })()}
                </>
              ) : (
                <p className="text-muted-foreground">
                  No one is singing right now.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Request form or closed state */}
        {!requestsOpen ? (
          <Card className="opacity-60 cursor-not-allowed">
            <CardHeader>
              <CardTitle className="text-muted-foreground">Submit a Song</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4">
                  <p className="text-sm font-semibold text-destructive">Song requests are closed</p>
                  <p className="text-sm text-destructive/80 mt-1">
                    The host has paused new song submissions. You can still view the queue on the right.
                  </p>
                </div>
                <div className="space-y-2 opacity-50">
                  <Label htmlFor="singer-disabled">Singer Name</Label>
                  <Input
                    id="singer-disabled"
                    disabled
                    placeholder="Requests closed"
                  />
                  <Label htmlFor="song-disabled">Song Title</Label>
                  <Input
                    id="song-disabled"
                    disabled
                    placeholder="Requests closed"
                  />
                  <Label htmlFor="artist-disabled">Artist</Label>
                  <Input
                    id="artist-disabled"
                    disabled
                    placeholder="Requests closed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : view === "request" ? (
          <Card>
            <CardHeader>
              <CardTitle>Submit a Song</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="text-sm font-semibold mb-1">Rules / Terms</div>
                <div className="rounded-md border p-3 text-sm text-muted-foreground whitespace-pre-line">
                  {termsText}
                </div>
              </div>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="singer">Singer Name</Label>
                  <Input
                    id="singer"
                    value={form.singer}
                    onChange={(e) =>
                      setForm({ ...form, singer: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="song">Song Title</Label>
                  <Input
                    id="song"
                    value={form.songTitle}
                    onChange={(e) =>
                      setForm({ ...form, songTitle: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="artist">Artist</Label>
                  <Input
                    id="artist"
                    value={form.artist}
                    onChange={(e) =>
                      setForm({ ...form, artist: e.target.value })
                    }
                  />
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-start gap-2">
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
                      className="mt-0.5"
                    />
                    <div className="grid gap-0.5 leading-tight">
                      <Label htmlFor="isDuo" className="cursor-pointer">
                        This is a duet / group song
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Tick this if more than one person is singing.
                      </p>
                    </div>
                  </div>
                  {form.isDuo && (
                    <div className="space-y-2">
                      <Label htmlFor="partner">
                        Who's singing with you?{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="partner"
                        value={form.partner}
                        placeholder="e.g. Sarah, or Sarah &amp; Mike"
                        onChange={(e) =>
                          setForm({ ...form, partner: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="tos"
                    checked={tos}
                    onCheckedChange={(v) => setTos(Boolean(v))}
                  />
                  <Label htmlFor="tos">I accept the Terms of Service</Label>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    className="bg-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={!requestsOpen}
                  >
                    Submit
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* Right column: Singer List (always visible) */}
        <Card>
          <CardHeader>
            <CardTitle>Singer List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-center">
              <div className="rounded-md border p-3">
                <div className="text-2xl font-bold">{uniqueSingers}</div>
                <div className="text-xs text-muted-foreground">
                  Active Queue
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-2xl font-bold">{pendingCount}</div>
                <div className="text-xs text-muted-foreground">
                  Pending Requests
                </div>
              </div>
            </div>
            <ul className="space-y-3">
              {singerOrder.length === 0 && (
                <p className="text-muted-foreground">No singers in roster.</p>
              )}
              {singerOrder.map((key, i) => {
                const entry = bySinger.get(key);
                const current = entry?.performing || entry?.approved?.[0];
                const name =
                  getSingerDisplayName(id, key) || current?.singer || key;
                const next = getOnDeck(id);
                const isOnDeck =
                  !!next && next.singer.trim().toLowerCase() === key;
                const statusLabel = current
                  ? current.status === "performing"
                    ? "performing"
                    : isOnDeck
                      ? "on deck"
                      : "queued"
                  : "no song";
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {current
                            ? `${current.songTitle} ··· ${current.artist}`
                            : "No song assigned"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded capitalize ${statusLabel === "performing" ? "bg-primary/20 text-primary" : statusLabel === "on deck" ? "bg-accent/20 text-accent" : statusLabel === "queued" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {statusLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Auto-refreshes every 2 seconds
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UserStats({ eventId, tick }: { eventId: string; tick: number }) {
  const deviceId = getDeviceId();
  const all = getRequestsByEvent(eventId).filter(
    (r) => r.deviceId === deviceId,
  );
  const pending = all.filter((r) => r.status === "pending").length;
  const approved = all.filter((r) => r.status === "approved").length;
  const eta = estimateTimeToEndOfRoundMinutes(eventId);
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="text-muted-foreground">Pending:</span> {pending}
      </p>
      <p>
        <span className="text-muted-foreground">Approved:</span> {approved}
      </p>
      <p>
        <span className="text-muted-foreground">
          Approx Time to End of Round:
        </span>{" "}
        ~{eta} min
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Times are estimates based on an average song length.
      </p>
    </div>
  );
}
