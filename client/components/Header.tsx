import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/karaoke";

export default function Header() {
  const settings = getSettings();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-gradient-to-b from-background/80 to-background/40 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <a href="/" className="group inline-flex items-center gap-3">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto rounded" />
          ) : (
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-accent shadow ring-1 ring-white/10" />
          )}
          <span className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Rossco’s Karaoke
          </span>
        </a>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="/">Events</a>
          </Button>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <a href="/host/login">Host Login</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
