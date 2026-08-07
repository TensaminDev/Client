import { describe, expect, it } from "vitest";

import { mtp } from "@tensamin/shared/data";
import { onlineStatusOptions } from "./status-options";

describe("sidebar status requests", () => {
  it.each(onlineStatusOptions)("sends $label as $value", ({ value }) => {
    expect(mtp.SetUserState.request.parse({ UserState: value })).toEqual({
      UserState: value,
    });
  });

  it("keeps status text on the profile operation", () => {
    expect(mtp.ChangeUserData.request.parse({ Status: "At lunch" })).toEqual({
      Status: "At lunch",
    });
  });
});
