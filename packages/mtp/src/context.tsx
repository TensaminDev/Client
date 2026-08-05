import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { MTPClient } from "mtp";
import { type z } from "zod";
import { ConnectionState } from "mtp";
import createAsyncQueue from "@tensamin/shared/asyncQueue";
import { toast as sonnerToast } from "@methanium/ui";

import {
  type Calls,
  type Communities,
  type Contacts,
  mtp as schemas,
  type MTP as Schemas,
} from "@tensamin/shared/data";
import { log } from "@tensamin/shared/log";
import { useStorage } from "@tensamin/storage/context";

import { RECONNECT_RESET, RECONNECT_TRIES, RETRY_INTERVAL } from "./values";

function base64ToUint8Array(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
}

export type ProtocolMessage<
  T extends keyof Schemas & string = keyof Schemas & string,
> = {
  id?: number;
  type: T | string;
  data: z.infer<Schemas[T]["response"]>;
};

export type BoundSendFn = <T extends keyof Schemas & string>(
  type: T,
  data?: z.infer<Schemas[T]["request"]>,
  options?: { id?: number },
) => Promise<ProtocolMessage<T>>;

export type PushHandler = (message: ProtocolMessage) => void | Promise<void>;

const PUSH_TYPES = [
  "MessageLive",
  "MessageEditLive",
  "MessageReactionLive",
  "MessageDeleteLive",
  "MessageState",
  "CallInvite",
  "ErrorNoIota",
] as const;

export type MTPExchange = {
  type: keyof Schemas & string;
  data: unknown;
  response: ProtocolMessage;
};

export type MTPInterceptor = (exchange: MTPExchange) => void | Promise<void>;

type ContextType = {
  send: BoundSendFn;
  subscribe: <T extends keyof Schemas & string>(
    type: T,
    handler: (message: ProtocolMessage<T>) => void,
  ) => () => void;
  subscribePush: (handler: PushHandler) => () => void;
  addInterceptor: (interceptor: MTPInterceptor) => () => void;
  readyState: number;
  identified: boolean;
  freshContacts: Contacts;
  freshCommunities: Communities;
  freshCalls: Calls;
  contextReady: boolean;
  loadingDescription: string;
};

const MTPContext = createContext<ContextType | undefined>(undefined);

function getProtocolErrorDetails(error: unknown) {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return null;
  }

  const protocolError = error as {
    id?: unknown;
    type?: unknown;
    data?: unknown;
  };
  return {
    id: protocolError.id,
    type: protocolError.type,
    data: protocolError.data,
  };
}

// Zod schema validation
function validateResponse<T extends keyof Schemas & string>(
  type: T,
  message: { id?: number; type: string; data: unknown },
): ProtocolMessage<T> {
  if (message.type.startsWith("Error")) {
    return message as ProtocolMessage<T>;
  }

  const schema =
    schemas[message.type as keyof Schemas & string]?.response ??
    schemas[type]?.response;
  if (!schema) {
    return message as ProtocolMessage<T>;
  }

  const parsed = schema.safeParse(message.data);
  if (!parsed.success) {
    throw new Error(
      `Response validation failed for ${type}: ${parsed.error.message}`,
    );
  }

  return {
    id: message.id,
    type: message.type,
    data: parsed.data,
  } as ProtocolMessage<T>;
}

function useMessageHandlers() {
  const interceptorsRef = useRef(new Set<MTPInterceptor>());
  const pushHandlersRef = useRef(new Set<PushHandler>());
  const subscribePush = useCallback((handler: PushHandler) => {
    pushHandlersRef.current.add(handler);
    return () => pushHandlersRef.current.delete(handler);
  }, []);
  const addInterceptor = useCallback((interceptor: MTPInterceptor) => {
    interceptorsRef.current.add(interceptor);
    return () => interceptorsRef.current.delete(interceptor);
  }, []);
  return { addInterceptor, interceptorsRef, pushHandlersRef, subscribePush };
}

function BrowserProvider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const { load } = useStorage();

  const [readyState, setReadyState] = useState<number>(
    ConnectionState.Disconnected,
  );
  const [identified, setIdentified] = useState<boolean>(false);
  const [identifying, setIdentifying] = useState<boolean>(false);

  const [freshCommunities, setFreshCommunities] = useState<Communities>([]);
  const [freshContacts, setFreshContacts] = useState<Contacts>([]);
  const [freshCalls, setFreshCalls] = useState<Calls>([]);

  const clientRef = useRef<Awaited<ReturnType<typeof MTPClient.create>> | null>(
    null,
  );
  const { addInterceptor, interceptorsRef, pushHandlersRef, subscribePush } =
    useMessageHandlers();

  const connected = readyState === ConnectionState.Connected;

  // MTP url
  const [mtpUrl, setMtpUrl] = useState<string | null>(null);
  useEffect(() => {
    load("omega_url").then(setMtpUrl);
  }, [load]);

  // Validation override functions
  const send: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;

      if (!client) {
        throw new Error("mtp is not connected");
      }

      const message = await client.request(
        type,
        (data ?? {}) as Record<string, unknown>,
        options,
      );
      return validateResponse(type, message);
    },
    [],
  );

  const subscribe = useCallback<ContextType["subscribe"]>((type, handler) => {
    const client = clientRef.current;
    if (!client) {
      return () => {};
    }

    return client.subscribe(type, (message) => {
      handler(validateResponse(type, message));
    });
  }, []);

  // Reconnect stuff
  const resolveConnectionRef = useRef(() => {});
  useEffect(() => {
    if (!mtpUrl) return;

    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectResetTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectScheduled = false;
    let disposed = false;
    let connectionGeneration = 0;

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectScheduled = false;
    };

    const clearReconnectResetTimer = () => {
      if (!reconnectResetTimer) return;
      clearTimeout(reconnectResetTimer);
      reconnectResetTimer = null;
    };

    const scheduleReconnect = (error: unknown) => {
      if (disposed || reconnectScheduled) return;
      if (attempts >= RECONNECT_TRIES) {
        log(0, "mtp", "red", "Reconnection attempts exhausted", error);
        sonnerToast.error("Connection failed", {
          id: "mtp-connection-toast",
          description:
            error instanceof Error
              ? error.message.split(":")[0]
              : "Connection lost",
          icon: null,
          duration: Infinity,
          closeButton: true,
          promise: null,
        } as unknown as Parameters<typeof sonnerToast.error>[1]);
        return;
      }

      attempts += 1;
      sonnerToast.loading(
        `Reconnecting to server... (attempt ${attempts} of ${RECONNECT_TRIES})`,
        { id: "mtp-connection-toast" },
      );
      reconnectScheduled = true;
      reconnectTimer = setTimeout(() => {
        reconnectScheduled = false;
        reconnectTimer = null;
        void connect();
      }, RETRY_INTERVAL);
    };

    async function connect() {
      if (disposed || props.blockConnection) return;

      const generation = ++connectionGeneration;
      let client: Awaited<ReturnType<typeof MTPClient.create>> | null = null;
      let failed = false;
      const cleanup = () => {
        client?.disconnect();
        if (clientRef.current === client) {
          clientRef.current = null;
        }
        clearReconnectResetTimer();
        if (generation === connectionGeneration) {
          setReadyState(ConnectionState.Disconnected);
          setIdentified(false);
          setIdentifying(false);
        }
      };
      try {
        setIdentified(false);
        setIdentifying(false);

        const [userId, keyring] = await Promise.all([
          load("user_id"),
          load("mtp_keyring"),
        ]);
        if (!userId || !keyring) {
          throw new Error("Missing login credentials");
        }
        const forcedOmikronUrl = await load("forced_omikron_url");
        const forcedOmikronPublicKey = await load("forced_omikron_public_key");

        let url = null;
        let omikronPublicKey = null;
        if (forcedOmikronUrl && forcedOmikronPublicKey) {
          url = forcedOmikronUrl;
          omikronPublicKey = forcedOmikronPublicKey;
        } else {
          log(2, "mtp", "purple", "Fetching Omikron data.");
          const data = await fetch(`${mtpUrl}api/get/omikron/${userId}`);

          if (data.status === 404) {
            sonnerToast.error("We couldn't reach your Iota", {
              description:
                "Check your network connection and try restarting your Iota",
              icon: null,
              duration: Infinity,
              closeButton: true,
            });
            resolveConnectionRef.current?.();
            cleanup();
            return;
          }
          const omikronData = (await data.json()) as {
            id: number;
            ip_address: string;
            port: number;
            public_key: string;
            status: string;
          };

          if (
            !omikronData.ip_address ||
            !omikronData.port ||
            !omikronData.public_key
          )
            throw new Error("Invalid Omikron data");

          url = `https://${omikronData.ip_address}:${omikronData.port}`;
          omikronPublicKey = omikronData.public_key;
        }
        //codec.decode(new Uint8Array(await res.arrayBuffer())),

        if (!url || !omikronPublicKey)
          throw new Error("Missing Omikron URL or Public Key");

        log(2, "mtp", "green", "Connecting to: " + url);

        client = await MTPClient.create({
          url,
          credentials: {
            clientId: userId,
            keyring: base64ToUint8Array(keyring),
          },
          hostPublicKey: omikronPublicKey,
          descriptor: "client",
          pings: true,
          logger: (event) => {
            if (event.type === "state") {
              if (generation !== connectionGeneration) return;
              const state = client?.state ?? ConnectionState.Disconnected;
              setReadyState(state);
              if (
                state === ConnectionState.Disconnected &&
                clientRef.current === client &&
                !failed
              ) {
                failed = true;
                clientRef.current = null;
                setIdentified(false);
                setIdentifying(false);
                scheduleReconnect(new Error("MTP connection lost"));
              }
            }

            if (event.type !== "Pong" && event.type !== "Ping") {
              log(
                2,
                "mtp",
                event.type === "state"
                  ? "purple"
                  : event.direction === "recv"
                    ? "cyan"
                    : event.direction === "send"
                      ? "gray"
                      : "blue",
                event.type === "state"
                  ? event.data
                  : event.direction === "recv"
                    ? "< " + event.type
                    : event.direction === "send"
                      ? "> " + event.type
                      : event.type,
                event,
              );
            }
          },
        });

        if (disposed || generation !== connectionGeneration) {
          client.disconnect();
          return;
        }
        const activeClient = client;

        clientRef.current = activeClient;
        for (const type of PUSH_TYPES) {
          activeClient.subscribe(type, (message) => {
            let validated: ProtocolMessage;
            try {
              validated = validateResponse(type, message);
            } catch (error) {
              log(1, "mtp", "red", "Failed to validate push message", error, {
                type,
                data: message.data,
              });
              return;
            }

            for (const handler of [...pushHandlersRef.current]) {
              void Promise.resolve()
                .then(() => handler(validated))
                .catch((error) => {
                  log(1, "mtp", "red", "Push handler failed", error, { type });
                });
            }
          });
        }
        setReadyState(activeClient.state);

        clearReconnectTimer();

        // Schedule reconnect reset
        clearReconnectResetTimer();
        reconnectResetTimer = setTimeout(() => {
          attempts = 0;
          reconnectResetTimer = null;
        }, RECONNECT_RESET * 1_000);

        setReadyState(activeClient.state);
        setIdentifying(true);

        const stateSync = new Promise<ProtocolMessage<"ClientStateSync">>(
          (resolve, reject) => {
            let unsubscribeStateSync = () => {};
            let unsubscribeNoIota = () => {};
            const cleanupStateSync = () => {
              clearTimeout(timeout);
              unsubscribeStateSync();
              unsubscribeNoIota();
            };
            const timeout = setTimeout(() => {
              cleanupStateSync();
              reject(new Error("Initial state synchronization timed out"));
            }, 120_000);
            unsubscribeStateSync = activeClient.subscribe(
              "ClientStateSync",
              (message) => {
                cleanupStateSync();
                try {
                  resolve(validateResponse("ClientStateSync", message));
                } catch (error) {
                  reject(error);
                }
              },
            );
            unsubscribeNoIota = activeClient.subscribe("ErrorNoIota", () => {
              cleanupStateSync();
              reject(new Error("No Iota is currently connected"));
            });
          },
        );
        const [, finalResponse] = await Promise.all([
          activeClient.auth(),
          stateSync,
        ]);

        if (finalResponse.type.startsWith("Error")) {
          throw new Error(
            `State synchronization failed: ${finalResponse.type}`,
          );
        }

        const acknowledgement = await activeClient.request("ClientStateAck", {
          SessionId: finalResponse.data.SessionId,
          VersionNumber: finalResponse.data.VersionNumber,
        });
        if (acknowledgement.type.startsWith("Error")) {
          throw new Error(
            `State acknowledgement failed: ${acknowledgement.type}`,
          );
        }

        if (disposed || clientRef.current !== activeClient) return;

        setFreshContacts(finalResponse.data.Contacts);
        setFreshCommunities(finalResponse.data.Communities);
        setFreshCalls(finalResponse.data.Calls);
        setIdentifying(false);
        setIdentified(true);
        resolveConnectionRef.current?.();
      } catch (connectError) {
        if (disposed || generation !== connectionGeneration) {
          client?.disconnect();
          return;
        }
        failed = true;
        cleanup();
        const connectErrorMessage =
          connectError instanceof Error
            ? connectError.message
            : String(connectError ?? "Unknown error");
        log(
          0,
          "mtp",
          "red",
          `Connection/authentication attempt failed: ${connectErrorMessage}`,
          getProtocolErrorDetails(connectError) ?? connectError,
        );

        scheduleReconnect(connectError);
      }
    }

    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearReconnectResetTimer();

      clientRef.current?.disconnect();
      clientRef.current = null;
      setReadyState(ConnectionState.Disconnected);
      setIdentified(false);
      setIdentifying(false);
      sonnerToast.dismiss("mtp-connection-toast");
    };
  }, [mtpUrl, props.blockConnection, load, pushHandlersRef]);

  // No Iota check
  useEffect(() => {
    if (!connected) return;

    return subscribe("ErrorNoIota", () => {
      setIdentified(false);
      setIdentifying(false);
      sonnerToast.error("We couldn't reach your Iota", {
        description:
          "Check your network connection and try restarting your Iota",
        icon: null,
        duration: Infinity,
        closeButton: true,
      });
      resolveConnectionRef.current?.();
    });
  }, [connected, subscribe]);

  // Async queue
  const loadingDescription = useMemo(() => {
    if (!mtpUrl) return "Loading connection details";
    if (readyState === ConnectionState.Connecting || !connected) {
      return "Establishing transport channel";
    }
    if (identifying || !identified) return "Waiting for authenticated session";
    return "Loading...";
  }, [connected, identified, identifying, readyState, mtpUrl]);
  const contextReady = connected && identified && mtpUrl !== null;
  const mtpRef = useMemo(
    () =>
      createAsyncQueue<{
        send: typeof send;
        subscribe: typeof subscribe;
        subscribePush: typeof subscribePush;
      }>(),
    [],
  );
  useEffect(() => {
    if (connected && identified && mtpUrl) {
      mtpRef.set({
        send,
        subscribe,
        subscribePush,
      });
    }
  }, [connected, identified, mtpUrl, send, subscribe, subscribePush, mtpRef]);

  const sendQueued: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const mtp = await mtpRef.get();
      const response = await mtp.send(type, data, options);
      for (const interceptor of interceptorsRef.current) {
        void Promise.resolve(
          interceptor({ type, data, response: response as ProtocolMessage }),
        ).catch((error) => {
          log(1, "mtp", "yellow", "MTP interceptor failed", error, { type });
        });
      }
      return response;
    },
    [interceptorsRef, mtpRef],
  );

  return (
    <MTPContext.Provider
      value={{
        send: sendQueued,
        subscribe,
        subscribePush,
        addInterceptor,
        readyState,
        identified,
        freshContacts,
        freshCommunities,
        freshCalls,
        contextReady,
        loadingDescription,
      }}
    >
      {props.children}
    </MTPContext.Provider>
  );
}

type NativeSnapshot = {
  generation: number;
  readyState: number;
  identified: boolean;
  state?: unknown;
  error?: string;
};

function TauriProvider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<NativeSnapshot>({
    generation: 0,
    readyState: ConnectionState.Disconnected,
    identified: false,
  });
  const [freshContacts, setFreshContacts] = useState<Contacts>([]);
  const [freshCommunities, setFreshCommunities] = useState<Communities>([]);
  const [freshCalls, setFreshCalls] = useState<Calls>([]);
  const generationRef = useRef(0);
  const { addInterceptor, interceptorsRef, pushHandlersRef, subscribePush } =
    useMessageHandlers();
  const subscriptionsRef = useRef(
    new Map<string, Set<(message: ProtocolMessage) => void>>(),
  );

  const applySnapshot = useCallback((next: NativeSnapshot) => {
    if (next.generation < generationRef.current) return;
    generationRef.current = next.generation;
    if (next.error) {
      log(0, "android", "orange", "MTP connection failed", next.error);
    }
    setSnapshot(next);
    if (!next.identified || next.state === undefined) return;
    const parsed = schemas.ClientStateSync.response.safeParse(next.state);
    if (!parsed.success) {
      log(0, "mtp", "red", "Invalid native MTP state", parsed.error);
      return;
    }
    setFreshContacts(parsed.data.Contacts);
    setFreshCommunities(parsed.data.Communities);
    setFreshCalls(parsed.data.Calls);
  }, []);

  const dispatchMessage = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== "object" || !("type" in raw)) return;
      const message = raw as { id?: number; type: string; data: unknown };
      let validated: ProtocolMessage;
      try {
        validated = validateResponse(
          message.type as keyof Schemas & string,
          message,
        );
      } catch (error) {
        log(1, "mtp", "red", "Failed to validate native MTP message", error);
        return;
      }
      for (const handler of subscriptionsRef.current.get(validated.type) ??
        []) {
        handler(validated);
      }
      if (!(PUSH_TYPES as readonly string[]).includes(validated.type)) return;
      for (const handler of [...pushHandlersRef.current]) {
        void Promise.resolve(handler(validated)).catch((error) => {
          log(1, "mtp", "red", "Native MTP push handler failed", error, {
            type: validated.type,
          });
        });
      }
    },
    [pushHandlersRef],
  );

  useEffect(() => {
    if (props.blockConnection) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      unlisten = await listen<
        | { kind: "state"; snapshot: NativeSnapshot }
        | { kind: "message"; generation: number; message: unknown }
        | {
            kind: "log";
            level: number;
            message: string;
            details?: unknown;
          }
      >("mtp://event", ({ payload }) => {
        if (disposed) return;
        if (payload.kind === "state") {
          applySnapshot(payload.snapshot);
          return;
        }
        if (payload.kind === "message") {
          if (payload.generation === generationRef.current) {
            dispatchMessage(payload.message);
          }
          return;
        }
        log(
          payload.level,
          "android",
          "orange",
          payload.message,
          payload.details,
        );
      });
      const current = await invoke<NativeSnapshot>("mtp_status");
      if (!disposed) applySnapshot(current);
    })().catch((error) => {
      log(0, "mtp", "red", "Failed to initialize native MTP bridge", error);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applySnapshot, dispatchMessage, props.blockConnection]);

  useEffect(() => {
    if (props.blockConnection) return;
    const updateVisibility = () => {
      void invoke("mtp_set_ui_visible", {
        visible: document.visibilityState === "visible" && document.hasFocus(),
      });
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("focus", updateVisibility);
    window.addEventListener("blur", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("focus", updateVisibility);
      window.removeEventListener("blur", updateVisibility);
      void invoke("mtp_set_ui_visible", { visible: false });
    };
  }, [props.blockConnection]);

  const send = useCallback<BoundSendFn>(
    async (type, data, options) => {
      const response = await invoke<ProtocolMessage>("mtp_request", {
        typeName: type,
        data: data ?? {},
        id: options?.id,
      });
      const validated = validateResponse(type, response);
      for (const interceptor of interceptorsRef.current) {
        void Promise.resolve(
          interceptor({ type, data, response: validated as ProtocolMessage }),
        ).catch((error) => {
          log(1, "mtp", "yellow", "MTP interceptor failed", error, { type });
        });
      }
      return validated;
    },
    [interceptorsRef],
  );

  const subscribe = useCallback<ContextType["subscribe"]>((type, handler) => {
    const handlers =
      subscriptionsRef.current.get(type) ??
      new Set<(message: ProtocolMessage) => void>();
    handlers.add(handler as (message: ProtocolMessage) => void);
    subscriptionsRef.current.set(type, handlers);
    return () => {
      handlers.delete(handler as (message: ProtocolMessage) => void);
      if (handlers.size === 0) subscriptionsRef.current.delete(type);
    };
  }, []);
  const connected = snapshot.readyState === ConnectionState.Connected;
  const contextReady = connected && snapshot.identified;

  return (
    <MTPContext.Provider
      value={{
        send,
        subscribe,
        subscribePush,
        addInterceptor,
        readyState: snapshot.readyState,
        identified: snapshot.identified,
        freshContacts,
        freshCommunities,
        freshCalls,
        contextReady,
        loadingDescription: connected
          ? "Waiting for authenticated session"
          : "Establishing native transport channel",
      }}
    >
      {props.children}
    </MTPContext.Provider>
  );
}

export function Provider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    void MTPClient.init().then(
      () => {
        if (active) setWasmReady(true);
      },
      (error: unknown) => {
        if (active) setWasmError(() => error);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (wasmError) throw wasmError;
  if (!wasmReady) return null;

  return isTauri() ? (
    <TauriProvider {...props} />
  ) : (
    <BrowserProvider {...props} />
  );
}

export function useMTP(): ContextType {
  const context = useContext(MTPContext);
  if (!context) {
    throw new Error("useMTP must be used within an MTPProvider");
  }
  return context;
}
