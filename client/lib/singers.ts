import type { RequestItem } from "./karaoke";

/**
 * Multi-singer names
 * ------------------
 * A third of the names in this venue's history are group entries: 131 of 364
 * unique names. "Jayden and faith", "Cash, Murph, hayden", "Izzy and Ross".
 *
 * Two things break if a name is treated as one opaque string:
 *
 *  1. FAIRNESS. Mary sings, then "Bill and Mary" is submitted. Bill has not
 *     sung all night, but the entry inherits Mary's history and he gets pushed
 *     down the order. Measured against real data this happened 68 times,
 *     affecting 71 people.
 *
 *  2. FALSE ALARMS. The same-device alias check sees "Mary" then
 *     "Bill and Mary" and reports a singer switching names to get extra turns.
 *     It is a duet, which is the normal way a duet gets submitted: one phone.
 *
 * Separators are taken from the real data: " and " and ",". "&" and "+" are
 * supported too, though they do not appear in this venue's history. The
 * whitespace around "and" is required so "Amanda", "Sandy" and "Andy" are
 * never split.
 */

const SPLIT = /\s+and\s+|\s*,\s*|\s*&\s*|\s*\+\s*|\s+with\s+/i;

/** "Bill and Mary" -> ["bill", "mary"]. Order preserved, lowercased. */
export function parseSingers(name: string): string[] {
  if (!name) return [];
  return name
    .split(SPLIT)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** Everyone credited on a request, including the duet partner field. */
export function participantsOf(r: RequestItem): string[] {
  const out = parseSingers(r.singer);
  if (r.isDuo && r.partner) {
    for (const p of parseSingers(r.partner)) {
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** Order-independent key, so "Bill and Mary" === "Mary and Bill". */
export function groupKey(name: string): string {
  return parseSingers(name).slice().sort().join("+");
}

export function isGroupEntry(name: string): boolean {
  return parseSingers(name).length > 1;
}

/* ------------------------------------------------------------- statistics */

export interface ParticipantStat {
  name: string;
  /** songs completed tonight */
  sung: number;
  /** active requests (pending / approved / performing) */
  queued: number;
  /** last time they finished a song */
  lastSungAt: number | null;
  /** how they have been spelled tonight, for the host's reference */
  seenAs: string[];
}

/**
 * Per-individual tally for an event, counting each member of a group entry
 * separately. This is what makes "Bill's first song" visible even when the
 * entry reads "Bill and Mary".
 */
export function participantStats(
  requests: RequestItem[],
): Map<string, ParticipantStat> {
  const map = new Map<string, ParticipantStat>();

  const sorted = [...requests].sort((a, b) => a.createdAt - b.createdAt);
  for (const r of sorted) {
    for (const p of participantsOf(r)) {
      let s = map.get(p);
      if (!s) {
        s = { name: p, sung: 0, queued: 0, lastSungAt: null, seenAs: [] };
        map.set(p, s);
      }
      if (!s.seenAs.includes(r.singer.trim())) s.seenAs.push(r.singer.trim());
      if (r.status === "complete") {
        s.sung += 1;
        const at = r.completedAt ?? r.startedAt ?? r.createdAt;
        s.lastSungAt = Math.max(s.lastSungAt ?? 0, at);
      } else {
        s.queued += 1;
      }
    }
  }
  return map;
}

export interface EntryFairness {
  participants: string[];
  /** those with no completed song yet tonight */
  firstTimers: string[];
  /** fewest completed songs among the participants */
  minSung: number;
  /** most completed songs among the participants */
  maxSung: number;
  /** true when someone on this entry has not sung yet but someone has */
  hasWaitingNewcomer: boolean;
  perParticipant: { name: string; sung: number }[];
}

/**
 * How to weigh a queue entry, given who is actually on it.
 *
 * Priority should follow the LEAST-served participant. Bill singing his first
 * song should not be ranked as though he were on his third just because Mary
 * is beside him.
 */
export function entryFairness(
  r: RequestItem,
  stats: Map<string, ParticipantStat>,
): EntryFairness {
  const participants = participantsOf(r);
  const per = participants.map((p) => ({
    name: p,
    sung: stats.get(p)?.sung ?? 0,
  }));
  const counts = per.map((p) => p.sung);
  const firstTimers = per.filter((p) => p.sung === 0).map((p) => p.name);
  const minSung = counts.length ? Math.min(...counts) : 0;
  const maxSung = counts.length ? Math.max(...counts) : 0;
  return {
    participants,
    firstTimers,
    minSung,
    maxSung,
    hasWaitingNewcomer: firstTimers.length > 0 && maxSung > 0,
    perParticipant: per,
  };
}

/* ------------------------------------------------------- alias vs. duet */

export type NameRelation =
  /** identical set of people */
  | "same"
  /** shares someone, and adds or drops others: a group number */
  | "overlap"
  /** no one in common: a genuine different name */
  | "disjoint";

export function relateNames(a: string, b: string): NameRelation {
  const A = new Set(parseSingers(a));
  const B = new Set(parseSingers(b));
  if (A.size === 0 || B.size === 0) return "disjoint";
  const shared = [...A].filter((x) => B.has(x));
  if (shared.length === 0) return "disjoint";
  if (shared.length === A.size && shared.length === B.size) return "same";
  return "overlap";
}

/**
 * Should two names from the same device be treated as someone switching
 * identity? Only when they share nobody. "Mary" vs "Bill and Mary" overlaps,
 * so it is a duet and must not be flagged.
 */
export function isSuspiciousNameChange(a: string, b: string): boolean {
  return relateNames(a, b) === "disjoint";
}

/** Short label for the host: "Bill 1st · Mary 3rd". */
export function describeTurns(f: EntryFairness): string {
  const ord = (n: number) => {
    const k = n + 1;
    if (k === 1) return "1st";
    if (k === 2) return "2nd";
    if (k === 3) return "3rd";
    return `${k}th`;
  };
  return f.perParticipant
    .map((p) => `${p.name} ${ord(p.sung)}`)
    .join(" · ");
}
