import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ensureDefaultUser,
  isHostAuthed,
  setAuthedUsername,
  setHostAuthed,
  verifyUser,
} from "@/lib/karaoke";

export default function HostLoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHostAuthed()) nav("/host");
    ensureDefaultUser();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Enter username and password");
      return;
    }
    const ok = await verifyUser(username, password);
    if (ok) {
      setHostAuthed(true);
      setAuthedUsername(username);
      nav("/host");
    } else {
      setError("Incorrect username or password");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Host Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => nav("/")}>
                Back
              </Button>
              <Button type="submit">Enter</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
