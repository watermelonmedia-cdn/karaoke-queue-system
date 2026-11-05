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

    </div>
  );
}
