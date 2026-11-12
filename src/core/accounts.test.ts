import { describe, expect, it } from "vitest";
import { dbName, migrateAccounts, tokenKey } from "./accounts";

describe("accounts", () => {
  it("the first provider keeps its original token key and database file", () => {
    expect(tokenKey("tension", "tension")).toBe("slackboard.token");
    expect(tokenKey("decoy", "tension")).toBe("slackboard.token.decoy");
    expect(dbName("tension", "tension")).toBe("slackboard.db");
    expect(dbName("decoy", "tension")).toBe("slackboard-decoy.db");
  });
  it("an older single sign-in becomes the first provider's account", () => {
    expect(migrateAccounts({ signedIn: true, userId: 7, username: "n" }, "tension")).toEqual({ tension: { userId: 7, username: "n" } });
  });
  it("signed-out and already-migrated states are kept as they are", () => {
    expect(migrateAccounts({ signedIn: false, userId: null }, "tension")).toEqual({});
    const a = { decoy: { userId: 1, username: "d" } };
    expect(migrateAccounts({ accounts: a, signedIn: true, userId: 9 }, "tension")).toBe(a);
  });
});
