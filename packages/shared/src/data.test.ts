import { describe, expect, it } from "vitest";

import {
  accountUserSchema,
  mtp,
  publicUserSchema,
  userPresencePreferenceSchema,
} from "./data";

const profile = {
  Display: "Alice",
  IotaId: 1,
  OmikronConnections: [],
  PublicKey: "aGVsbG8=",
  SubEnd: 0,
  SubLevel: 0,
  UserId: 1,
  Username: "alice",
};

describe("presence protocol schemas", () => {
  it.each([
    "user_online",
    "user_idle",
    "user_dnd",
    "user_wc",
    "user_invisible",
  ])("accepts writable preference %s", (state) => {
    expect(userPresencePreferenceSchema.parse(state)).toBe(state);
    expect(mtp.SetUserState.request.parse({ UserState: state })).toEqual({
      UserState: state,
    });
  });

  it("keeps invisible private to the account schema", () => {
    expect(
      accountUserSchema.parse({ ...profile, OnlineStatus: "user_invisible" })
        .OnlineStatus,
    ).toBe("user_invisible");
    expect(
      publicUserSchema.safeParse({ ...profile, OnlineStatus: "user_invisible" })
        .success,
    ).toBe(false);
    expect(
      publicUserSchema.parse({ ...profile, OnlineStatus: "user_offline" })
        .OnlineStatus,
    ).toBe("user_offline");
  });

  it("does not put state changes or lowercase status in ChangeUserData", () => {
    const statePayload = mtp.ChangeUserData.request.safeParse({
      OnlineStatus: "user_online",
    });
    expect(statePayload.success ? statePayload.data : undefined).toEqual({});
    expect(mtp.ChangeUserData.request.parse({ Status: "At lunch" })).toEqual({
      Status: "At lunch",
    });
    const lowercasePayload = mtp.ChangeUserData.request.safeParse({
      status: "At lunch",
    });
    expect(
      lowercasePayload.success ? lowercasePayload.data : undefined,
    ).toEqual({});
  });
});
