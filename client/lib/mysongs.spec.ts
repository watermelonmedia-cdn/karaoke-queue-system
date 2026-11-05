import { describe, it, expect, beforeEach } from "vitest";
import {
  getMySongs,
  rememberMyRequest,
  forgetMyRequest,
  getMyRequestIds,
  countMyPending,
  canSubmitMore,
  MAX_PENDING_PER_DEVICE,
  getRememberedName,
  rememberName,
  checkNameClash,
} from "./mysongs";
import type { RequestItem } from "./karaoke";

const T0 = 1_700_000_000_000;
const EV = "e1";

const mk = (o: Partial<RequestItem> & { id: string }): RequestItem => ({
  eventId: EV,
  singer: "X",
  songTitle: "S",
  artist: "A",
  status: "pending",
  createdAt: T0,
  deviceId: "d",
  ...o,
});

// jsdom is not configured for these tests, so stub localStorage.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe("remembering this phone's requests", () => {
  it("stores and removes ids without duplicates", () => {
    rememberMyRequest(EV, "a");
    rememberMyRequest(EV, "a");
    rememberMyRequest(EV, "b");
    expect(getMyRequestIds(EV)).toEqual(["a", "b"]);
    forgetMyRequest(EV, "a");
    expect(getMyRequestIds(EV)).toEqual(["b"]);
  });

  it("keeps events separate", () => {
    rememberMyRequest(EV, "a");
    rememberMyRequest("other", "z");
    expect(getMyRequestIds(EV)).toEqual(["a"]);
    expect(getMyRequestIds("other")).toEqual(["z"]);
  });
});

describe("status shown to the singer", () => {
  it("shows a queue position for an approved song", () => {
    const mineA = mk({ id: "1", singer: "Ann", status: "approved" });
    const other = mk({ id: "9", singer: "Bob", status: "approved" });
    rememberMyRequest(EV, "1");
    const out = getMySongs(EV, [other, mineA], [other, mineA]);
    expect(out[0].state).toBe("queued");
    expect(out[0].position).toBe(2);
    expect(out[0].headline).toBe("#2 in line");
    expect(out[0].detail).toContain("1 singer ahead");
  });

  it("says you're next at position 1", () => {
    const m = mk({ id: "1", singer: "Ann", status: "approved" });
    rememberMyRequest(EV, "1");
    expect(getMySongs(EV, [m], [m])[0].headline).toBe("You're next");
  });

  it("shows pending as waiting, with no position", () => {
    const m = mk({ id: "1", status: "pending" });
    rememberMyRequest(EV, "1");
    const out = getMySongs(EV, [m], []);
    expect(out[0].state).toBe("pending");
    expect(out[0].position).toBeNull();
    expect(out[0].headline).toBe("Waiting for the host");
  });

  it("does NOT invent a position for a second approved song", () => {
    // getPublicQueue lists one song per singer, so the 2nd is absent from it.
    const first = mk({ id: "1", singer: "Ann", status: "approved" });
    const second = mk({
      id: "2",
      singer: "Ann",
      status: "approved",
      createdAt: T0 + 1000,
    });
    rememberMyRequest(EV, "1");
    rememberMyRequest(EV, "2");
    const out = getMySongs(EV, [first, second], [first]);
    const later = out.find((m) => m.request.id === "2")!;
    expect(later.position).toBeNull();
    expect(later.headline).toBe("Later tonight");
  });

  it("flags a request the host removed", () => {
    rememberMyRequest(EV, "ghost");
    const out = getMySongs(EV, [], []);
    expect(out[0].state).toBe("gone");
    expect(out[0].headline).toBe("Removed");
  });

  it("puts the on-stage song first and finished songs last", () => {
    const perf = mk({ id: "p", singer: "Ann", status: "performing" });
    const done = mk({ id: "d", singer: "Ann", status: "complete" });
    const pend = mk({ id: "n", singer: "Ann", status: "pending" });
    ["d", "n", "p"].forEach((id) => rememberMyRequest(EV, id));
    const out = getMySongs(EV, [perf, done, pend], [perf]);
    expect(out.map((m) => m.state)).toEqual([
      "performing",
      "pending",
      "complete",
    ]);
  });
});

describe("pending limit", () => {
  const pendings = (n: number) =>
    Array.from({ length: n }, (_, i) => mk({ id: `p${i}`, status: "pending" }));

  it("counts only this phone's pending requests", () => {
    const mine = pendings(2);
    const theirs = mk({ id: "someone-else", status: "pending" });
    mine.forEach((r) => rememberMyRequest(EV, r.id));
    expect(countMyPending(EV, [...mine, theirs])).toBe(2);
  });

  it("allows submission below the cap", () => {
    const mine = pendings(MAX_PENDING_PER_DEVICE - 1);
    mine.forEach((r) => rememberMyRequest(EV, r.id));
    expect(canSubmitMore(EV, mine).ok).toBe(true);
  });

  it("blocks at the cap with a clear reason", () => {
    const mine = pendings(MAX_PENDING_PER_DEVICE);
    mine.forEach((r) => rememberMyRequest(EV, r.id));
    const res = canSubmitMore(EV, mine);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("waiting for the host");
    expect(res.pending).toBe(MAX_PENDING_PER_DEVICE);
  });

  it("frees a slot once the host approves one", () => {
    const mine = pendings(MAX_PENDING_PER_DEVICE);
    mine.forEach((r) => rememberMyRequest(EV, r.id));
    const afterApproval = mine.map((r, i) =>
      i === 0 ? { ...r, status: "approved" as const } : r,
    );
    expect(canSubmitMore(EV, afterApproval).ok).toBe(true);
  });

  it("approved and completed songs never count toward the cap", () => {
    const mine = [
      mk({ id: "a", status: "approved" }),
      mk({ id: "b", status: "complete" }),
      mk({ id: "c", status: "performing" }),
    ];
    mine.forEach((r) => rememberMyRequest(EV, r.id));
    expect(countMyPending(EV, mine)).toBe(0);
    expect(canSubmitMore(EV, mine).ok).toBe(true);
  });
});

describe("remembered name and name clashes", () => {
  it("remembers and returns the last name used", () => {
    expect(getRememberedName()).toBe("");
    rememberName("  Izzy  ");
    expect(getRememberedName()).toBe("Izzy");
  });

  it("ignores a blank name", () => {
    rememberName("Izzy");
    rememberName("   ");
    expect(getRememberedName()).toBe("Izzy");
  });

  it("flags a clash when another phone has that name active", () => {
    const theirs = mk({ id: "theirs", singer: "Mary", status: "approved" });
    const res = checkNameClash(EV, "Mary", [theirs]);
    expect(res.taken).toBe(true);
    expect(res.isMine).toBe(false);
    expect(res.message).toContain("last initial");
  });

  it("does NOT flag when this phone already used that name", () => {
    const mine = mk({ id: "mine", singer: "Mary", status: "approved" });
    rememberMyRequest(EV, "mine");
    const res = checkNameClash(EV, "Mary", [mine]);
    expect(res.taken).toBe(false);
    expect(res.isMine).toBe(true);
  });

  it("ignores a name whose songs are all finished", () => {
    const done = mk({ id: "d", singer: "Mary", status: "complete" });
    expect(checkNameClash(EV, "Mary", [done]).taken).toBe(false);
  });

  it("matches case-insensitively and ignores extra spaces", () => {
    const theirs = mk({ id: "t", singer: "mary", status: "pending" });
    expect(checkNameClash(EV, "  MARY  ", [theirs]).taken).toBe(true);
  });

  it("does not flag a different name", () => {
    const theirs = mk({ id: "t", singer: "Mary", status: "approved" });
    expect(checkNameClash(EV, "Mary B", [theirs]).taken).toBe(false);
  });

  it("returns nothing for an empty name", () => {
    expect(checkNameClash(EV, "", []).taken).toBe(false);
  });
});
