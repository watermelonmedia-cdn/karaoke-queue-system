import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bootstrapEvents,
  getEvents,
  getHostSelectedEvent,
  getSettings,
  getTermsForEvent,
  getDefaultTerms,
  setDefaultTerms,
  isHostAuthed,
  setHostSelectedEvent,
  setSettings,
  setTermsForEvent,
  getUsers,
  addUser,
  deleteUser,
  setUserAdmin,
  updateUserPassword,
  ensureDefaultUser,
  getRequestsByEvent,
  getSingerOrder,
  getRequests,
  getQueueMismatchDiagnostics,
  getPublicQueue,
} from "@/lib/karaoke";
import type { EventItem, AppSettings } from "@/lib/karaoke";
import { logoutHost } from "@/lib/karaoke";
import { toast } from "@/hooks/use-toast";

export default function HostSettingsPage() {
  const nav = useNavigate();
  const [authed] = useState(isHostAuthed());
  const [events, setEvents] = useState<EventItem[]>(getEvents());
  const [eventId, setEventId] = useState<string | null>(
    getHostSelectedEvent() || (events[0]?.id ?? null),
  );
  const [settings, setLocalSettings] = useState<AppSettings>(getSettings());
  const [defaultTerms, setDefaultTermsLocal] = useState<string>(getDefaultTerms());
  const [terms, setTerms] = useState<string>(
    eventId ? getTermsForEvent(eventId) : "",
  );
  const [usersTick, setUsersTick] = useState(0);
  const users = getUsers();
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    isAdmin: false,
  });

  useEffect(() => {
    if (!authed) nav("/host/login");
  }, [authed, nav]);

  useEffect(() => {
    ensureDefaultUser();
  }, []);

  useEffect(() => {
    if (!events.length) {
      bootstrapEvents().then((es) => {
        setEvents(es);
        if (!eventId) setEventId(es[0]?.id ?? null);
      });
    }
  }, [events.length, eventId]);

  useEffect(() => {
    if (eventId) {
      setHostSelectedEvent(eventId);
      setTerms(getTermsForEvent(eventId));
    }
  }, [eventId]);

  const saveWelcome = () => {
    setSettings(settings);
    toast({ title: "Saved", description: "Welcome page settings updated." });
  };

  const saveDefaultTerms = () => {
    setDefaultTerms(defaultTerms);
    toast({
      title: "Saved",
      description:
        "Default terms updated. All new events will use these terms.",
    });
  };

  const saveTerms = () => {
    if (eventId) {
      setTermsForEvent(eventId, terms);
      toast({ title: "Saved", description: "Event-specific terms updated." });
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6" key={usersTick}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              logoutHost();
              nav("/host/login");
            }}
          >
            Log out
          </Button>
          <Button size="sm" variant="secondary" onClick={() => nav("/host")}>
            Back
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Welcome Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Logo URL</label>
            <Input
              value={settings.logoUrl}
              onChange={(e) =>
                setLocalSettings({ ...settings, logoUrl: e.target.value })
              }
              placeholder="/assets/logo.png"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Title</label>
            <Input
              value={settings.welcomeTitle}
              onChange={(e) =>
                setLocalSettings({ ...settings, welcomeTitle: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Subtitle</label>
            <Input
              value={settings.welcomeSubtitle}
              onChange={(e) =>
                setLocalSettings({
                  ...settings,
                  welcomeSubtitle: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Footer Text</label>
            <Input
              value={(settings as any).footerText || ""}
              onChange={(e) =>
                setLocalSettings({ ...settings, footerText: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveWelcome}>
              Save Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set the default terms that will be used for all new events. You can
            override these terms for specific events if needed.
          </p>
          <div>
            <label className="text-sm text-muted-foreground">
              Terms (one per line or paragraph)
            </label>
            <Textarea
              rows={10}
              value={defaultTerms}
              onChange={(e) => setDefaultTermsLocal(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveDefaultTerms}>
              Save Default Terms
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event-Specific Terms (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Override the default terms for a specific event. Leave blank to use
            the default terms.
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={eventId ?? undefined}
              onValueChange={(v) => setEventId(v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">
              Override (leave blank to use default)
            </label>
            <Textarea
              rows={8}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Leave blank to use default terms..."
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveTerms} disabled={!eventId}>
              Save Event Override
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Host Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Manage login users for the host dashboard.
            </p>
            <ul className="space-y-2">
              {users.length === 0 && (
                <p className="text-muted-foreground">No users yet.</p>
              )}
              {users.map((u) => (
                <li
                  key={u.username}
                  className="flex items-center justify-between gap-3 rounded-md border p-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{u.username}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(u.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(u.options?.isAdmin)}
                        onChange={(e) => {
                          setUserAdmin(u.username, e.target.checked);
                          setUsersTick((t) => t + 1);
                        }}
                      />
                      <span>Admin</span>
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const pwd =
                          prompt(`Set a new password for ${u.username}`) || "";
                        if (!pwd) return;
                        const res = await updateUserPassword(u.username, pwd);
                        if (res.ok) setUsersTick((t) => t + 1);
                      }}
                    >
                      Reset Password
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Delete user ${u.username}?`)) {
                          const r = deleteUser(u.username);
                          if (r.ok) setUsersTick((t) => t + 1);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-2 border-t">
            <p className="font-medium mb-2">Add User</p>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
              <Input
                className="sm:col-span-2"
                placeholder="Username"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser({ ...newUser, username: e.target.value })
                }
              />
              <Input
                className="sm:col-span-2"
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newUser.isAdmin}
                  onChange={(e) =>
                    setNewUser({ ...newUser, isAdmin: e.target.checked })
                  }
                />
                <span>Admin</span>
              </label>
            </div>
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={async () => {
                  const res = await addUser(
                    newUser.username,
                    newUser.password,
                    { isAdmin: newUser.isAdmin },
                  );
                  if (res.ok) {
                    setNewUser({ username: "", password: "", isAdmin: false });
                    setUsersTick((t) => t + 1);
                  } else alert(res.reason);
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Debug tools for troubleshooting queue and request issues.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const allReqs = getRequests();
                console.log("=== ALL REQUESTS ===");
                console.log(`Total: ${allReqs.length}`);
                console.table(
                  allReqs.map((r) => ({
                    id: r.id.substring(0, 8),
                    event: r.eventId,
                    singer: r.singer,
                    song: r.songTitle,
                    status: r.status,
                    created: new Date(r.createdAt).toLocaleTimeString(),
                  })),
                );
                alert(
                  `Logged ${allReqs.length} requests to console. Check browser console (F12).`,
                );
              }}
            >
              View All Requests
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!eventId) {
                  alert("Select an event first");
                  return;
                }
                const eventReqs = getRequestsByEvent(eventId);
                console.log(`=== REQUESTS FOR EVENT ${eventId} ===`);
                console.log(`Total: ${eventReqs.length}`);
                console.table(
                  eventReqs.map((r) => ({
                    singer: r.singer,
                    song: r.songTitle,
                    status: r.status,
                    created: new Date(r.createdAt).toLocaleTimeString(),
                  })),
                );
                alert(
                  `Logged ${eventReqs.length} requests for this event to console.`,
                );
              }}
            >
              View Event Requests
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!eventId) {
                  alert("Select an event first");
                  return;
                }
                const order = getSingerOrder(eventId);
                console.log(`=== SINGER QUEUE FOR EVENT ${eventId} ===`);
                console.log(`Queue size: ${order.length} / 15`);
                console.log("Queue order:");
                order.forEach((key, i) => {
                  console.log(`  ${i + 1}. ${key}`);
                });
                alert(
                  `Queue size: ${order.length}/15. Queue order logged to console.`,
                );
              }}
            >
              View Singer Queue Order
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const allReqs = getRequests();
                const approved = allReqs.filter((r) => r.status === "approved");
                const performing = allReqs.filter(
                  (r) => r.status === "performing",
                );
                const pending = allReqs.filter((r) => r.status === "pending");
                const complete = allReqs.filter((r) => r.status === "complete");

                console.log("=== REQUEST STATUS SUMMARY ===");
                console.log(`Pending: ${pending.length}`);
                console.log(`Approved: ${approved.length}`);
                console.log(`Performing: ${performing.length}`);
                console.log(`Complete: ${complete.length}`);
                console.log(`Total: ${allReqs.length}`);

                if (eventId) {
                  const eventReqs = getRequestsByEvent(eventId);
                  const order = getSingerOrder(eventId);
                  console.log(`\n=== EVENT ${eventId} STATS ===`);
                  console.log(`Event requests: ${eventReqs.length}`);
                  console.log(`Queue size: ${order.length} / 15`);
                  console.log(
                    `Mismatch: ${Math.abs(eventReqs.length - order.length)} requests not in queue`,
                  );
                }

                alert("Status summary logged to console (F12)");
              }}
            >
              Status Summary
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const state = {
                  allRequests: getRequests(),
                  events: getEvents(),
                };
                if (eventId) {
                  state.currentEventRequests = getRequestsByEvent(eventId);
                  state.currentEventQueue = getSingerOrder(eventId);
                }
                console.log("=== FULL DIAGNOSTICS ===");
                console.log(JSON.stringify(state, null, 2));
                const dataStr = JSON.stringify(state, null, 2);
                const dataBlob = new Blob([dataStr], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `diagnostics-${Date.now()}.json`;
                link.click();
                URL.revokeObjectURL(url);
                alert("Diagnostics exported as JSON file");
              }}
            >
              Export Full Diagnostics
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                console.clear();
                alert("Console cleared");
              }}
            >
              Clear Console
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!eventId) {
                  alert("Select an event first");
                  return;
                }
                const diag = getQueueMismatchDiagnostics(eventId);
                console.log("=== QUEUE MISMATCH DIAGNOSTICS ===");
                console.log(
                  `Host Queue (${diag.totalInHost}):`,
                  diag.hostQueueOrder,
                );
                console.log(
                  `Public Queue (${diag.totalInPublic}):`,
                  diag.publicQueueSingers,
                );
                if (diag.missingFromPublic.length > 0) {
                  console.warn(
                    "❌ Missing from public:",
                    diag.missingFromPublic,
                  );
                }
                if (diag.extraInHost.length > 0) {
                  console.warn("❌ Extra in host:", diag.extraInHost);
                }
                if (diag.orderMismatch) {
                  console.warn(
                    `⚠️ Order mismatch! First ${diag.matchCount} positions match, then they diverge`,
                  );
                }

                let message =
                  `Host: ${diag.totalInHost}/15 | Public: ${diag.totalInPublic}\n\n`;
                if (diag.missingFromPublic.length === 0 &&
                  diag.extraInHost.length === 0 &&
                  !diag.orderMismatch) {
                  message += "✅ QUEUES MATCH! All singers are in sync.";
                } else {
                  if (diag.missingFromPublic.length > 0) {
                    message += `❌ Missing from public: ${diag.missingFromPublic.join(", ")}\n`;
                  }
                  if (diag.extraInHost.length > 0) {
                    message += `❌ Extra in host: ${diag.extraInHost.join(", ")}\n`;
                  }
                  if (diag.orderMismatch) {
                    message += `⚠️ Order mismatch (${diag.matchCount} matching positions)`;
                  }
                }

                alert(message + "\n\nSee console for details (F12)");
              }}
            >
              Check Queue Sync
            </Button>
          </div>

          <div className="pt-4 border-t text-xs text-muted-foreground">
            <p className="mb-2">
              💡 <strong>Tips:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Open browser console with F12 to see detailed logs</li>
              <li>Use "Check Queue Sync" to verify host and public queues match</li>
              <li>Use "Export Full Diagnostics" to save data for review</li>
              <li>Check queue size vs request count if singers disappear</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
