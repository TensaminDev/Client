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
import { isTauri } from "@tauri-apps/api/core";
import { onResume } from "tauri-plugin-app-events-api";
import { MTPClient } from "mtp";
import { type z } from "zod";
import { ConnectionState } from "mtp";
import createAsyncQueue from "@tensamin/shared/asyncQueue";
import { toast as sonnerToast } from "@tensamin/ui";
import { Loader2 } from "lucide-react";

import {
  type Calls,
  type Communities,
  type Contacts,
  mtp as schemas,
  type MTP as Schemas,
} from "@tensamin/shared/data";
import { log } from "@tensamin/shared/log";
import { useStorage } from "@tensamin/storage/context";

import {
  PING_INTERVAL,
  RECONNECT_RESET,
  RECONNECT_TRIES,
  RETRY_INTERVAL,
} from "./values";

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

export type PushHandler = (message: ProtocolMessage) => void;

type ContextType = {
  send: BoundSendFn;
  subscribe: <T extends keyof Schemas & string>(
    type: T,
    handler: (message: ProtocolMessage<T>) => void,
  ) => () => void;
  subscribePush: (handler: PushHandler) => () => void;
  readyState: number;
  ownPing: number;
  iotaPing: number;
  identified: boolean;
  freshContacts: Contacts;
  freshCommunities: Communities;
  freshCalls: Calls;
  contextReady: boolean;
  loadingDescription: string;
};

const MTPContext = createContext<ContextType | undefined>(undefined);

function isTauriMobile() {
  return isTauri() && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
}

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

export function Provider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const { load } = useStorage();

  const [readyState, setReadyState] = useState<number>(
    ConnectionState.Disconnected,
  );
  const [identified, setIdentified] = useState<boolean>(false);
  const [identifying, setIdentifying] = useState<boolean>(false);

  const [ownPing, setOwnPing] = useState<number>(0);
  const [iotaPing, setIotaPing] = useState<number>(0);

  const [freshCommunities, setFreshCommunities] = useState<Communities>([]);
  const [freshContacts, setFreshContacts] = useState<Contacts>([]);
  const [freshCalls, setFreshCalls] = useState<Calls>([]);

  const clientRef = useRef<Awaited<ReturnType<typeof MTPClient.create>> | null>(
    null,
  );

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

  const subscribePush = useCallback((handler: PushHandler) => {
    const client = clientRef.current;
    if (!client) {
      return () => {};
    }

    const unsubscribers = [
      "MessageLive",
      "MessageState",
      "ChatSecretForward",
      "CallInvite",
      "ErrorNoIota",
    ].map((type) =>
      client.subscribe(type, (message) => {
        handler(validateResponse(type as keyof Schemas & string, message));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // Custom Pings
  useEffect(() => {
    if (!connected || !identified) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const originalNow = Date.now();
        const data = await send("Ping", { LastPing: originalNow });
        setOwnPing(Date.now() - originalNow);

        const remotePing = data.data.PingIota;
        if (typeof remotePing === "number") {
          setIotaPing(remotePing);
        }
      } catch (intervalError) {
        log(1, "mtp", "yellow", "Ping failed", intervalError);
      }
    }, PING_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [connected, identified, send]);

  // Reconnect stuff
  const resolveConnectionRef = useRef(() => {});
  useEffect(() => {
    if (!mtpUrl) return;

    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectResetTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectScheduled = false;
    let disposed = false;
    let resumeListenerRegistered = false;

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

    if (!props.blockConnection) {
      sonnerToast.promise(
        new Promise<void>((resolve) => {
          resolveConnectionRef.current = resolve;
        }),
        {
          id: "mtp-connection-toast",
          loading: "Connecting to server...",
          icon: (
            <div className="animate-spin aspect-square m-0! flex justify-center items-center">
              <Loader2 size={16} className="aspect-square m-0!" />
            </div>
          ),
          duration: Infinity,
        },
      );
    }

    async function connect() {
      if (disposed || props.blockConnection) return;

      const cleanup = () => {
        clientRef.current?.disconnect();
        clientRef.current = null;
        clearReconnectResetTimer();
        setReadyState(ConnectionState.Disconnected);
        setIdentified(false);
        setIdentifying(false);
      };
      try {
        setIdentified(false);
        setIdentifying(false);

        await MTPClient.init();

        const userId = await load("user_id");
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

        const client = await MTPClient.create({
          url,
          credentials: {
            clientId: userId,
            keyring: base64ToUint8Array(await load("mtp_keyring")),
          },
          hostPublicKey: omikronPublicKey,
          descriptor: "client",
          pings: true,
          logger: (event) => {
            if (event.type === "state") {
              setReadyState(
                clientRef.current?.state ?? ConnectionState.Disconnected,
              );
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

        if (disposed) {
          client.disconnect();
          return;
        }

        clientRef.current = client;
        setReadyState(client.state);
        await client.connect();

        if (disposed) {
          client.disconnect();
          return;
        }

        const authPayload = new Promise<
          ProtocolMessage<"IdentificationResponse">
        >((resolve, reject) => {
          const unsubscribe = client.subscribe(
            "IdentificationResponse",
            (message) => {
              try {
                unsubscribe();
                resolve(validateResponse("IdentificationResponse", message));
              } catch (authPayloadError) {
                unsubscribe();
                reject(authPayloadError);
              }
            },
          );
        });

        clearReconnectTimer();

        // Schedule reconnect reset
        clearReconnectResetTimer();
        reconnectResetTimer = setTimeout(() => {
          attempts = 0;
          reconnectResetTimer = null;
        }, RECONNECT_RESET * 1_000);

        setReadyState(client.state);
        setIdentifying(true);

        await client.auth();
        const finalResponse = await authPayload;

        if (disposed || clientRef.current !== client) return;

        setFreshContacts(finalResponse.data.Contacts);
        setFreshCommunities(finalResponse.data.Communities);
        setFreshCalls(finalResponse.data.Calls);
        setIdentifying(false);
        setIdentified(true);
        resolveConnectionRef.current?.();
      } catch (connectError) {
        if (disposed) return;
        cleanup();
        log(
          0,
          "mtp",
          "red",
          "Connection/authentication attempt failed",
          getProtocolErrorDetails(connectError) ?? connectError,
        );

        // Schedule reconnect
        if (disposed || reconnectScheduled) return;
        if (attempts >= RECONNECT_TRIES) {
          log(0, "mtp", "red", "Reconnection attempts exhausted", connectError);
          sonnerToast.error("Connection failed", {
            id: "mtp-connection-toast",
            description:
              connectError instanceof Error
                ? connectError.message.split(":")[0]
                : String(connectError ?? "Unknown error"),
            icon: null,
            duration: Infinity,
            closeButton: true,
            promise: null,
          } as unknown as Parameters<typeof sonnerToast.error>[1]);
          return;
        }

        attempts += 1;

        // Show loading toast
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
      }
    }

    async function reconnectAfterResume() {
      if (disposed) return;

      clientRef.current?.disconnect();
      clientRef.current = null;
      clearReconnectTimer();
      clearReconnectResetTimer();
      attempts = 0;
      reconnectScheduled = false;
      await connect();
    }

    void connect();

    if (!props.blockConnection && isTauriMobile()) {
      resumeListenerRegistered = true;
      onResume(() => {
        void reconnectAfterResume();
      });
    }

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearReconnectResetTimer();

      if (resumeListenerRegistered) {
        onResume();
      }

      clientRef.current?.disconnect();
      clientRef.current = null;
      setReadyState(ConnectionState.Disconnected);
      setIdentified(false);
      setIdentifying(false);
      sonnerToast.dismiss("mtp-connection-toast");
    };
  }, [mtpUrl, props.blockConnection, load]);

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
      return mtp.send(type, data, options);
    },
    [mtpRef],
  );

  return (
    <MTPContext.Provider
      value={{
        send: sendQueued,
        subscribe,
        subscribePush,
        readyState,
        ownPing,
        iotaPing,
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

export function useMTP(): ContextType {
  const context = useContext(MTPContext);
  if (!context) {
    throw new Error("useMTP must be used within an MTPProvider");
  }
  return context;
}
