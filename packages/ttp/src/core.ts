import { log } from "@tensamin/shared/log";
import { z } from "zod";

import {
  decodeCommunicationMessage,
  encodeCommunicationMessage,
  RecoverableMessageDecodeError,
  type TypedMessage,
} from "./codec";
import { RESPONSE_TIMEOUT } from "./values";

export const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

const CLOSE_FRAME_LEN = 0xffff_ffff;
const APPLICATION_CLOSE_CODE = 0;
const APPLICATION_CLOSE_REASON = "ttp-close";
const MAX_REQUEST_ID = 0xffff_fffe;
const BINARY_LOG_STORAGE_KEY = "ttp_logBinary";

type WebTransportCloseOptions = {
  closeCode?: number;
  reason?: string;
};

type WebTransportLike = {
  ready: Promise<unknown>;
  closed: Promise<unknown>;
  createUnidirectionalStream(): Promise<WritableStream<Uint8Array>>;
  incomingUnidirectionalStreams: ReadableStream<ReadableStream<Uint8Array>>;
  close(options?: WebTransportCloseOptions): void;
};

type WebTransportGlobal = typeof globalThis & {
  WebTransport?: new (url: string) => WebTransportLike;
};

type PendingRequest = {
  requestType: string;
  resolve: (value: TypedMessage) => void;
  reject: (reason: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ActiveConnection = {
  transport: WebTransportLike;
  streamReader: ReadableStreamDefaultReader<ReadableStream<Uint8Array>> | null;
  intentional: boolean;
  closeNotified: boolean;
  acceptLoopDone: Promise<void> | null;
  resolveAcceptLoopDone: (() => void) | null;
  activeIncomingTasks: Set<Promise<void>>;
  sendStream: WritableStream<Uint8Array> | null;
  sendWriter: WritableStreamDefaultWriter<Uint8Array> | null;
};

export type { TypedMessage } from "./codec";

export type Message = TypedMessage;

export type SchemaMap = Record<
  string,
  { request: z.ZodType; response: z.ZodType }
>;

type SendOptions = {
  id?: number;
};

export type BoundSendFn<T extends SchemaMap> = {
  <K extends keyof T & string>(
    type: K,
    data: z.input<T[K]["request"]>,
    options?: { id?: number },
  ): Promise<TypedMessage<z.output<T[K]["response"]>>>;
};

export type PushHandler<TData = Record<string, unknown>> = (
  message: TypedMessage<TData>,
) => void;

export type TransportCloseEvent = {
  error?: unknown;
  intentional: boolean;
};

type TransportClientOptions = {
  url?: string;
  onReadyStateChange?: (readyState: number) => void;
  onClose?: (event: TransportCloseEvent) => void;
};

export type TransportClient<T extends SchemaMap> = {
  connect(url?: string): Promise<void>;
  close(reason?: string): Promise<void>;
  send: BoundSendFn<T>;
  readyState(): number;
  subscribePush(handler: PushHandler): () => void;
};

/**
 * Creates a typed transport client that validates request and response payloads.
 * @param schemas Protocol schema map for request/response validation.
 * @param options Optional transport lifecycle callbacks and default URL.
 * @returns Transport client API for connect, close, send, and push subscriptions.
 */
export function createTransportClient<T extends SchemaMap>(
  schemas: T,
  options: TransportClientOptions = {},
): TransportClient<T> {
  const pending = new Map<number, PendingRequest>();
  const pushHandlers = new Set<PushHandler>();

  let currentConnection: ActiveConnection | null = null;
  let currentReadyState: number = READY_STATE.CLOSED;
  let nextRequestId = 1;
  let sendQueueTail: Promise<void> = Promise.resolve();
  let configuredUrl = options.url;

  /**
   * Updates current ready state and emits lifecycle callbacks.
   * @param readyState New transport ready state value.
   * @returns Void.
   */
  const setReadyState = (readyState: number) => {
    currentReadyState = readyState;
    options.onReadyStateChange?.(readyState);
  };

  /**
   * Rejects all pending requests and clears timeout handles.
   * @param reason Rejection reason applied to all pending requests.
   * @returns Void.
   */
  const rejectPending = (reason: unknown) => {
    for (const [id, request] of pending) {
      clearTimeout(request.timeoutId);
      request.reject(reason);
      pending.delete(id);
    }
  };

  /**
   * Finalizes closed state for a connection and notifies listeners.
   * @param connection Closed connection object.
   * @param error Optional close error.
   * @returns Void.
   */
  const notifyClosed = (connection: ActiveConnection, error?: unknown) => {
    if (connection.closeNotified) {
      return;
    }

    connection.closeNotified = true;

    if (currentConnection === connection) {
      currentConnection = null;
    }

    if (currentReadyState !== READY_STATE.CLOSED) {
      setReadyState(READY_STATE.CLOSED);
    }

    rejectPending(error ?? new Error("Transport closed"));
    options.onClose?.({ error, intentional: connection.intentional });
  };

  /**
   * Handles connection-level failures and routes them through close handling.
   * @param connection Connection that failed.
   * @param error Optional failure reason.
   * @returns Void.
   */
  const handleConnectionFailure = (
    connection: ActiveConnection,
    error?: unknown,
  ) => {
    if (currentConnection !== connection && connection.closeNotified) {
      return;
    }

    notifyClosed(connection, error);
  };

  /**
   * Serializes outbound send work so only one request is active at a time.
   * @param task Request task to run in queue order.
   * @returns Promise for the task result.
   */
  const enqueueSend = <T>(task: () => Promise<T>) => {
    const queuedTask = sendQueueTail.then(task, task);
    sendQueueTail = queuedTask.then(
      () => undefined,
      () => undefined,
    );
    return queuedTask;
  };

  /**
   * Handles decoded incoming messages and resolves request promises or push listeners.
   * @param message Decoded incoming message.
   * @returns Void.
   */
  const handleIncomingMessage = (message: TypedMessage) => {
    if (message.type !== "pong") {
      log(2, "ttp", "cyan", "Received: " + message.type, message.data, {
        id: message.id,
      });
    }

    if (message.id !== 0) {
      const pendingRequest = pending.get(message.id);

      if (pendingRequest) {
        clearTimeout(pendingRequest.timeoutId);
        pending.delete(message.id);

        if (message.type.startsWith("error")) {
          pendingRequest.reject(message);
          return;
        }

        const schema = schemas[pendingRequest.requestType];
        if (!schema) {
          pendingRequest.resolve(message);
          return;
        }

        const result = schema.response.safeParse(message.data);
        if (result.success) {
          pendingRequest.resolve({
            ...message,
            data: result.data as Record<string, unknown>,
          });
          return;
        }

        log(
          0,
          "ttp",
          "red",
          `Response validation failed for "${message.type}"`,
          result.error,
          message.data,
        );
        pendingRequest.reject(
          new Error(
            `Response validation failed for "${message.type}": ${result.error.message}`,
          ),
        );
        return;
      }
    }

    const schema = schemas[message.type];
    if (schema) {
      const result = schema.response.safeParse(message.data);
      if (!result.success) {
        log(
          0,
          "ttp",
          "red",
          `Push-event validation failed for "${message.type}"`,
          result.error,
          message.data,
        );
        return;
      }

      message = {
        ...message,
        data: result.data as Record<string, unknown>,
      };
    }

    for (const handler of pushHandlers) {
      handler(message);
    }
  };

  /**
   * Handles recoverable decode failures by rejecting only the affected request.
   * @param error Recoverable decode error details.
   * @returns Void.
   */
  const handleRecoverableDecodeFailure = (
    error: RecoverableMessageDecodeError,
  ) => {
    log(1, "ttp", "yellow", "Recoverable message decode failure", {
      id: error.messageId,
      type: error.messageType,
      error: error.message,
    });

    if (error.messageId === 0) {
      return;
    }

    const pendingRequest = pending.get(error.messageId);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeoutId);
    pending.delete(error.messageId);
    pendingRequest.reject(
      new Error(
        `Failed to decode response for "${pendingRequest.requestType}": ${formatUnknownError(error.cause)}`,
      ),
    );
  };

  /**
   * Starts the incoming stream loop for a newly-opened connection.
   * @param connection Active connection instance.
   * @returns Void.
   */
  const startIncomingLoop = (connection: ActiveConnection) => {
    connection.streamReader =
      connection.transport.incomingUnidirectionalStreams.getReader();
    connection.acceptLoopDone = new Promise<void>((resolve) => {
      connection.resolveAcceptLoopDone = resolve;
    });

    void (async () => {
      try {
        while (!connection.closeNotified) {
          const streamReader = connection.streamReader;
          if (!streamReader) {
            break;
          }

          const readResult = await Promise.race([
            streamReader.read().then((result) => ({
              type: "stream" as const,
              result,
            })),
            connection.transport.closed
              .catch(() => undefined)
              .then(() => ({ type: "closed" as const })),
          ]);

          if (readResult.type !== "stream") {
            break;
          }

          const result = readResult.result;
          if (!result || result.done) {
            break;
          }

          const shouldDiscardFrames =
            connection.intentional || currentConnection !== connection;

          const task = (async () => {
            try {
              await processIncomingStream(
                result.value,
                connection,
                handleIncomingMessage,
                handleRecoverableDecodeFailure,
                handleConnectionFailure,
                shouldDiscardFrames,
              );
            } catch (error) {
              log(0, "ttp", "red", "Incoming transport stream failed", error);
              handleConnectionFailure(connection, error);
            }
          })();

          connection.activeIncomingTasks.add(task);
          void task.finally(() => {
            connection.activeIncomingTasks.delete(task);
          });
        }

        if (
          !connection.intentional &&
          !connection.closeNotified &&
          currentConnection === connection
        ) {
          handleConnectionFailure(
            connection,
            new Error("Transport stream closed"),
          );
        }
      } catch (error) {
        log(0, "ttp", "red", "Incoming stream accept loop failed", error);
        handleConnectionFailure(connection, error);
      } finally {
        connection.streamReader?.releaseLock();
        connection.streamReader = null;

        const resolveAcceptLoopDone = connection.resolveAcceptLoopDone;
        connection.resolveAcceptLoopDone = null;
        resolveAcceptLoopDone?.();
      }
    })();
  };

  /**
   * Awaits transport closed promise and forwards outcome to failure handling.
   * @param connection Active connection instance.
   * @returns Void.
   */
  const awaitClosed = (connection: ActiveConnection) => {
    void connection.transport.closed
      .then(() => {
        handleConnectionFailure(connection);
      })
      .catch((error) => {
        handleConnectionFailure(connection, error);
      });
  };

  /**
   * Opens a transport connection and starts incoming frame processing.
   * @param url Optional override transport URL.
   * @returns Promise that resolves when connection setup completes.
   */
  const connect = async (url = configuredUrl) => {
    if (!url) {
      throw new Error("Transport URL is not configured");
    }

    configuredUrl = url;

    if (currentConnection) {
      await close("reconnect");
    }

    const WebTransportCtor = getWebTransportCtor();
    const transport = new WebTransportCtor(url);
    const connection: ActiveConnection = {
      transport,
      streamReader: null,
      intentional: false,
      closeNotified: false,
      acceptLoopDone: null,
      resolveAcceptLoopDone: null,
      activeIncomingTasks: new Set(),
      sendStream: null,
      sendWriter: null,
    };

    currentConnection = connection;
    setReadyState(READY_STATE.CONNECTING);
    awaitClosed(connection);

    try {
      await transport.ready;

      if (currentConnection !== connection) {
        return;
      }

      log(1, "ttp", "green", "Connected");
      setReadyState(READY_STATE.OPEN);
      startIncomingLoop(connection);
    } catch (error) {
      log(0, "ttp", "red", "WebTransport connection failed", error);
      handleConnectionFailure(connection, error);
      throw error;
    }
  };

  /**
   * Closes the current transport connection and sends a close sentinel frame.
   * @param reason Close reason sent to transport.
   * @returns Promise that resolves once close handling completes.
   */
  const close = async (reason = APPLICATION_CLOSE_REASON) => {
    const connection = currentConnection;
    if (!connection) {
      setReadyState(READY_STATE.CLOSED);
      return;
    }

    connection.intentional = true;
    setReadyState(READY_STATE.CLOSING);
    const acceptLoopDone = connection.acceptLoopDone;

    rejectPending(new Error("Transport closed"));

    try {
      connection.sendWriter?.releaseLock();
      await connection.sendStream?.abort();
    } catch {
      // Ignore errors during stream abort
    }

    try {
      await writeCloseFrame(connection.transport);
    } catch (error) {
      log(1, "ttp", "yellow", "Failed to send close sentinel", error);
    }

    try {
      connection.transport.close({
        closeCode: APPLICATION_CLOSE_CODE,
        reason,
      });
    } catch {
      // Ignore close errors during shutdown.
    }

    try {
      await connection.transport.closed.catch(() => undefined);
      await acceptLoopDone;
      if (connection.activeIncomingTasks.size > 0) {
        await Promise.allSettled([...connection.activeIncomingTasks]);
      }
    } finally {
      notifyClosed(connection);
    }
  };

  /**
   * Sends a typed protocol request over the current connection.
   * @param type Protocol message type.
   * @param input Optional request payload.
    * @param options Optional request id.
    * @returns Promise for the typed response message.
   */
  const send: BoundSendFn<T> = ((
    type: string,
    input?: Record<string, unknown>,
    options?: SendOptions,
  ): Promise<unknown> => {
    if (!currentConnection || currentReadyState !== READY_STATE.OPEN) {
      return Promise.reject(new Error("Transport is not connected"));
    }

    try {
      const schema = schemas[type];
      let payload: Record<string, unknown>;

      if (schema) {
        const result = schema.request.safeParse(input ?? {});
        if (!result.success) {
          log(
            0,
            "ttp",
            "red",
            `Request validation failed for "${type}"`,
            result.error,
          );
          return Promise.reject(
            new Error(
              `Request validation failed for "${type}": ${result.error.message}`,
            ),
          );
        }

        payload = coercePayload(result.data);
      } else {
        payload = coercePayload(input ?? {});
      }

      const requestOptions = options ? { ...options } : {};
      const enqueuedConnection = currentConnection;

      return enqueueSend(() => {
        if (
          !enqueuedConnection ||
          currentConnection !== enqueuedConnection ||
          currentReadyState !== READY_STATE.OPEN ||
          enqueuedConnection.closeNotified
        ) {
          return Promise.reject(new Error("Transport is not connected"));
        }

        const requestId = resolveRequestId(
          requestOptions.id,
          true,
          pending,
          () => {
            const current = nextRequestId;
            nextRequestId = current >= MAX_REQUEST_ID ? 1 : current + 1;
            return current;
          },
        );

        if (type !== "ping") {
          log(2, "ttp", "gray", "Sent: " + type, payload, { id: requestId });
        }

        const messageBytes = encodeCommunicationMessage({
          id: requestId,
          type,
          data: payload,
        });

        return new Promise<TypedMessage>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pending.delete(requestId);
            reject(
              new Error(
                `Request "${type}" timed out after ${RESPONSE_TIMEOUT}ms`,
              ),
            );
          }, RESPONSE_TIMEOUT);

          pending.set(requestId, {
            requestType: type,
            resolve,
            reject,
            timeoutId,
          });

          void writeMessageOnPersistentStream(enqueuedConnection, messageBytes).catch(
            (error) => {
              handleConnectionFailure(enqueuedConnection, error);
              clearTimeout(timeoutId);
              pending.delete(requestId);
              reject(error);
            },
          );
        });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }) as BoundSendFn<T>;

  return {
    connect,
    close,
    send,
    readyState: () => currentReadyState,
    subscribePush(handler: PushHandler) {
      pushHandlers.add(handler);
      return () => {
        pushHandlers.delete(handler);
      };
    },
  };
}

/**
 * Returns the WebTransport constructor from the current runtime.
 * @returns WebTransport constructor.
 */
function getWebTransportCtor() {
  const ctor = (globalThis as WebTransportGlobal).WebTransport;
  if (!ctor) {
    throw new Error("WebTransport is not available in this environment");
  }

  return ctor;
}

/**
 * Formats unknown errors into a stable log string.
 * @param error Unknown error value.
 * @returns Human-readable error description.
 */
function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Returns whether raw transport binary logging is enabled in local storage.
 * @returns True when binary transport logs should be emitted.
 */
function isBinaryMessageLoggingEnabled() {
  try {
    return localStorage.getItem(BINARY_LOG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Logs raw transport bytes when binary logging is enabled.
 * @param direction Message direction label.
 * @param payload Raw binary payload to log.
 * @returns Void.
 */
function logBinaryMessage(
  direction: "Incoming" | "Outgoing",
  payload: Uint8Array,
) {
  if (!isBinaryMessageLoggingEnabled()) {
    return;
  }

  log(3, "ttp", "yellow", `${direction} ${payload.byteLength} bytes:`, payload);
}

/**
 * Ensures outbound message payloads are plain object records.
 * @param value Candidate payload.
 * @returns Payload as plain object record.
 */
function coercePayload(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error("Protocol payload must be a plain object");
  }

  return value;
}

/**
 * Checks whether a value is a non-null, non-array object.
 * @param value Candidate value.
 * @returns True when the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves a unique request id for transport messages.
 * @param requestedId Optional caller-provided request id.
 * @param expectsResponse Whether the request expects a response.
 * @param pending Map of currently pending requests.
 * @param nextId Function that returns the next candidate id.
 * @returns A request id valid for the current pending set.
 */
function resolveRequestId(
  requestedId: number | undefined,
  expectsResponse: boolean,
  pending: Map<number, PendingRequest>,
  nextId: () => number,
) {
  if (requestedId !== undefined) {
    validateRequestId(requestedId, expectsResponse);
    if (expectsResponse && pending.has(requestedId)) {
      throw new Error(`Request id ${requestedId} is already pending`);
    }

    return requestedId;
  }

  if (!expectsResponse) {
    return 0;
  }

  let attempts = 0;
  let candidate = nextId();

  while (candidate === 0 || pending.has(candidate)) {
    candidate = nextId();
    attempts += 1;

    if (attempts > MAX_REQUEST_ID) {
      throw new Error("Unable to allocate a free request id");
    }
  }

  return candidate;
}

/**
 * Validates request id bounds and response semantics.
 * @param id Request id to validate.
 * @param expectsResponse Whether a response is expected for this request.
 * @returns Void.
 */
function validateRequestId(id: number, expectsResponse: boolean) {
  if (!Number.isInteger(id) || id < 0 || id > MAX_REQUEST_ID) {
    throw new Error(`Request id must be a u32 between 0 and ${MAX_REQUEST_ID}`);
  }

  if (expectsResponse && id === 0) {
    throw new Error("Request id 0 cannot be used when a response is expected");
  }
}

/**
 * Writes a protocol message payload as a framed unidirectional transport stream.
 * Uses a persistent stream, and retries once if the stream was closed by the receiver.
 * @param connection Active connection instance.
 * @param payload Encoded message payload bytes.
 * @returns Promise that resolves when frame writing is complete.
 */
async function writeMessageOnPersistentStream(
  connection: ActiveConnection,
  payload: Uint8Array,
) {
  if (payload.byteLength >= CLOSE_FRAME_LEN) {
    throw new Error("Message too large for transport frame");
  }

  const frame = new Uint8Array(4 + payload.byteLength);
  writeU32(frame, 0, payload.byteLength);
  frame.set(payload, 4);

  const writeAndCatch = async (): Promise<boolean> => {
    try {
      if (!connection.sendStream || !connection.sendWriter) {
        connection.sendStream =
          await connection.transport.createUnidirectionalStream();
        connection.sendWriter = connection.sendStream.getWriter();
      }

      logBinaryMessage("Outgoing", frame);
      await connection.sendWriter.write(frame);
      return true;
    } catch {
      return false;
    }
  };

  const firstResult = await writeAndCatch();
  if (firstResult) return;

  // Retry once
  connection.sendWriter?.releaseLock();
  connection.sendWriter = null;
  connection.sendStream = null;

  const secondResult = await writeAndCatch();
  if (secondResult) return;

  connection.sendWriter = null;
  connection.sendStream = null;

  throw new Error("Transport stream closed during send");
}

/**
 * Writes a close sentinel frame to the transport.
 * @param transport Active transport instance.
 * @returns Promise that resolves when the close frame is written.
 */
async function writeCloseFrame(transport: WebTransportLike) {
  const stream = await transport.createUnidirectionalStream();
  const writer = stream.getWriter();

  try {
    const frame = new Uint8Array(4);
    writeU32(frame, 0, CLOSE_FRAME_LEN);
    await writer.write(frame);
    await writer.close();
  } finally {
    writer.releaseLock();
  }
}

/**
 * Reads a byte stream and emits each framed protocol message it contains.
 * @param stream Incoming byte stream for a single unidirectional transport stream.
 * @param connection Active connection instance.
 * @param handleIncomingFrame Handler for decoded protocol messages.
 * @param handleDecodeFailure Handler for recoverable frame decode failures.
 * @param discardFrames Whether frames should be drained and discarded.
 * @returns True when the peer close sentinel was received.
 */
async function processIncomingStream(
  stream: ReadableStream<Uint8Array>,
  connection: ActiveConnection,
  handleIncomingFrame: (message: TypedMessage) => void,
  handleDecodeFailure: (error: RecoverableMessageDecodeError) => void,
  handleStreamFailure: (connection: ActiveConnection, error?: unknown) => void,
  discardFrames: boolean,
) {
  const reader = stream.getReader();
  let bufferedBytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  let peerCloseDetected = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      bufferedBytes = appendBytes(bufferedBytes, value);

      if (discardFrames || peerCloseDetected) {
        bufferedBytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
        continue;
      }

      while (bufferedBytes.byteLength >= 4) {
        const declaredLength = readU32(bufferedBytes, 0);

        if (declaredLength === CLOSE_FRAME_LEN) {
          peerCloseDetected = true;
          bufferedBytes = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;

          try {
            connection.transport.close({
              closeCode: APPLICATION_CLOSE_CODE,
              reason: APPLICATION_CLOSE_REASON,
            });
          } catch {
            // Ignore close errors during peer shutdown.
          }

          handleStreamFailure(
            connection,
            new Error("Transport closed by peer"),
          );
          break;
        }

        const expectedLength = 4 + declaredLength;
        if (bufferedBytes.byteLength < expectedLength) {
          break;
        }

        const frameBytes = bufferedBytes.subarray(0, expectedLength);
        bufferedBytes = bufferedBytes.subarray(expectedLength);

        logBinaryMessage("Incoming", frameBytes);

        try {
          handleIncomingFrame(decodeCommunicationMessage(frameBytes));
        } catch (error) {
          if (error instanceof RecoverableMessageDecodeError) {
            handleDecodeFailure(error);
          } else {
            throw error;
          }
        }

        // Just like the backend, drop the stream after receiving exactly one incoming message!
        return peerCloseDetected;
      }
    }

    if (!discardFrames && !peerCloseDetected && bufferedBytes.byteLength > 0) {
      throw new Error("Received truncated transport frame");
    }

    return peerCloseDetected;
  } finally {
    // We cancel the reader to signal the stream is naturally dropped, matching Rust's receiver behavior.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Concatenates two byte arrays.
 * @param left Existing buffered bytes.
 * @param right Newly received bytes.
 * @returns Concatenated bytes.
 */
function appendBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength === 0) {
    return right;
  }

  const buffer = new Uint8Array(
    left.byteLength + right.byteLength,
  ) as Uint8Array<ArrayBufferLike>;
  buffer.set(left, 0);
  buffer.set(right, left.byteLength);
  return buffer;
}

/**
 * Writes a big-endian unsigned 32-bit integer to a byte buffer.
 * @param buffer Destination byte buffer.
 * @param offset Byte offset to write at.
 * @param value Unsigned 32-bit integer value.
 * @returns Void.
 */
function writeU32(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(
    offset,
    value,
    false,
  );
}

/**
 * Reads a big-endian unsigned 32-bit integer from a byte buffer.
 * @param buffer Source byte buffer.
 * @param offset Byte offset to read from.
 * @returns Unsigned 32-bit integer value.
 */
function readU32(buffer: Uint8Array, offset: number) {
  return new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  ).getUint32(offset, false);
}
