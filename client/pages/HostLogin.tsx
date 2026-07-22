import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ensureDefaultUser,
  isHostAuthed,
  loginHost,
  refreshHostSession,
} from "@/lib/karaoke";

export default function HostLoginPage() {
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // Restore a live Supabase session if one exists, then bounce through.
      const live = await refreshHostSession();
      if (live || isHostAuthed()) {
        nav("/host");
        return;
      }
      ensureDefaultUser();
    })();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!identifier || !password) {
      setError("Enter your email (or username) and password");
      return;
    }
    setBusy(true);
    try {
      const res = await loginHost(identifier, password);
      if (!res.ok) {
        setError(res.reason || "Incorrect username or password");
        return;
      }
      if (res.mode === "legacy") {
        // Not fatal, but the host should know: RLS step 2 requires a real
        // Supabase session, so a legacy login cannot write once that
        // migration is applied.
        setNotice(
          "Signed in with the local fallback account. Create a Supabase user for secure login.",
        );
        setTimeout(() => nav("/host"), 1400);
        return;
      }
      nav("/host");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="glass rounded-2xl">
        <CardHeader className="pb-3">
          <div className="eyebrow mb-1 text-accent/90">Staff only</div>
          <CardTitle className="font-display text-2xl">Host Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email</Label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-300">
                {notice}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => nav("/")}
                disabled={busy}
              >
                Back
              </Button>
              <Button type="submit" disabled={busy} className="font-semibold">
                {busy ? "Signing in…" : "Enter"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
