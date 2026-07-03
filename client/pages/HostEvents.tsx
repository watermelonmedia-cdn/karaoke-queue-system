import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  bootstrapEvents,
  getEvents,
  isHostAuthed,
  upsertEvent,
  deleteEvent,
} from "@/lib/karaoke";
import type { EventItem } from "@/lib/karaoke";

export default function HostEventsPage() {
  const nav = useNavigate();
  const [authed, setAuthed] = useState(isHostAuthed());
  const [events, setEvts] = useState<EventItem[]>(getEvents());
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventItem>({
    id: "",
    name: "",
    datetime: "",
    location: "",
    isPublic: true,
    requestsOpen: true,
  });

  useEffect(() => {
    if (!authed) nav("/host/login");
  }, [authed, nav]);

  useEffect(() => {
    if (!events.length) {
      bootstrapEvents().then((es) => setEvts(es));
    }
  }, [events.length]);

  const startNew = () => {
    setEditing(null);
    setForm({
      id: "",
      name: "",
      datetime: "",
      location: "",
      isPublic: true,
      requestsOpen: true,
    });
  };

  const startEdit = (e: EventItem) => {
    setEditing(e);
    setForm({ ...e });
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = form.id || slugify(form.name);
    const next: EventItem = { ...form, id };
    await upsertEvent(next);
    const refreshed = await bootstrapEvents();
    setEvts(refreshed);
    setEditing(next);
    toast({ title: "Saved", description: "Event details have been saved." });
  };

  const onDelete = async () => {
    if (!editing) return;
    await deleteEvent(editing.id);
    const refreshed = await bootstrapEvents();
    setEvts(refreshed);
    startNew();
  };

  const onArchive = async () => {
    if (!editing) return;
    const next = { ...editing, isPublic: false };
    await upsertEvent(next);
    const refreshed = await bootstrapEvents();
    setEvts(refreshed);
    setEditing(next);
    setForm(next);
    toast({
      title: "Archived",
      description: "Event hidden from home, logs preserved.",
    });
  };

  const onUnarchive = async () => {
    if (!editing) return;
    const next = { ...editing, isPublic: true };
    await upsertEvent(next);
    const refreshed = await bootstrapEvents();
    setEvts(refreshed);
    setEditing(next);
    setForm(next);
    toast({ title: "Restored", description: "Event visible on home again." });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Events</h1>
        <Button size="sm" variant="secondary" onClick={() => nav("/host")}>
          Host Dashboard
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Active Events</h3>
                  <span className="text-xs text-muted-foreground">
                    {events.filter((e) => e.isPublic).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {events.filter((e) => e.isPublic).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No active events.
                    </p>
                  )}
                  {events
                    .filter((e) => e.isPublic)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => startEdit(e)}
                        className="w-full text-left rounded border p-3 hover:bg-accent/10"
                      >
                        <div className="font-semibold">{e.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.datetime).toLocaleString()} • {e.location}
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Archived Events</h3>
                  <span className="text-xs text-muted-foreground">
                    {events.filter((e) => !e.isPublic).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {events.filter((e) => !e.isPublic).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No archived events.
                    </p>
                  )}
                  {events
                    .filter((e) => !e.isPublic)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => startEdit(e)}
                        className="w-full text-left rounded border p-3 opacity-70 hover:opacity-100 hover:bg-accent/10"
                      >
                        <div className="font-semibold">
                          {e.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            (Archived)
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.datetime).toLocaleString()} • {e.location}
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <Button className="mt-2" onClick={startNew}>
                + New Event
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Edit Event" : "Create Event"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">ID</label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="auto from name if empty"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  Date & Time
                </label>
                <Input
                  type="datetime-local"
                  value={toInputDT(form.datetime)}
                  onChange={(e) =>
                    setForm({ ...form, datetime: fromInputDT(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">
                  Location
                </label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pub"
                  checked={form.isPublic}
                  onCheckedChange={(v) =>
                    setForm({ ...form, isPublic: Boolean(v) })
                  }
                />
                <label htmlFor="pub" className="text-sm">
                  Public
                </label>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <label
                    htmlFor="requests-open"
                    className="text-sm font-semibold"
                  >
                    Accept Song Requests
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Disable to keep event visible while blocking new
                    submissions.
                  </p>
                </div>
                <Switch
                  id="requests-open"
                  checked={form.requestsOpen}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, requestsOpen: Boolean(checked) })
                  }
                />
              </div>
              <div className="flex justify-between gap-2 pt-2">
                {editing && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={onDelete}
                    >
                      Delete
                    </Button>
                    {editing.isPublic ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onArchive}
                      >
                        Archive
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onUnarchive}
                      >
                        Unarchive
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex-1" />
                <Button type="submit">Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function toInputDT(s: string) {
  if (!s) return "";
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDT(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`.replace(
    " ",
    "-",
  );
}
