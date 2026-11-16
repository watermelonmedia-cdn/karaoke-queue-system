import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small shared visual pieces. Kept in one file so every page uses the same
 * badge, avatar and "live" indicator instead of inventing its own.
 */

export type ChipTone = "brand" | "gold" | "danger" | "success" | "neutral";

// Written out in full on purpose. Tailwind strips any class it cannot find as
// a complete string in the source, so building these as `chip-${tone}` made
// every chip lose its colour in the production build.
const CHIP_TONE: Record<ChipTone, string> = {
  brand: "chip-brand",
  gold: "chip-gold",
  danger: "chip-danger",
  success: "chip-success",
  neutral: "chip-neutral",
};

/**
 * The one badge style in the app. Tone carries meaning:
 *   brand   duets and other neutral facts about a song
 *   gold    next up / on stage / worth a glance
 *   danger  something is wrong (same device, different names)
 *   success good news (someone's first song tonight)
 *   neutral plain information
 */
export function Chip({
  tone = "neutral",
  icon,
  title,
  className,
  children,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("chip", CHIP_TONE[tone], className)} title={title}>
      {icon}
      {children}
    </span>
  );
}

/** Animated bars: someone is singing right now. */
export function Equalizer({ className }: { className?: string }) {
  return (
    <span className={cn("eq", className)} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

// Tints stay inside the palette: teal, yellow and two navy-adjacent blues.
const AVATAR_TONES = [
  "bg-primary/20 text-primary ring-primary/40",
  "bg-accent/20 text-accent ring-accent/40",
  "bg-sky-400/20 text-sky-300 ring-sky-400/40",
  "bg-indigo-400/20 text-indigo-300 ring-indigo-400/40",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Circle with the singer's initial. The tint is derived from the name, so the
 * same singer keeps the same colour all night and rows are quicker to scan.
 */
export function InitialAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const clean = (name || "?").trim();
  const initial = clean.charAt(0).toUpperCase() || "?";
  const tone = AVATAR_TONES[hash(clean.toLowerCase()) % AVATAR_TONES.length];
  const dims =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : size === "lg"
        ? "h-12 w-12 text-lg"
        : "h-9 w-9 text-sm";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold ring-1",
        dims,
        tone,
        className,
      )}
    >
      {initial}
    </span>
  );
}
