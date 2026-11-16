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

  it("drops singers who no longer have an active song (when data is fresh)", async () => {
    const k = await lib();
    k.markRefreshSucceeded();
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

describe("the Nov 12 failure: stale data must not destroy the roster", () => {
  it("keeps singers in the order when request data is stale", async () => {
    const k = await lib();
    // The exact shape of the live failure: the roster holds singers, but the
    // app can no longer see their requests (they fell past the 1000-row cap).
    k.setRequests([]);
    k.setSingerOrderLocal(EV, ["ann", "bob", "cara"]);

    // Last good data was a minute ago: too old to trust for deletions.
    k.markRefreshSucceeded(Date.now() - 60000);
    expect(k.msSinceLastSuccessfulRefresh()).toBeGreaterThan(30000);

    // Previously this pruned all three and persisted the loss. It must not.
    expect(k.getSingerOrder(EV)).toEqual(["ann", "bob", "cara"]);
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["ann", "bob", "cara"]);
  });

  it("still prunes correctly once a refresh has succeeded", async () => {
    const k = await lib();
    k.setRequests([
      req({ id: "1", singer: "Bob", status: "approved" }),
    ]);
    k.setSingerOrderLocal(EV, ["ann", "bob"]);
    k.markRefreshSucceeded();
    expect(k.getEffectiveSingerOrder(EV)).toEqual(["bob"]);
  });

  it("moving a singer while stale does not delete them", async () => {
    const k = await lib();
    k.setRequests([]); // app cannot see any requests
    k.setSingerOrderLocal(EV, ["ann", "bob", "cara"]);
    k.markRefreshSucceeded(Date.now() - 60000);
    k.moveSingerToIndex(EV, "cara", 0);
    expect(k.getSingerOrder(EV)).toContain("cara");
    expect(k.getSingerOrder(EV)).toHaveLength(3);
  });
});
