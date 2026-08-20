import { afterEach, describe, expect, it, vi } from "vitest";

import { RequestIdAllocator } from "./requestIds";

vi.mock("@methanium/ui", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock("@tensamin/shared/log", () => ({ log: vi.fn() }));
vi.mock("@tensamin/storage/context", () => ({
  useStorage: () => ({ load: vi.fn() }),
}));

const { completeInitialSynchronization, isPushType, validateResponse } =
  await import("./context");

const validState = {
  SessionId: 7,
  VersionNumber: 2,
  CacheSchemaVersion: 0,
  SyncMode: "full",
  Contacts: [],
  Communities: [],
  Calls: [],
  Messages: [],
  DeletedMessageIds: [],
  DeletedContactIds: [],
};

function mockInitialSyncClient(
  state: { type: string; data: unknown } = {
    type: "ClientStateSync",
    data: validState,
  },
  acknowledgement: unknown = { type: "ClientStateAck", data: {} },
) {
  const handlers = new Map<string, (message: never) => void>();
  const request = vi.fn().mockResolvedValue(acknowledgement);
  const client = {
    auth: vi.fn(async () => {
      handlers.get(state.type)?.(state as never);
    }),
    subscribe: vi.fn((type: string, handler: (message: never) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    }),
    request,
    disconnect: vi.fn(),
  } as unknown as Parameters<typeof completeInitialSynchronization>[0];
  return { client, handlers, request };
}

afterEach(() => {
  vi.useRealTimers();
});

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

describe("browser initial synchronization", () => {
  it("validates state, sends a nonzero acknowledgement, then resolves", async () => {
    const { client, request } = mockInitialSyncClient();

    const state = await completeInitialSynchronization(
      client,
      new RequestIdAllocator(),
      new AbortController().signal,
    );

    expect(state.data).toEqual(validState);
    expect(request).toHaveBeenCalledWith(
      "ClientStateAck",
      { SessionId: 7, VersionNumber: 2 },
      { id: 1 },
    );
  });

  it("does not acknowledge malformed state", async () => {
    const { client, request } = mockInitialSyncClient({
      type: "ClientStateSync",
      data: { ...validState, SyncMode: "invalid" },
    });

    await expect(
      completeInitialSynchronization(
        client,
        new RequestIdAllocator(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Response validation failed");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects ErrorNoIota during initial synchronization", async () => {
    const { client, request } = mockInitialSyncClient({
      type: "ErrorNoIota",
      data: {},
    });

    await expect(
      completeInitialSynchronization(
        client,
        new RequestIdAllocator(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("No Iota is currently connected");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an acknowledgement protocol error", async () => {
    const { client } = mockInitialSyncClient(undefined, {
      type: "ErrorInvalidData",
      data: {},
    });

    await expect(
      completeInitialSynchronization(
        client,
        new RequestIdAllocator(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("State acknowledgement failed: ErrorInvalidData");
  });

  it("times out a missing acknowledgement", async () => {
    vi.useFakeTimers();
    const { client } = mockInitialSyncClient();
    vi.mocked(client.request).mockReturnValue(new Promise(() => {}));
    const result = completeInitialSynchronization(
      client,
      new RequestIdAllocator(),
      new AbortController().signal,
      100,
      10,
    );
    const assertion = expect(result).rejects.toThrow(
      "State acknowledgement timed out",
    );

    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("stops immediately when the connection attempt is cancelled", async () => {
    const { client } = mockInitialSyncClient();
    vi.mocked(client.auth).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = completeInitialSynchronization(
      client,
      new RequestIdAllocator(),
      controller.signal,
    );

    controller.abort(new Error("MTP connection lost"));
    await expect(result).rejects.toThrow("MTP connection lost");
  });

  it("times out authentication while waiting for initial state", async () => {
    vi.useFakeTimers();
    const { client, handlers } = mockInitialSyncClient();
    vi.mocked(client.auth).mockImplementation(() => {
      handlers.get("ClientStateSync")?.({
        type: "ClientStateSync",
        data: validState,
      } as never);
      return new Promise(() => {});
    });
    const result = completeInitialSynchronization(
      client,
      new RequestIdAllocator(),
      new AbortController().signal,
      100,
      10,
    );
    const assertion = expect(result).rejects.toThrow(
      "MTP authentication timed out",
    );

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("uses a fresh request ID namespace for each connection", async () => {
    const first = mockInitialSyncClient();
    const second = mockInitialSyncClient();

    await completeInitialSynchronization(
      first.client,
      new RequestIdAllocator(),
      new AbortController().signal,
    );
    await completeInitialSynchronization(
      second.client,
      new RequestIdAllocator(),
      new AbortController().signal,
    );

    expect(first.request.mock.calls[0]?.[2]).toEqual({ id: 1 });
    expect(second.request.mock.calls[0]?.[2]).toEqual({ id: 1 });
  });
});
