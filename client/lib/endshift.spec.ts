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

  it("leaves the night's requests intact", async () => {
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
    expect(k.getRequestsByEvent(EV)).toHaveLength(1);
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
