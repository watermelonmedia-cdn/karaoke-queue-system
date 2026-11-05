import { describe, it, expect, beforeEach } from "vitest";

// Minimal localStorage so karaoke.ts's module-level helpers work.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

});

const EV = "test-test";
const T0 = 1_700_000_000_000;

async function lib() {
  return await import("./karaoke");
}

const req = (o: any) => ({
  eventId: EV,
  songTitle: "S",
  artist: "A",
  createdAt: T0,
  deviceId: "d",
  ...o,
});

describe("roster survives a lost sync", () => {
  it("restores an approved singer missing from an empty roster", async () => {
    // This is the exact live state that caused the bug:
    //   singer_order: []  while an approved request existed.
    const k = await lib();
    k.setRequests([
      req({ id: "1", singer: "The Results", status: "approved" }),
    ]);
    // Simulate the stale remote overwrite that wiped the roster.
    k.setSingerOrderLocal(EV, []);
    // The queue derives the roster, so the approved singer is still shown.
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["the results"]);
  });

  it("keeps the stored order for singers that are still active", async () => {
    const k = await lib();
    k.setRequests([
      req({ id: "1", singer: "Ann", status: "approved", createdAt: T0 + 2 }),
      req({ id: "2", singer: "Bob", status: "approved", createdAt: T0 + 1 }),
    ]);
    k.setSingerOrder(EV, ["bob", "ann"]);
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["bob", "ann"]);
  });

  it("appends recovered singers by when they first requested", async () => {
    const k = await lib();
    k.setRequests([
      req({ id: "1", singer: "Ann", status: "approved", createdAt: T0 + 5 }),
      req({ id: "2", singer: "Bob", status: "approved", createdAt: T0 + 1 }),
      req({ id: "3", singer: "Cara", status: "approved", createdAt: T0 + 3 }),
    ]);
    k.setSingerOrder(EV, ["ann"]);
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["ann", "bob", "cara"]);
  });

  it("drops singers who no longer have an active song", async () => {
    const k = await lib();
    k.setRequests([
      req({ id: "1", singer: "Ann", status: "complete" }),
      req({ id: "2", singer: "Bob", status: "approved" }),
    ]);
    k.setSingerOrder(EV, ["ann", "bob"]);
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["bob"]);
  });

  it("includes a performing singer", async () => {
    const k = await lib();
    k.setRequests([req({ id: "1", singer: "Ann", status: "performing" })]);
    k.setSingerOrder(EV, []);
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["ann"]);
  });

  it("ignores pending requests, which are not in the lineup yet", async () => {
    const k = await lib();
    k.setRequests([req({ id: "1", singer: "Ann", status: "pending" })]);
    k.setSingerOrder(EV, []);
    expect(k.getEffectiveSingerOrder(EV)).toEqual([]);
  });

  it("reconcile writes the repair back so the next sync persists it", async () => {
    const k = await lib();
    k.setRequests([req({ id: "1", singer: "Zed", status: "approved" })]);
    k.setSingerOrder(EV, []);
    k.reconcileSingerOrder(EV);
    expect(k.getSingerOrder(EV)).toEqual(["zed"]);
  });
});
