import { describe, it, expect } from "vitest";
import { buildIdentityIndex } from "./identity";
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
