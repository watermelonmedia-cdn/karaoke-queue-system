import { KeyRound } from "lucide-react";
import { getSettings } from "@/lib/karaoke";

/**
 * Deliberately quiet. On a singer's phone the only loud thing on the page
 * should be the request button, so the host entrance is a small icon rather
 * than the brightest button on screen, and the title is never truncated.
 */
export default function Header() {
  const settings = getSettings();
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 py-2.5 flex items-center justify-between gap-3">
          <a href="/" className="group inline-flex items-center gap-2.5 min-w-0">
            <img
              src={settings.logoUrl || "/assets/logo.png"}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-contain"
            />
            <span className="font-display text-base sm:text-xl font-extrabold tracking-tight whitespace-nowrap text-foreground">
              Rossco’s <span className="text-primary">Karaoke</span>
            </span>
          </a>
          <a
            href="/host/login"
            aria-label="Host login"
            title="Host login"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KeyRound className="h-5 w-5" />
          </a>
        </div>
      </div>
      <div className="rule-gold opacity-60" />
    </header>
  );
}
