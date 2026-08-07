import { describe, expect, it } from "vitest";

import { removeMissingContactSnapshots } from "./sync";

describe("authoritative contact cache updates", () => {
  it("removes missing users and keeps the latest authoritative set", () => {
    const contacts = [{ UserId: 2 }, { UserId: 3 }, { UserId: 4 }];
    expect(removeMissingContactSnapshots(contacts, [3, 99])).toEqual([
      { UserId: 2 },
      { UserId: 4 },
    ]);
  });

  it("does not let a delayed state notification recreate a removed contact", () => {
    const contacts = [{ UserId: 2 }];
    const afterMissing = removeMissingContactSnapshots(contacts, [2]);
    expect(removeMissingContactSnapshots(afterMissing, [])).toEqual([]);
  });
});
