import { describe, expect, it } from "vitest";

import { RequestIdAllocator } from "./requestIds";

describe("MTP request ID allocation", () => {
  it("allocates nonzero request IDs monotonically", () => {
    const ids = new RequestIdAllocator();

    expect(ids.allocate()).toBe(1);
    expect(ids.allocate()).toBe(2);
    expect(new RequestIdAllocator().allocate()).toBe(1);
  });

  it("does not wrap exhausted request IDs", () => {
    const ids = new RequestIdAllocator(0x1_0000_0000);

    expect(() => ids.allocate()).toThrow("MTP request ID space exhausted");
  });

  it("rejects invalid allocator states", () => {
    expect(() => new RequestIdAllocator(0)).toThrow(
      "invalid MTP request ID allocator state",
    );
  });
});
