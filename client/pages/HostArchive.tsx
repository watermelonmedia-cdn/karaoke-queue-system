import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  bootstrapEvents,
  getArchiveByEvent,
  getEvents,
  getHostSelectedEvent,
  isHostAuthed,
  setHostSelectedEvent,
  getArchive,
} from "@/lib/karaoke";
import type { EventItem, ArchiveItem } from "@/lib/karaoke";

export default function HostArchivePage() {
  const nav = useNavigate();
  const [authed] = useState(isHostAuthed());
  const [events, setEvents] = useState<EventItem[]>(getEvents());
  const [eventId, setEventId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!authed) nav("/host/login");
  }, [authed, nav]);

  useEffect(() => {
    if (!events.length) {
      bootstrapEvents().then((es) => {
        setEvents(es);
      });
    }
  }, [events.length]);

  useEffect(() => {
    if (eventId) setHostSelectedEvent(eventId);
  }, [eventId]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const mod = await import("@/lib/karaoke");
      await mod.refreshRequestsFromRemote();
      if (mounted) setTick((t) => t + 1);
    };
    run();
    const i = setInterval(run, 3000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  const items = useMemo(() => {
    const all = getArchive().sort((a, b) => b.completedAt - a.completedAt);
    return eventId ? all.filter((item) => item.eventId === eventId) : all;
  }, [eventId, tick]);

  const fmt = (ms: number | null) => {
    if (ms == null) return "—";
    const min = Math.round(ms / 60000);
    return `${min} min`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-extrabold">All Songs Archive</h1>
        <div className="flex items-center gap-3">
          <Select
            value={eventId || "all"}
            onValueChange={(v) => setEventId(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filter by event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {events
                .filter((e) => e.id && e.id.trim())
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" onClick={() => nav("/host")}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requested Songs ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No archive data yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="border-b">
                    <th className="py-3 px-4 text-left font-semibold">
                      Singer
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Song Title
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Artist
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">Event</th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Completed
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Queue Wait
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{it.singer}</td>
                      <td className="py-3 px-4">{it.songTitle}</td>
                      <td className="py-3 px-4">{it.artist}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {it.eventName}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(it.completedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {fmt(it.queueWaitMs)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(it.submittedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
