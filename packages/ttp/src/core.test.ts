import { describe, it, expect } from "bun:test";
import { createTransportClient, type SchemaMap } from "./core";
import {
  decodeCommunicationMessage,
  encodeCommunicationMessage,
  type TypedMessage,
} from "./codec";
import { z } from "zod";

type MockStreamWriter = {
  write: (chunk: Uint8Array) => Promise<void>;
  releaseLock: () => void;
  close: () => Promise<void>;
};

type MockStream = {
  getWriter: () => MockStreamWriter;
};

type MockReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  releaseLock: () => void;
  cancel: () => Promise<void>;
};

type MockTransportInstance = {
  ready: Promise<void>;
  closed: Promise<void>;
  createUnidirectionalStream: () => Promise<MockStream>;
  incomingUnidirectionalStreams: {
    getReader: () => MockReader;
  };
  close: () => void;
};

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function ensureLocalStorage() {
  const globalWithStorage = globalThis as unknown as {
    localStorage?: MemoryStorage;
  };

  if (globalWithStorage.localStorage) {
    return;
  }

  const storage = new Map<string, string>();
  globalWithStorage.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };
}

function createMockWebTransport() {
  ensureLocalStorage();

  let readyResolve!: () => void;
  let closedResolve!: () => void;

  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    closedResolve = resolve;
  });

  const writer: MockStreamWriter = {
    write: async () => {},
    releaseLock: () => {},
    close: async () => {},
  };

  const stream: MockStream = {
    getWriter: () => writer,
  };

  const transport: MockTransportInstance = {
    ready,
    closed,
    createUnidirectionalStream: async () => stream,
    incomingUnidirectionalStreams: {
      getReader: () => ({
        read: async () => ({ done: true }),
        releaseLock: () => {},
        cancel: async () => {},
      }),
    },
    close: () => {},
  };

  class MockWebTransport implements MockTransportInstance {
    ready = transport.ready;
    closed = transport.closed;
    createUnidirectionalStream = transport.createUnidirectionalStream;
    incomingUnidirectionalStreams = transport.incomingUnidirectionalStreams;
    close = transport.close;
  }

  return {
    readyResolve,
    closedResolve,
    MockWebTransport,
  };
}

async function expectRejection(
  promise: Promise<unknown>,
  messageSubstring?: string,
) {
  try {
    await promise;
    expect(false).toBe(true);
  } catch (error) {
    if (messageSubstring) {
      expect(getErrorMessage(error).includes(messageSubstring)).toBe(true);
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function writeU32BigEndian(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(
    offset,
    value,
    false,
  );
}

function wrapForDecode(body: Uint8Array) {
  const frame = new Uint8Array(body.byteLength + 4);
  writeU32BigEndian(frame, 0, body.byteLength);
  frame.set(body, 4);
  return frame;
}

describe("Core Protocol", () => {
  describe("encodeCommunicationMessage", () => {
    it("encodes message with id", () => {
      const message: TypedMessage = {
        id: 123,
        type: "ping",
        data: {},
      };

      const encoded = encodeCommunicationMessage(message);

      expect(encoded instanceof Uint8Array).toBe(true);
      expect(encoded.byteLength > 0).toBe(true);
    });

    it("encodes message without id", () => {
      const message: TypedMessage = {
        id: 0,
        type: "pong",
        data: {},
      };

      const encoded = encodeCommunicationMessage(message);
      expect(encoded instanceof Uint8Array).toBe(true);
    });

    it("encodes message with string data", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { content: "hello", sender_id: 42 },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.type).toBe("message");
      expect(decoded.id).toBe(1);
    });

    it("throws on unknown message type", () => {
      const message: TypedMessage = {
        id: 1,
        type: "unknown_type",
        data: {},
      };

      expect(() => encodeCommunicationMessage(message)).toThrow(
        "Unknown communication type",
      );
    });
  });

  describe("decodeCommunicationMessage", () => {
    it("decodes encoded message", () => {
      const original: TypedMessage = {
        id: 456,
        type: "success",
        data: {},
      };

      const encoded = encodeCommunicationMessage(original);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.id).toBe(456);
      expect(decoded.type).toBe("success");
    });

    it("throws on truncated frame", () => {
      const truncated = new Uint8Array([0x00, 0x00, 0x00]);
      expect(() => decodeCommunicationMessage(truncated)).toThrow();
    });

    it("throws on frame length mismatch", () => {
      const buffer = new Uint8Array(10);
      buffer[0] = 0xff;
      buffer[1] = 0xff;
      buffer[2] = 0xff;
      buffer[3] = 0xff;

      expect(() => decodeCommunicationMessage(buffer)).toThrow(
        "Communication frame length mismatch",
      );
    });

    it("decodes error messages with empty data", () => {
      const original: TypedMessage = {
        id: 1,
        type: "error",
        data: {},
      };

      const encoded = encodeCommunicationMessage(original);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.type).toBe("error");
    });
  });

  describe("createTransportClient", () => {
    it("creates client with schemas", () => {
      const { MockWebTransport } = createMockWebTransport();
      const globalWithWebTransport = globalThis as unknown as {
        WebTransport?: new (url: string) => MockTransportInstance;
      };
      globalWithWebTransport.WebTransport = MockWebTransport;

      const schemas: SchemaMap = {
        ping: {
          request: z.object({}),
          response: z.object({}),
        },
      };

      const client = createTransportClient(schemas);

      expect(client !== undefined).toBe(true);
      expect(typeof client.readyState === "function").toBe(true);
      expect(typeof client.connect === "function").toBe(true);
      expect(typeof client.send === "function").toBe(true);
      expect(typeof client.close === "function").toBe(true);
      expect(typeof client.subscribePush === "function").toBe(true);
    });

    it("returns CLOSED ready state initially", () => {
      const client = createTransportClient({});
      expect(client.readyState()).toBe(3); // CLOSED
    });

    it("rejects send when not connected", async () => {
      const { MockWebTransport } = createMockWebTransport();
      const globalWithWebTransport = globalThis as unknown as {
        WebTransport?: new (url: string) => MockTransportInstance;
      };
      globalWithWebTransport.WebTransport = MockWebTransport;

      const schemas: SchemaMap = {
        ping: {
          request: z.object({}),
          response: z.object({}),
        },
      };

      const client = createTransportClient(schemas);

      await expectRejection(
        client.send("ping", {}),
        "Transport is not connected",
      );
    });

    it("calls readyStateChange callback", async () => {
      const { readyResolve, MockWebTransport } = createMockWebTransport();
      const globalWithWebTransport = globalThis as unknown as {
        WebTransport?: new (url: string) => MockTransportInstance;
      };
      globalWithWebTransport.WebTransport = MockWebTransport;

      const readyStateChanges: number[] = [];
      const client = createTransportClient(
        {},
        {
          onReadyStateChange: (state) => readyStateChanges.push(state),
        },
      );

      const connectPromise = client.connect("http://localhost:8000");
      readyResolve();
      await connectPromise;

      expect(readyStateChanges).toContain(0); // CONNECTING
      expect(readyStateChanges).toContain(1); // OPEN
    });

    it("calls close callback on intentional close", async () => {
      const { readyResolve, closedResolve, MockWebTransport } =
        createMockWebTransport();
      const globalWithWebTransport = globalThis as unknown as {
        WebTransport?: new (url: string) => MockTransportInstance;
      };
      globalWithWebTransport.WebTransport = MockWebTransport;

      const closeEvents: Array<{ intentional: boolean; error?: unknown }> = [];
      const client = createTransportClient(
        {},
        {
          onClose: (event) => closeEvents.push(event),
        },
      );

      const connectPromise = client.connect("http://localhost:8000");
      readyResolve();
      await connectPromise;

      const closePromise = client.close();
      closedResolve();
      await closePromise;

      expect(closeEvents.length > 0).toBe(true);
      expect(closeEvents[closeEvents.length - 1].intentional).toBe(true);
    });

    it("rejects pending requests on close", async () => {
      const { readyResolve, closedResolve, MockWebTransport } =
        createMockWebTransport();
      const globalWithWebTransport = globalThis as unknown as {
        WebTransport?: new (url: string) => MockTransportInstance;
      };
      globalWithWebTransport.WebTransport = MockWebTransport;

      const schemas: SchemaMap = {
        ping: {
          request: z.object({}),
          response: z.object({}),
        },
      };

      const client = createTransportClient(schemas);
      const connectPromise = client.connect("http://localhost:8000");
      readyResolve();
      await connectPromise;

      const sendPromise = client.send("ping", {});
      const closePromise = client.close();
      closedResolve();
      await closePromise;

      await expectRejection(sendPromise);
    });
  });

  describe("Push subscriptions", () => {
    it("subscribes and unsubscribes from push events", () => {
      const client = createTransportClient({});

      const handler = () => {};
      const unsubscribe = client.subscribePush(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("Data type encoding", () => {
    it("encodes boolean true", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { signed: true },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.signed).toBe(true);
    });

    it("encodes boolean false", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { signed: false },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.signed).toBe(false);
    });

    it("encodes numbers", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { user_id: 42, sender_id: 100 },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.user_id).toBe(42);
      expect(decoded.data.sender_id).toBe(100);
    });

    it("encodes strings", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { content: "test message", username: "alice" },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.content).toBe("test message");
      expect(decoded.data.username).toBe("alice");
    });

    it("encodes null values", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { status: null },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.status).toBe(null);
    });

    it("encodes arrays of numbers", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { user_ids: [1, 2, 3] },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.user_ids).toEqual([1, 2, 3]);
    });

    it("encodes nested containers", () => {
      const message: TypedMessage = {
        id: 1,
        type: "message",
        data: { user: { username: "alice", display: "Alice" } },
      };

      const encoded = encodeCommunicationMessage(message);
      const decoded = decodeCommunicationMessage(wrapForDecode(encoded));

      expect(decoded.data.user).toEqual({
        username: "alice",
        display: "Alice",
      });
    });
  });
});
