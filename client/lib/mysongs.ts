import type { RequestItem } from "./karaoke";

/**
 * "Songs from this phone"
 *
 * WHY NOT device_id OR ip
 * ------------------------
 * Since supabase-rls-step2.sql, `device_id` and `ip` are not readable by the
 * public key, so a singer's browser cannot ask the server which rows are
 * theirs. It should not be able to: on a venue's shared wifi every phone has
 * the SAME ip, so matching on ip would show each person everyone else's
 * requests and leak who is queued to strangers on that network.
 *
 * Instead the browser remembers the ids of the requests IT submitted. Purely
 * local, leaks nothing, survives the RLS lockdown, and is naturally per-phone.
 *
 * Known limits, by design:
 *   - clearing site data loses the list (they still see the public queue)
 *   - submitting on one phone and checking on another will not match
 *   - a phone passed round a group shows all of that group's songs, which is
 *     why the UI says "this phone" rather than "you"
 */

const KEY_PREFIX = "karaoke_mySongs_";

/** Max requests one phone may have awaiting host approval at once. */
export const MAX_PENDING_PER_DEVICE = 4;

export type MySongState =
  | "pending"
  | "queued"
  | "performing"
  | "complete"
  | "gone";

export interface MySong {
  request: RequestItem;
  state: MySongState;
  /** 1-based place in the public queue, when this song has one */
  position: number | null;
  /** how many of this phone's songs are ahead of it */
  aheadOfItFromThisPhone: number;
  headline: string;
  detail: string;
}

/* ------------------------------------------------------- remembered name */

const NAME_KEY = "karaoke_myName";

/**
 * The name this phone last submitted under.
 *
 * Pre-filling it on a repeat visit keeps spelling consistent. This venue's
 * history has "izz", "izzy" and "Izzy" as three separate queue entries for one
 * person, which splits their turn history and clutters the roster.
 */
export function getRememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function rememberName(name: string) {
  try {
    const v = name.trim();
    if (v) localStorage.setItem(NAME_KEY, v);
  } catch {}
}

export interface NameClashCheck {
  /** someone else already active tonight under this name */
  taken: boolean;
  /** true when THIS phone already used the name, so it is just them again */
  isMine: boolean;
  suggestion: string;
  message: string;
}

/**
 * Is this name already in use tonight by a DIFFERENT phone?
 *
 * Checked at submission so the singer disambiguates themselves, rather than
 * the host having to do it at approval. "Mine" is decided from the request ids
 * this browser stored, so no device id or ip is needed, and shared venue wifi
 * cannot confuse it.
 */
export function checkNameClash(
  eventId: string,
  name: string,
  allRequests: RequestItem[],
): NameClashCheck {
  const wanted = name.trim().toLowerCase().replace(/\s+/g, " ");
  const none: NameClashCheck = {
    taken: false,
    isMine: false,
    suggestion: "",
    message: "",
  };
  if (!wanted) return none;

  const mine = new Set(getMyRequestIds(eventId));

  const activeSameName = allRequests.filter(
    (r) =>
      r.status !== "complete" &&
      r.singer.trim().toLowerCase().replace(/\s+/g, " ") === wanted,
  );
  if (activeSameName.length === 0) return none;

  // If any of them came from this phone, it is simply the same person again.
  if (activeSameName.some((r) => mine.has(r.id))) {
    return { ...none, isMine: true };
  }

  return {
    taken: true,
    isMine: false,
    suggestion: `${name.trim()} ${"".padEnd(0)}`.trim(),
    message: `There's already a "${name.trim()}" in tonight's lineup. Add a last initial so the host can tell you apart.`,
  };
}

/* ------------------------------------------------------------------ store */

export function getMyRequestIds(eventId: string): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + eventId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(eventId: string, ids: string[]) {
  try {
    localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(ids));
  } catch {}
}

export function rememberMyRequest(eventId: string, id: string) {
  const ids = getMyRequestIds(eventId);
  if (!ids.includes(id)) {
    ids.push(id);
    save(eventId, ids);
  }
}

export function forgetMyRequest(eventId: string, id: string) {
  save(
    eventId,
    getMyRequestIds(eventId).filter((x) => x !== id),
  );
}

/* ------------------------------------------------------------ derivation */

/**
 * Resolve this phone's remembered ids against the live queue.
 *
 * `publicQueue` is getPublicQueue() output: one entry per singer, in running
 * order. A singer's SECOND song is deliberately absent from it, so those get
 * position null rather than a made-up number.
 */
export function getMySongs(
  eventId: string,
  allRequests: RequestItem[],
  publicQueue: RequestItem[],
): MySong[] {
  const ids = getMyRequestIds(eventId);
  if (ids.length === 0) return [];

  const byId = new Map(allRequests.map((r) => [r.id, r]));
  const queuePos = new Map(publicQueue.map((r, i) => [r.id, i + 1]));

  const mine: MySong[] = [];

  for (const id of ids) {
    const r = byId.get(id);

    if (!r) {
      // Submitted from this phone but no longer on the server: the host
      // removed it. Say so plainly rather than showing a ghost entry.
      mine.push({
        request: { id, eventId } as RequestItem,
        state: "gone",
        position: null,
        aheadOfItFromThisPhone: 0,
        headline: "Removed",
        detail: "This request is no longer in the lineup.",
      });
      continue;
    }

    const position = queuePos.get(r.id) ?? null;

    let state: MySongState;
    let headline: string;
    let detail: string;

    if (r.status === "complete") {
      state = "complete";
      headline = "Sung";
      detail = "Thanks for singing!";
    } else if (r.status === "performing") {
      state = "performing";
      headline = "You're up now";
      detail = "Head to the mic.";
    } else if (r.status === "pending") {
      state = "pending";
      headline = "Waiting for the host";
      detail = "Not in the lineup yet. The host reviews each request.";
    } else {
      state = "queued";
      if (position != null) {
        headline = position === 1 ? "You're next" : `#${position} in line`;
        detail =
          position === 1
            ? "Get ready."
            : `${position - 1} singer${position - 1 === 1 ? "" : "s"} ahead of you.`;
      } else {
        // Approved, but the singer already has an earlier song in the queue.
        headline = "Later tonight";
        detail = "Lines up after your earlier song.";
      }
    }

    mine.push({
      request: r,
      state,
      position,
      aheadOfItFromThisPhone: 0,
      headline,
      detail,
    });
  }

  // Order: on stage, then queued by position, then pending, then done.
  const rank: Record<MySongState, number> = {
    performing: 0,
    queued: 1,
    pending: 2,
    complete: 3,
    gone: 4,
  };
  mine.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.position ?? 9e9) - (b.position ?? 9e9) ||
      (a.request.createdAt ?? 0) - (b.request.createdAt ?? 0),
  );

  let seen = 0;
  for (const m of mine) {
    if (m.state === "queued" || m.state === "performing") {
      m.aheadOfItFromThisPhone = seen;
      seen += 1;
    }
  }

  return mine;
}

/* ----------------------------------------------------------------- limits */

export function countMyPending(
  eventId: string,
  allRequests: RequestItem[],
): number {
  const ids = new Set(getMyRequestIds(eventId));
  return allRequests.filter((r) => ids.has(r.id) && r.status === "pending")
    .length;
}

/**
 * Courtesy cap, not security: it is enforced in the browser, so clearing site
 * data resets it. That is acceptable for a karaoke queue, where the host can
 * see and remove anything anyway.
 */
export function canSubmitMore(
  eventId: string,
  allRequests: RequestItem[],
): { ok: boolean; reason?: string; pending: number } {
  // NOTE: deliberately not a discriminated union. This project sets
  // "strictNullChecks": false, under which TypeScript cannot narrow
  // { ok: true } | { ok: false; reason } on `.ok`, which is the cause of
  // every pre-existing `Property 'reason' does not exist` error in the repo.
  const pending = countMyPending(eventId, allRequests);
  if (pending >= MAX_PENDING_PER_DEVICE) {
    return {
      ok: false,
      pending,
      reason: `You already have ${pending} request${pending === 1 ? "" : "s"} waiting for the host. Once one is added to the lineup you can send another.`,
    };
  }
  return { ok: true, pending };
}
