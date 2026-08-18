import { describe, expect, it } from "vitest";

import { isPushType, validateResponse } from "./context";

describe("MTP protocol dispatch", () => {
  it("preserves protocol errors for the request layer", () => {
    const error = validateResponse("GetStates", {
      id: 12,
      type: "ErrorInternal",
      data: { ErrorType: "temporary" },
    });
    expect(error.type).toBe("ErrorInternal");
    expect(error.id).toBe(12);
  });

  it("recognizes initial and live presence pushes", () => {
    expect(isPushType("GetStates")).toBe(true);
    expect(isPushType("ClientChanged")).toBe(true);
    expect(isPushType("UnknownMessage")).toBe(false);
  });
});
