import type { RequestItem } from "./karaoke";

/**
 * Session identity tracking.
 *
 * Groups every request in an event (INCLUDING completed ones) into "people"
 * by linking on shared IP address and/or shared device id. This lets the host
 * see that "Dave" who sang 10 minutes ago and "Big D" who just submitted are
 * the same phone, even though the active queue no longer contains the first
 * request.
 */

export interface Alias {
  name: string;
  firstAt: number;
  lastAt: number;
  count: number;
  /** true if this alias currently has an active (non-complete) request */
  active: boolean;
}

export interface PersonIdentity {
  /** stable-ish id derived from the earliest request in the group */
  id: string;
  /** 1-based index, ordered by first appearance */
  index: number;
  /** "P1" */
  short: string;
  /** "Person 1" */
  label: string;
  /** tailwind classes for a colored badge */
  badgeClass: string;
  /** tailwind classes for a subtle row tint */
  rowClass: string;
  ips: string[];
  deviceIds: string[];
  aliases: Alias[];
  requestIds: string[];
  firstSeenAt: number;
  lastSeenAt: number;
  /** number of songs this person has completed this session */
  completedCount: number;
  /** number of active (pending/approved/performing) requests */
  activeCount: number;
  /** true when more than one distinct name has been used */
  multiName: boolean;
}

export interface IdentityIndex {
  people: PersonIdentity[];
  byRequestId: Map<string, PersonIdentity>;
  byIp: Map<string, PersonIdentity>;
  byDeviceId: Map<string, PersonIdentity>;
  /** only the people who have used more than one name */
  flagged: PersonIdentity[];
}

const PALETTE = [
  {
    badge: "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60",
    row: "bg-amber-500/10",
  },
  {
    badge: "bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/60",
    row: "bg-sky-500/10",
  },
  {
    badge: "bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/60",
    row: "bg-fuchsia-500/10",
  },
  {
    badge: "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60",
    row: "bg-emerald-500/10",
  },
  {
    badge: "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60",
    row: "bg-rose-500/10",
  },
  {
    badge: "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/60",
    row: "bg-violet-500/10",
  },
  {
    badge: "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/60",
    row: "bg-cyan-500/10",
  },
  {
    badge: "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/60",
    row: "bg-orange-500/10",
  },
];

const NEUTRAL = {
  badge: "bg-muted text-muted-foreground ring-1 ring-border",
  row: "",
};

/** ignore placeholder values that would falsely link everyone together */
function usableIp(ip?: string): string | null {
  if (!ip) return null;
  const v = ip.trim().toLowerCase();
  if (!v || v === "unknown" || v === "host" || v === "—") return null;
  return v;
}

function usableDevice(id?: string): string | null {
  if (!id) return null;
  const v = id.trim().toLowerCase();
  if (!v || v === "unknown" || v === "host") return null;
  return v;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Build the identity index for an event.
 * Pass every request for the event, complete ones included.
 */
export function buildIdentityIndex(requests: RequestItem[]): IdentityIndex {
  const uf = new UnionFind();

  // seed: every request is its own node, then link to its ip / device nodes
  for (const r of requests) {
    const node = `r:${r.id}`;
    uf.find(node);
    const ip = usableIp(r.ip);
    const dev = usableDevice(r.deviceId);
    if (ip) uf.union(node, `ip:${ip}`);
    if (dev) uf.union(node, `dev:${dev}`);
    // requests with neither signal stay isolated
  }

  // gather groups
  const groups = new Map<string, RequestItem[]>();
  for (const r of requests) {
    const root = uf.find(`r:${r.id}`);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r);
  }

  const people: PersonIdentity[] = [];

  for (const [, reqs] of groups) {
    reqs.sort((a, b) => a.createdAt - b.createdAt);

    const aliasMap = new Map<string, Alias>();
    const ips = new Set<string>();
    const devices = new Set<string>();
    let completedCount = 0;
    let activeCount = 0;

    for (const r of reqs) {
      const key = normalizeName(r.singer);
      if (key) {
        const existing = aliasMap.get(key);
        const isActive = r.status !== "complete";
        if (existing) {
          existing.count += 1;
          existing.lastAt = Math.max(existing.lastAt, r.createdAt);
          existing.firstAt = Math.min(existing.firstAt, r.createdAt);
          existing.active = existing.active || isActive;
        } else {
          aliasMap.set(key, {
            name: r.singer.trim(),
            firstAt: r.createdAt,
            lastAt: r.createdAt,
            count: 1,
            active: isActive,
          });
        }
      }
      const ip = usableIp(r.ip);
      const dev = usableDevice(r.deviceId);
      if (ip) ips.add(ip);
      if (dev) devices.add(dev);
      if (r.status === "complete") completedCount += 1;
      else activeCount += 1;
    }

    const aliases = Array.from(aliasMap.values()).sort(
      (a, b) => a.firstAt - b.firstAt,
    );

    const firstSeenAt = reqs[0]?.createdAt ?? 0;
    const lastSeenAt = reqs.reduce(
      (m, r) => Math.max(m, r.completedAt ?? r.createdAt),
      firstSeenAt,
    );

    people.push({
      id: reqs[0]?.id ?? `p-${people.length}`,
      index: 0,
      short: "",
      label: "",
      badgeClass: NEUTRAL.badge,
      rowClass: NEUTRAL.row,
      ips: Array.from(ips),
      deviceIds: Array.from(devices),
      aliases,
      requestIds: reqs.map((r) => r.id),
      firstSeenAt,
      lastSeenAt,
      completedCount,
      activeCount,
      multiName: aliases.length > 1,
    });
  }

  // order by first appearance so labels stay stable through the night
  people.sort((a, b) => a.firstSeenAt - b.firstSeenAt);

  // colors go to the people who need attention (multi-name) first, so the
  // limited palette is never wasted on someone with a single name
  let colorCursor = 0;
  for (const p of people) {
    if (p.multiName) {
      const c = PALETTE[colorCursor % PALETTE.length];
      colorCursor += 1;
      p.badgeClass = c.badge;
      p.rowClass = c.row;
    }
  }

  people.forEach((p, i) => {
    p.index = i + 1;
    p.short = `P${i + 1}`;
    p.label = `Person ${i + 1}`;
  });

  const byRequestId = new Map<string, PersonIdentity>();
  const byIp = new Map<string, PersonIdentity>();
  const byDeviceId = new Map<string, PersonIdentity>();
  for (const p of people) {
    for (const id of p.requestIds) byRequestId.set(id, p);
    for (const ip of p.ips) byIp.set(ip, p);
    for (const d of p.deviceIds) byDeviceId.set(d, p);
  }

  return {
    people,
    byRequestId,
    byIp,
    byDeviceId,
    flagged: people.filter((p) => p.multiName),
  };
}

export function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function minutesAgo(ts: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - ts) / 60000));
}

export function agoLabel(ts: number, now = Date.now()): string {
  const m = minutesAgo(ts, now);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m ago` : `${h}h ago`;
}

/** Human readable summary for a tooltip / alert row. */
export function describePerson(p: PersonIdentity, now = Date.now()): string {
  const names = p.aliases
    .map((a) => `"${a.name}" (${agoLabel(a.lastAt, now)})`)
    .join(" → ");
  const bits = [`${p.label}: ${names}`];
  if (p.completedCount > 0)
    bits.push(
      `${p.completedCount} song${p.completedCount === 1 ? "" : "s"} already sung`,
    );
  if (p.ips.length) bits.push(`IP ${p.ips.join(", ")}`);
  return bits.join(" · ");
}
