import { describe, expect, it } from "vitest";

import { fromWireData, toWireData } from "./protocolFields";

describe("MTP protocol field translation", () => {
  it("maps application message fields to MTP wire fields", () => {
    expect(
      toWireData({
        Messages: [{ Content: "abc", MessageId: 4 }],
      }),
    ).toEqual({
      Messages: [{ AppContent: "abc", AppMessageId: 4 }],
    });
  });

  it("maps MTP wire fields back to application fields", () => {
    expect(
      fromWireData({
        AppCreatedAt: 123,
        Message: { AppContent: "abc", AppMessageId: 4 },
      }),
    ).toEqual({
      CreatedAt: 123,
      Message: { Content: "abc", MessageId: 4 },
    });
  });

  it("preserves byte arrays and unrelated fields", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const translated = toWireData({ Payload: bytes, Other: "value" }) as {
      Payload: Uint8Array;
      Other: string;
    };

    expect(translated.Payload).toBe(bytes);
    expect(translated.Other).toBe("value");
  });

  it("rejects field mapping collisions", () => {
    expect(() => toWireData({ Content: "a", AppContent: "b" })).toThrow(
      "MTP field translation collision",
    );
  });
});
