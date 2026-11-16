import { describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const EV = "tonight";

async function lib() {
  return await import("./karaoke");
}

describe("ending a shift keeps the night's history", () => {
  it("marks the event private instead of deleting it", async () => {
    const k = await lib();
    k.setEvents([
      {
        id: EV,
        name: "Tonight",
        datetime: "2026-11-05T12:00:00.000Z",
        location: "The Place",
        isPublic: true,
        requestsOpen: true,
      },
    ]);
    const res = await k.endShift(EV);
    expect(res.ok).toBe(true);

    const after = k.getEvents();
    // Still there - the set list, archive and stats all read these rows.
    expect(after).toHaveLength(1);
    expect(after[0].isPublic).toBe(false);
    expect(after[0].requestsOpen).toBe(false);
  });

  it("preserves the night in the archive rather than deleting it", async () => {
    const k = await lib();
    k.setEvents([
      {
        id: EV,
        name: "Tonight",
        datetime: "2026-11-05T12:00:00.000Z",
        location: "The Place",
        isPublic: true,
        requestsOpen: true,
      },
    ]);
    k.setRequests([
      {
        id: "r1",
        eventId: EV,
        singer: "Ann",
        songTitle: "S",
        artist: "A",
        status: "complete",
        createdAt: 1,
        deviceId: "d",
        completedAt: 2,
      },
    ]);
    await k.endShift(EV);
    // Unloaded from the working set, so the app only ever holds one night...
    expect(k.getRequestsByEvent(EV)).toHaveLength(0);
    // ...but the song is kept, not destroyed.
    expect(k.getArchive().some((a: any) => a.id === "r1")).toBe(true);
  });

  it("does not touch other events", async () => {
    const k = await lib();
    k.setEvents([
      {
        id: EV,
        name: "Tonight",
        datetime: "2026-11-05T12:00:00.000Z",
        location: "A",
        isPublic: true,
        requestsOpen: true,
      },
      {
        id: "other",
        name: "Other",
        datetime: "2026-11-06T12:00:00.000Z",
        location: "B",
        isPublic: true,
        requestsOpen: true,
      },
    ]);
    await k.endShift(EV);
    const other = k.getEvents().find((e) => e.id === "other")!;
    expect(other.isPublic).toBe(true);
  });
});

describe("ending a shift unloads the night", () => {
  const ev = (id: string, isPublic: boolean) => ({
    id,
    name: id,
    datetime: "2026-11-16T12:00:00.000Z",
    location: "The Place",
    isPublic,
    requestsOpen: isPublic,
  });

  it("scopes loading to public and host-selected events only", async () => {
    const k = await lib();
    k.setEvents([ev("tonight", true), ev("last-week", false)]);
    expect(k.activeEventIds()).toEqual(["tonight"]);
  });

  it("includes the host's selected event even once it is private", async () => {
    const k = await lib();
    k.setEvents([ev("tonight", false)]);
    k.setHostSelectedEvent("tonight");
    expect(k.activeEventIds()).toContain("tonight");
  });

  it("drops the finished night from the working set", async () => {
    const k = await lib();
    k.setEvents([ev("tonight", true)]);
    k.setRequests([
      {
        id: "r1",
        eventId: "tonight",
        singer: "Ann",
        songTitle: "S",
        artist: "A",
        status: "complete",
        createdAt: 1,
        deviceId: "d",
        completedAt: 2,
      },
    ]);
    const res = await k.endShift("tonight");
    expect(res.ok).toBe(true);
    expect(res.archived).toBe(1);
    // No longer loaded...
    expect(k.getRequestsByEvent("tonight")).toHaveLength(0);
    // ...but kept in the archive.
    expect(k.getArchive().some((a: any) => a.id === "r1")).toBe(true);
    // ...and out of scope for future fetches.
    expect(k.activeEventIds()).not.toContain("tonight");
  });
});
