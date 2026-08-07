import { describeConvoyError, isMissingDatabaseObject } from "../convoyErrors";

/** Shapes a supabase-js PostgrestError closely enough for the mapping. */
function pgError(code: string, message: string) {
  return { code, message, details: "", hint: "" };
}

describe("isMissingDatabaseObject", () => {
  it.each(["PGRST202", "42883", "PGRST204", "42703", "PGRST205", "42P01"])(
    "recognises %s",
    (code) => {
      expect(isMissingDatabaseObject(pgError(code, "nope"))).toBe(true);
    }
  );

  it("does not fire for an ordinary rejection", () => {
    expect(isMissingDatabaseObject(pgError("23505", "duplicate key"))).toBe(false);
    expect(isMissingDatabaseObject(null)).toBe(false);
    expect(isMissingDatabaseObject("some string")).toBe(false);
  });
});

describe("describeConvoyError", () => {
  it("flags a missing RPC as the fallback signal, not as an error to show", () => {
    const info = describeConvoyError(
      pgError("PGRST202", "Could not find the function public.create_convoy"),
      "create a convoy"
    );
    expect(info.rpcMissing).toBe(true);
    expect(info.needsMigration).toBe(true);
  });

  // The failure the whole feature was stuck on: the client wrote columns a
  // half-migrated database didn't have, and the driver was told to try again.
  it("names a missing column as a migration problem", () => {
    const info = describeConvoyError(
      pgError("PGRST204", "Could not find the 'visibility' column of 'parties'"),
      "create a convoy"
    );
    expect(info.needsMigration).toBe(true);
    expect(info.rpcMissing).toBe(false);
    expect(info.message).toContain("visibility");
    expect(info.message).toContain("database_migration_convoy_shared_nav.sql");
  });

  it("recognises the RLS recursion abort by code and by text", () => {
    const byCode = describeConvoyError(pgError("42P17", "boom"), "create a convoy");
    const byText = describeConvoyError(
      { message: "infinite recursion detected in policy for relation party_members" },
      "create a convoy"
    );
    expect(byCode.needsMigration).toBe(true);
    expect(byText.needsMigration).toBe(true);
    expect(byText.title).toBe("Convoy permissions are misconfigured");
  });

  it("explains a duplicate membership instead of blaming the network", () => {
    const info = describeConvoyError(
      pgError("23505", 'duplicate key value violates unique constraint "idx_party_members_one_active"'),
      "create a convoy"
    );
    expect(info.title).toBe("You're already in a convoy");
    expect(info.needsMigration).toBe(false);
  });

  it("passes a tier-cap rejection through with the paywall's own copy", () => {
    const info = describeConvoyError(
      pgError("23514", "PLATINUM_LIMIT:convoy_members:2 This convoy is full at 2 drivers."),
      "send that invite"
    );
    expect(info.title).toBe("That convoy is full");
    expect(info.message).toBe("This convoy is full at 2 drivers.");
  });

  it("reports the convoy-full signal raised by the invite RPC", () => {
    const info = describeConvoyError(
      { message: "CONVOY_FULL: There's no seat left in this convoy." },
      "send that invite"
    );
    expect(info.title).toBe("That convoy is full");
    expect(info.message).toBe("There's no seat left in this convoy.");
  });

  it("names a connection failure as one", () => {
    const info = describeConvoyError({ message: "TypeError: fetch failed" }, "create a convoy");
    expect(info.title).toBe("No connection to the server");
    expect(info.message).toContain("create a convoy");
  });

  // The point of the default branch: the raw cause has to survive to the
  // phone, because it is the only copy of it that exists on a store build.
  it("keeps the raw message and code for anything unrecognised", () => {
    const info = describeConvoyError(pgError("XX000", "something odd"), "create a convoy");
    expect(info.title).toBe("Couldn't create a convoy");
    expect(info.message).toBe("something odd (XX000)");
    expect(info.needsMigration).toBe(false);
  });

  it("still says something when the error carried no message", () => {
    const info = describeConvoyError({}, "create a convoy");
    expect(info.message).toBe("The database rejected the write and didn't say why.");
  });
});
