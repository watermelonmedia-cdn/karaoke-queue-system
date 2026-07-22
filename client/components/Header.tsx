import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/karaoke";

export default function Header() {
  const settings = getSettings();
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="border-b border-border/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <a href="/" className="group inline-flex items-center gap-3 min-w-0">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt="Logo"
                className="h-9 w-auto rounded-md ring-1 ring-white/10 transition group-hover:ring-accent/40"
              />
            ) : (
              <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-accent ring-1 ring-white/15 shadow-lg shadow-primary/30 transition group-hover:shadow-primary/50">
                <span className="absolute inset-0 grid place-items-center text-base">
                  🎤
                </span>
              </div>
            )}
            <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight truncate">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-accent">
                Rossco’s Karaoke
              </span>
            </span>
          </a>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-semibold hover:bg-white/5"
            >
              <a href="/">Events</a>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
            >
              <a href="/host/login">Host Login</a>
            </Button>
          </div>
        </div>
      </div>
      {/* gold hairline under the bar */}
      <div className="rule-gold opacity-70" />
    </header>
  );
}
