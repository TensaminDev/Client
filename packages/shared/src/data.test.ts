import { describe, expect, it } from "vitest";

import { mtp } from "./data";

describe("call protocol schemas", () => {
  it("accepts a routed call token", () => {
    expect(
      mtp.CallToken.response.parse({
        CallToken: "token",
        CallEndpoint: "wss://calls.example.test",
        OmikronId: 42,
      }),
    ).toEqual({
      CallToken: "token",
      CallEndpoint: "wss://calls.example.test",
      OmikronId: 42,
    });
  });

  it.each([
    { CallToken: "token", OmikronId: 42 },
    {
      CallToken: "token",
      CallEndpoint: "wss://calls.example.test",
      OmikronId: "42",
    },
  ])("rejects a malformed call route", (response) => {
    expect(() => mtp.CallToken.response.parse(response)).toThrow();
  });
});
