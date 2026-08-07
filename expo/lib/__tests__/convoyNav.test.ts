import {
  CONVOY_DESTINATION_MAX_AGE_MS,
  activeConvoyDestination,
  canSetConvoyDestination,
  convoyDestinationFromRow,
  convoyDestinationHeadline,
  coordinateName,
  isConvoyDestinationStale,
  metresBetween,
  sameConvoyDestination,
} from "../convoyNav";

const KL = { lat: 3.139, lng: 101.6869 };

describe("convoyDestinationFromRow", () => {
  it("reads a full row", () => {
    const dest = convoyDestinationFromRow({
      dest_lat: KL.lat,
      dest_lng: KL.lng,
      dest_name: "Batu Caves",
      dest_set_by: "leader-1",
      dest_set_at: "2026-08-07T10:00:00.000Z",
    });
    expect(dest).toEqual({
      lat: KL.lat,
      lng: KL.lng,
      name: "Batu Caves",
      setBy: "leader-1",
      setAt: Date.parse("2026-08-07T10:00:00.000Z"),
    });
  });

  it("is null for a row with no destination", () => {
    expect(convoyDestinationFromRow({ dest_lat: null, dest_lng: null })).toBeNull();
    expect(convoyDestinationFromRow(null)).toBeNull();
    expect(convoyDestinationFromRow(undefined)).toBeNull();
  });

  // The point of this one: a database that predates the columns hands back a
  // row where every dest_* field is undefined, and the shared-nav UI has to
  // treat that as "no destination" rather than throwing.
  it("is null for a row from a database without the columns", () => {
    expect(convoyDestinationFromRow({} as any)).toBeNull();
  });

  it("treats 0,0 as unset", () => {
    expect(convoyDestinationFromRow({ dest_lat: 0, dest_lng: 0 })).toBeNull();
  });

  it("falls back to a coordinate label when the name is blank", () => {
    const dest = convoyDestinationFromRow({
      dest_lat: KL.lat,
      dest_lng: KL.lng,
      dest_name: "   ",
    });
    expect(dest?.name).toBe(coordinateName(KL.lat, KL.lng));
  });

  it("survives an unparseable timestamp", () => {
    const dest = convoyDestinationFromRow({
      dest_lat: KL.lat,
      dest_lng: KL.lng,
      dest_set_at: "not a date",
    });
    expect(dest?.setAt).toBe(0);
  });
});

describe("metresBetween / sameConvoyDestination", () => {
  it("measures a short hop", () => {
    // ~111m per 0.001° of latitude.
    const d = metresBetween(KL, { lat: KL.lat + 0.001, lng: KL.lng });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(120);
  });

  it("calls a 10m nudge the same destination", () => {
    expect(sameConvoyDestination(KL, { lat: KL.lat + 0.00008, lng: KL.lng })).toBe(true);
  });

  it("calls a 100m move a different destination", () => {
    expect(sameConvoyDestination(KL, { lat: KL.lat + 0.001, lng: KL.lng })).toBe(false);
  });

  it("is false when either side is missing", () => {
    expect(sameConvoyDestination(null, KL)).toBe(false);
    expect(sameConvoyDestination(KL, undefined)).toBe(false);
  });
});

describe("canSetConvoyDestination", () => {
  it("allows the leader", () => {
    expect(canSetConvoyDestination({ leader_id: "u1" }, "u1")).toBe(true);
  });

  it("refuses a member", () => {
    expect(canSetConvoyDestination({ leader_id: "u1" }, "u2")).toBe(false);
  });

  it("refuses when there is no convoy or no signed-in driver", () => {
    expect(canSetConvoyDestination(null, "u1")).toBe(false);
    expect(canSetConvoyDestination({ leader_id: "u1" }, null)).toBe(false);
  });
});

describe("staleness", () => {
  const now = Date.parse("2026-08-07T12:00:00.000Z");
  const fresh = {
    lat: KL.lat,
    lng: KL.lng,
    name: "Batu Caves",
    setBy: "u1",
    setAt: now - 60_000,
  };

  it("keeps a recent destination", () => {
    expect(isConvoyDestinationStale(fresh, now)).toBe(false);
    expect(activeConvoyDestination(fresh, now)).toBe(fresh);
  });

  it("drops one older than the window", () => {
    const old = { ...fresh, setAt: now - CONVOY_DESTINATION_MAX_AGE_MS - 1 };
    expect(isConvoyDestinationStale(old, now)).toBe(true);
    expect(activeConvoyDestination(old, now)).toBeNull();
  });

  it("treats a missing timestamp as fresh, not as ancient", () => {
    expect(isConvoyDestinationStale({ ...fresh, setAt: 0 }, now)).toBe(false);
  });

  it("counts no destination as stale", () => {
    expect(isConvoyDestinationStale(null, now)).toBe(true);
    expect(activeConvoyDestination(null, now)).toBeNull();
  });
});

describe("convoyDestinationHeadline", () => {
  const dest = { lat: KL.lat, lng: KL.lng, name: "Batu Caves", setBy: "u1", setAt: 1 };

  it("tells the leader it is theirs", () => {
    expect(convoyDestinationHeadline(dest, { isLeader: true })).toBe(
      "Your convoy is routed to Batu Caves"
    );
  });

  it("names the leader for a member", () => {
    expect(convoyDestinationHeadline(dest, { isLeader: false, leaderName: "Aisha" })).toBe(
      "Aisha set a destination — Batu Caves"
    );
  });

  it("falls back when the leader has no name yet", () => {
    expect(convoyDestinationHeadline(dest, { isLeader: false, leaderName: "  " })).toBe(
      "The leader set a destination — Batu Caves"
    );
  });
});
