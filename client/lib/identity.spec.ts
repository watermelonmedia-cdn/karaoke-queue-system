import { describe, it, expect } from "vitest";
import { buildIdentityIndex, detectNameCollision, buildSetList, summariseSetList } from "./identity";
import type { RequestItem } from "./karaoke";

const T0 = 1_700_000_000_000;
const mk = (o: Partial<RequestItem> & { id: string }): RequestItem => ({
  eventId: "e1", singer: "X", songTitle: "S", artist: "A",
  status: "pending", createdAt: T0, deviceId: "unknown", ...o,
});

describe("identity grouping", () => {
  it("links a COMPLETED song to a later request from the same device", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "Dave", deviceId: "dev-a", ip: "1.1.1.1",
           status: "complete", createdAt: T0, completedAt: T0 + 600_000 }),
      mk({ id: "2", singer: "Big D", deviceId: "dev-a", ip: "1.1.1.1",
           createdAt: T0 + 900_000 }),
    ]);
    expect(idx.people).toHaveLength(1);
    expect(idx.flagged).toHaveLength(1);
    const p = idx.byRequestId.get("2")!;
    expect(p.aliases.map(a => a.name)).toEqual(["Dave", "Big D"]);
    expect(p.completedCount).toBe(1);
    expect(p.activeCount).toBe(1);
  });

  it("links via shared IP when device id differs (cleared storage)", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "Sam", deviceId: "dev-a", ip: "5.5.5.5" }),
      mk({ id: "2", singer: "Sammy", deviceId: "dev-b", ip: "5.5.5.5" }),
    ]);
    expect(idx.people).toHaveLength(1);
    expect(idx.people[0].multiName).toBe(true);
  });

  it("links via device id when IP changes (wifi -> cellular)", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "Jo", deviceId: "dev-z", ip: "10.0.0.1" }),
      mk({ id: "2", singer: "Jojo", deviceId: "dev-z", ip: "77.0.0.9" }),
    ]);
    expect(idx.people).toHaveLength(1);
    expect(idx.people[0].ips.sort()).toEqual(["10.0.0.1", "77.0.0.9"]);
  });

  it("does NOT flag one person using one name repeatedly", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "Ann", deviceId: "d1", ip: "2.2.2.2" }),
      mk({ id: "2", singer: " ann ", deviceId: "d1", ip: "2.2.2.2" }),
    ]);
    expect(idx.flagged).toHaveLength(0);
    expect(idx.people[0].aliases).toHaveLength(1);
  });

  it("does NOT merge strangers via 'unknown'/'host' placeholders", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "A", deviceId: "unknown", ip: "unknown" }),
      mk({ id: "2", singer: "B", deviceId: "unknown", ip: "unknown" }),
      mk({ id: "3", singer: "C", deviceId: "host", ip: "host" }),
    ]);
    expect(idx.people).toHaveLength(3);
    expect(idx.flagged).toHaveLength(0);
  });

  it("keeps separate people separate", () => {
    const idx = buildIdentityIndex([
      mk({ id: "1", singer: "A", deviceId: "d1", ip: "1.1.1.1" }),
      mk({ id: "2", singer: "B", deviceId: "d2", ip: "2.2.2.2" }),
    ]);
    expect(idx.people).toHaveLength(2);
    expect(idx.flagged).toHaveLength(0);
  });

  it("labels people by first appearance", () => {
    const idx = buildIdentityIndex([
      mk({ id: "2", singer: "Late", deviceId: "d2", ip: "2.2.2.2", createdAt: T0 + 5000 }),
      mk({ id: "1", singer: "Early", deviceId: "d1", ip: "1.1.1.1", createdAt: T0 }),
    ]);
    expect(idx.byRequestId.get("1")!.short).toBe("P1");
    expect(idx.byRequestId.get("2")!.short).toBe("P2");
  });
});

describe("name collisions", () => {
  it("flags two DIFFERENT people sharing a name", () => {
    const reqs = [
      mk({ id: "1", singer: "Dave", deviceId: "phone-a", ip: "1.1.1.1", status: "approved" }),
      mk({ id: "2", singer: "Dave", deviceId: "phone-b", ip: "2.2.2.2" }),
    ];
    const c = detectNameCollision(reqs[1], reqs);
    expect(c).not.toBeNull();
    expect(c!.otherPersonRequests).toHaveLength(1);
    expect(c!.suggestion).toBe("Dave (2)");
  });

  it("does NOT flag the same person adding a second song", () => {
    const reqs = [
      mk({ id: "1", singer: "Dave", deviceId: "phone-a", ip: "1.1.1.1", status: "approved" }),
      mk({ id: "2", singer: "Dave", deviceId: "phone-a", ip: "1.1.1.1" }),
    ];
    expect(detectNameCollision(reqs[1], reqs)).toBeNull();
  });

  it("ignores a same-named singer who already finished", () => {
    const reqs = [
      mk({ id: "1", singer: "Dave", deviceId: "phone-a", ip: "1.1.1.1",
           status: "complete", completedAt: T0 + 1000 }),
      mk({ id: "2", singer: "Dave", deviceId: "phone-b", ip: "2.2.2.2" }),
    ];
    expect(detectNameCollision(reqs[1], reqs)).toBeNull();
  });

  it("skips the next suggestion when (2) is taken", () => {
    const reqs = [
      mk({ id: "1", singer: "Dave", deviceId: "a", ip: "1.1.1.1", status: "approved" }),
      mk({ id: "2", singer: "Dave (2)", deviceId: "b", ip: "2.2.2.2", status: "approved" }),
      mk({ id: "3", singer: "Dave", deviceId: "c", ip: "3.3.3.3" }),
    ];
    expect(detectNameCollision(reqs[2], reqs)!.suggestion).toBe("Dave (3)");
  });
});

describe("set list", () => {
  const done = (id: string, singer: string, at: number, extra: any = {}) =>
    mk({ id, singer, status: "complete", completedAt: at, createdAt: T0, ...extra });

  it("orders by completion and counts repeats", () => {
    const list = buildSetList([
      done("3", "Cara", T0 + 30 * 60000),
      done("1", "Ann", T0 + 5 * 60000),
      done("2", "Ann", T0 + 20 * 60000),
      mk({ id: "9", singer: "Pending", status: "approved" }),
    ]);
    expect(list.map((e) => e.singer)).toEqual(["Ann", "Ann", "Cara"]);
    expect(list.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(list[1].nthForSinger).toBe(2);
    expect(list[2].gapMinutes).toBe(10);
    expect(list[0].gapMinutes).toBeNull();
  });

  it("summarises per singer, busiest first", () => {
    const s = summariseSetList(
      buildSetList([
        done("1", "Ann", T0 + 1000),
        done("2", "Bob", T0 + 2000),
        done("3", "Ann", T0 + 3000),
      ]),
    );
    expect(s[0].singer).toBe("Ann");
    expect(s[0].count).toBe(2);
    expect(s[0].positions).toEqual([1, 3]);
  });

  it("falls back to startedAt when completedAt is missing", () => {
    const list = buildSetList([
      mk({ id: "1", singer: "NoTime", status: "complete", startedAt: T0 + 500 }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe(T0 + 500);
  });
});
