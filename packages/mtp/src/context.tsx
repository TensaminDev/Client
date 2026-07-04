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
import { ConnectionState } from "./values";
import createAsyncQueue, {
  createQueuedFunc,
} from "@tensamin/shared/asyncQueue";
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

const PUSH_TYPES = [
  "message_live",
  "message_state",
  "call_invite",
  "error_no_iota",
] as const;

const WIRE_TYPES = {
  temp_cool_type: "TempCoolType",
  get_user_data: "GetUserData",
  change_user_data: "ChangeUserData",
  ping: "AppPing",
  message_live: "MessageLive",
  messages_get: "MessagesGet",
  message_send: "MessageSend",
  add_conversation: "AddConversation",
  message_state: "MessageState",
  load_txt_record: "LoadTxtRecord",
  authenticate_app: "AuthenticateApp",
  create_app: "CreateApp",
  call_token: "CallToken",
  call_data: "CallData",
  call_invite: "CallInvite",
  error_no_iota: "ErrorNoIota",
} as const satisfies Record<keyof Schemas & string, string>;

const APP_TYPES = Object.fromEntries(
  Object.entries(WIRE_TYPES).map(([appType, wireType]) => [wireType, appType]),
) as Record<string, keyof Schemas & string>;

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
  const appType = APP_TYPES[message.type] ?? message.type;

  if (appType.startsWith("error")) {
    return { ...message, type: appType } as ProtocolMessage<T>;
  }

  const schema = schemas[type]?.response;
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
    type: appType,
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
    load("mtp_url").then(setMtpUrl);
  }, [load]);

  // Validation override functions
  const send: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;

      if (!client) {
        throw new Error("mtp is not connected");
      }

      const message = await client.request(
        WIRE_TYPES[type],
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

    return client.subscribe(WIRE_TYPES[type], (message) => {
      handler(validateResponse(type, message));
    });
  }, []);

  const subscribePush = useCallback((handler: PushHandler) => {
    const client = clientRef.current;
    if (!client) {
      return () => {};
    }

    const unsubscribers = PUSH_TYPES.map((type) =>
      client.subscribe(WIRE_TYPES[type], (message) => {
        handler(validateResponse(type as keyof Schemas & string, message));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // No Iota check
  useEffect(() => {
    if (!connected) return;

    return subscribe("error_no_iota", () => {
      setIdentified(false);
      setIdentifying(false);
      sonnerToast.error("We couldn't reach your Iota", {
        description:
          "Check your network connection and try restarting your Iota",
        icon: null,
        duration: Infinity,
        closeButton: true,
      });
    });
  }, [connected, subscribe]);

  // Custom Pings
  useEffect(() => {
    if (!connected || !identified) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const originalNow = Date.now();
        const data = await send("ping", { LastPing: originalNow });
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

    let resolveConnection: (() => void) | null = null;

    if (!props.blockConnection) {
      sonnerToast.promise(
        new Promise<void>((resolve) => {
          resolveConnection = resolve;
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

        log(2, "mtp", "purple", "Fetching Omikron data.");
        const data = await fetch(
          `${mtpUrl}api/get/omikron/${await load("user_id")}`,
        );

        if (data.status === 404) {
          sonnerToast.error("We couldn't reach your Iota", {
            description:
              "Check your network connection and try restarting your Iota",
            icon: null,
            duration: Infinity,
            closeButton: true,
          });
          resolveConnection?.();
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
        //codec.decode(new Uint8Array(await res.arrayBuffer())),

        if (
          !omikronData.ip_address ||
          !omikronData.port ||
          !omikronData.public_key
        )
          throw new Error("Invalid Omikron data");

        const url = `https://${omikronData.ip_address}:${omikronData.port}`;

        log(2, "mtp", "green", "Connecting to: " + url);

        const client = await MTPClient.create({
          url,
          storage: {
            getItem: (key) => {
              console.log(key);
              return key;
            },
            removeItem: (key) => {
              console.log(key);
            },
            setItem: console.log,
          },
          credentials: {
            clientId: await load("user_id"),
            keyring: base64ToUint8Array(await load("private_key")),
          },
          hostPublicKey: omikronData.public_key,
          descriptor: "client",
          pings: true,
          logger: (event) => {
            if (event.type === "state") {
              setReadyState(
                clientRef.current?.state ?? ConnectionState.Disconnected,
              );
            }

            if (event.type !== "Pong") {
              log(
                2,
                "mtp",
                event.type === "state" ? "cyan" : "blue",
                event.type === "state" ? event.data : event.type,
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

        const authPayload = new Promise<ProtocolMessage<"temp_cool_type">>(
          (resolve, reject) => {
            const unsubscribe = client.subscribe("TempCoolType", (message) => {
              try {
                unsubscribe();
                resolve(validateResponse("temp_cool_type", message));
              } catch (authPayloadError) {
                unsubscribe();
                reject(authPayloadError);
              }
            });
          },
        );

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

        setFreshContacts(finalResponse.data.contacts);
        setFreshCommunities(finalResponse.data.communities ?? []);
        setFreshCalls(finalResponse.data.calls);
        setIdentifying(false);
        setIdentified(true);
        resolveConnection?.();
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
                ? connectError.message
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

  return (
    <MTPContext.Provider
      value={{
        send: createQueuedFunc(() => (contextReady ? send : null)),
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
