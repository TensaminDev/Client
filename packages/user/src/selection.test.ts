import { describe, expect, it } from "vitest";

import type { User } from "./context";
import { getChangedUserFields, selectUserFields } from "./selection";

const user = {
  Avatar: undefined,
  Display: "Alice",
  IotaId: 1,
  OmikronConnections: [],
  OnlineStatus: "user_online",
  PublicKey: "AA==",
  SubEnd: 0,
  SubLevel: 0,
  UserId: 1,
  Username: "alice",
} satisfies User;

describe("presence selection", () => {
  it("notifies OnlineStatus selections when presence changes", () => {
    const next = { ...user, OnlineStatus: "user_dnd" as const };

    expect(getChangedUserFields(user, next)).toEqual(["OnlineStatus"]);
    expect(selectUserFields(next, ["OnlineStatus"])).toEqual({
      OnlineStatus: "user_dnd",
    });
  });
});
