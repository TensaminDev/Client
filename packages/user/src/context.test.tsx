import { describe, expect, it } from "vitest";

import { accountUserSchema, publicUserSchema } from "@tensamin/shared/data";
import { mergeTransientPresence } from "./context";

const profile = {
  Display: "Alice",
  IotaId: 1,
  OmikronConnections: [],
  PublicKey: "aGVsbG8=",
  SubEnd: 0,
  SubLevel: 0,
  UserId: 7,
  Username: "alice",
};

describe("transient presence overlay", () => {
  it("keeps private invisible state on the account without persisting it", () => {
    const account = accountUserSchema.parse({
      ...profile,
      OnlineStatus: "user_online",
    });
    const overlay = new Map([[7, "user_invisible" as const]]);

    expect(mergeTransientPresence(account, overlay).OnlineStatus).toBe(
      "user_invisible",
    );
    expect(publicUserSchema.safeParse(account).success).toBe(false);
  });

  it("merges public live state into a profile without changing durable fields", () => {
    const contact = publicUserSchema.parse({
      ...profile,
      OnlineStatus: "user_online",
    });
    const overlay = new Map([[7, "user_offline" as const]]);
    const merged = mergeTransientPresence(contact, overlay);

    expect(merged).toMatchObject({
      UserId: 7,
      Username: "alice",
      OnlineStatus: "user_offline",
    });
  });
});
