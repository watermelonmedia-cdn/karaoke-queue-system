import { describe, it, expect } from "vitest";
import {
  parseSingers,
  participantsOf,
  groupKey,
  isGroupEntry,
  participantStats,
  entryFairness,
  relateNames,
  isSuspiciousNameChange,
  describeTurns,
} from "./singers";
import type { RequestItem } from "./karaoke";

const T0 = 1_700_000_000_000;
const mk = (o: Partial<RequestItem> & { id: string }): RequestItem => ({
  eventId: "e1",
  singer: "X",
  songTitle: "S",
  artist: "A",
  status: "complete",
  createdAt: T0,
  deviceId: "d",
  ...o,
});

describe("parsing real names from this venue", () => {
  it("splits the separators that actually occur", () => {
    expect(parseSingers("Jayden and faith")).toEqual(["jayden", "faith"]);
    expect(parseSingers("Cash, Murph, hayden")).toEqual([
      "cash",
      "murph",
      "hayden",
    ]);
    expect(parseSingers("Izzy & Ross")).toEqual(["izzy", "ross"]);
    expect(parseSingers("Tati + Veggie")).toEqual(["tati", "veggie"]);
  });

  it("NEVER splits a name that merely contains the letters 'and'", () => {
    for (const n of ["Amanda", "Sandy", "Andy", "Alexander", "Sandra"]) {
      expect(parseSingers(n)).toEqual([n.toLowerCase()]);
    }
  });

  it("keeps multi-word nicknames intact", () => {
    expect(parseSingers("The import and Melissa")).toEqual([
      "the import",
      "melissa",
    ]);
  });

  it("treats the pair as the same regardless of order", () => {
    expect(groupKey("Jayden and faith")).toBe(groupKey("Faith and Jayden"));
    expect(groupKey("izz and tito")).toBe(groupKey("tito and izz"));
  });

  it("recognises solo versus group", () => {
    expect(isGroupEntry("Mary")).toBe(false);
    expect(isGroupEntry("Bill and Mary")).toBe(true);
  });

  it("includes the duet partner field as a participant", () => {
    const r = mk({ id: "1", singer: "Mary", isDuo: true, partner: "Bill" });
    expect(participantsOf(r)).toEqual(["mary", "bill"]);
  });
});

describe("Bill should not wait double", () => {
  // Mary sings solo, then "Bill and Mary" is submitted from Mary's phone.
  const history = [
    mk({ id: "1", singer: "Mary", status: "complete", completedAt: T0 + 1000 }),
    mk({ id: "2", singer: "Bill and Mary", status: "approved" }),
  ];

  it("counts each participant separately", () => {
    const s = participantStats(history);
    expect(s.get("mary")!.sung).toBe(1);
    expect(s.get("bill")!.sung).toBe(0);
  });

  it("ranks the duet by the least-served singer, not the most", () => {
    const f = entryFairness(history[1], participantStats(history));
    expect(f.minSung).toBe(0); // Bill's first
    expect(f.maxSung).toBe(1); // Mary's second
    expect(f.firstTimers).toEqual(["bill"]);
    expect(f.hasWaitingNewcomer).toBe(true);
  });

  it("labels the turn each person is on", () => {
    const f = entryFairness(history[1], participantStats(history));
    expect(describeTurns(f)).toBe("bill 1st · mary 2nd");
  });

  it("does not flag a newcomer when everyone has already sung", () => {
    const h = [
      mk({ id: "1", singer: "Mary", completedAt: T0 + 1 }),
      mk({ id: "2", singer: "Bill", completedAt: T0 + 2 }),
      mk({ id: "3", singer: "Bill and Mary", status: "approved" }),
    ];
    const f = entryFairness(h[2], participantStats(h));
    expect(f.firstTimers).toEqual([]);
    expect(f.hasWaitingNewcomer).toBe(false);
  });

  it("handles a three-person entry where two are new", () => {
    const h = [
      mk({ id: "1", singer: "Melissa", completedAt: T0 + 1 }),
      mk({ id: "2", singer: "Melissa, Import, Renni", status: "approved" }),
    ];
    const f = entryFairness(h[1], participantStats(h));
    expect(f.firstTimers.sort()).toEqual(["import", "renni"]);
    expect(f.minSung).toBe(0);
  });
});

describe("duet versus someone switching names", () => {
  it("treats a shared-member group as a duet, not an alias", () => {
    expect(relateNames("Mary", "Bill and Mary")).toBe("overlap");
    expect(isSuspiciousNameChange("Mary", "Bill and Mary")).toBe(false);
  });

  it("still catches a genuine name switch", () => {
    expect(relateNames("Dave", "Big D")).toBe("disjoint");
    expect(isSuspiciousNameChange("Dave", "Big D")).toBe(true);
  });

  it("treats a reordered pair as the same people", () => {
    expect(relateNames("Jayden and faith", "Faith and Jayden")).toBe("same");
    expect(isSuspiciousNameChange("Jayden and faith", "Faith and Jayden")).toBe(
      false,
    );
  });

  it("flags two completely different groups", () => {
    expect(isSuspiciousNameChange("Tati and Izzy", "Cash and Murph")).toBe(
      true,
    );
  });

  it("does not flag dropping a partner for a solo turn", () => {
    expect(isSuspiciousNameChange("Bill and Mary", "Mary")).toBe(false);
  });
});

describe("participant stats", () => {
  it("records every spelling a person appeared under", () => {
    const h = [
      mk({ id: "1", singer: "Izzy", completedAt: T0 + 1 }),
      mk({ id: "2", singer: "izz and veg", status: "approved" }),
    ];
    const s = participantStats(h);
    expect(s.get("izzy")!.seenAs).toEqual(["Izzy"]);
    expect(s.get("izz")!.queued).toBe(1);
  });

  it("separates sung from queued", () => {
    const h = [
      mk({ id: "1", singer: "Ann", status: "complete", completedAt: T0 + 5 }),
      mk({ id: "2", singer: "Ann", status: "pending" }),
      mk({ id: "3", singer: "Ann", status: "approved" }),
    ];
    const s = participantStats(h).get("ann")!;
    expect(s.sung).toBe(1);
    expect(s.queued).toBe(2);
    expect(s.lastSungAt).toBe(T0 + 5);
  });
});
