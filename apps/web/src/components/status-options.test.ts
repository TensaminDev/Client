import { describe, expect, it } from "vitest";

import { onlineStatusOptions } from "./status-options";

describe("status options", () => {
  it("uses the exact client protocol values", () => {
    expect(onlineStatusOptions).toEqual([
      { label: "Online", value: "user_online" },
      { label: "Idle", value: "user_idle" },
      { label: "Do not disturb", value: "user_dnd" },
      { label: "Away", value: "user_wc" },
      { label: "Offline", value: "user_invisible" },
    ]);
  });
});
