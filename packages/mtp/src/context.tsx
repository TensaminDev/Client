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
import type { z } from "zod";

import {
  type Calls,
  type Communities,
  type Contacts,
  mtp as schemas,
  type MTP as Schemas,
} from "@tensamin/shared/data";
import { log } from "@tensamin/shared/log";
import { useStorage } from "@tensamin/storage/context";
import { ErrorScreen, LoadingScreen as Loading } from "@tensamin/ui";

import {
  PING_INTERVAL,
  RECONNECT_RESET,
  RECONNECT_TRIES,
  RETRY_INTERVAL,
} from "./values";

const READY_STATE = {
  CLOSED: 0,
  CONNECTING: 1,
  OPEN: 2,
} as const;

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

function toPascalCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function mapDataKeys(value: unknown, mapKey: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapDataKeys(item, mapKey));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      mapKey(key),
      mapDataKeys(entry, mapKey),
    ]),
  );
}

function validateResponse<T extends keyof Schemas & string>(
  type: T,
  message: { id?: number; type: string; data: unknown },
): ProtocolMessage<T> {
  const appType = APP_TYPES[message.type] ?? message.type;
  const data = mapDataKeys(message.data, toSnakeCase);

  if (appType.startsWith("error")) {
    return { ...message, type: appType, data } as ProtocolMessage<T>;
  }

  const schema = schemas[type]?.response;
  if (!schema) {
    return message as ProtocolMessage<T>;
  }

  const parsed = schema.safeParse(data);
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

  const [readyState, setReadyState] = useState<number>(READY_STATE.CLOSED);
  const [connected, setConnected] = useState<boolean>(false);
  const [identified, setIdentified] = useState<boolean>(false);
  const [identifying, setIdentifying] = useState<boolean>(false);

  const [ownPing, setOwnPing] = useState<number>(0);
  const [iotaPing, setIotaPing] = useState<number>(0);

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [freshCommunities, setFreshCommunities] = useState<Communities>([]);
  const [freshContacts, setFreshContacts] = useState<Contacts>([]);
  const [freshCalls, setFreshCalls] = useState<Calls>([]);

  const clientRef = useRef<Awaited<ReturnType<typeof MTPClient.create>> | null>(
    null,
  );

  const [mtpUrl, setMtpUrl] = useState<string | null>(null);
  useEffect(() => {
    load("mtp_url").then(setMtpUrl);
  }, [load]);

  const send: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;

      if (!client) {
        throw new Error("mtp is not connected");
      }

      const message = await client.request(
        WIRE_TYPES[type],
        mapDataKeys(data ?? {}, toPascalCase) as Record<string, unknown>,
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

  useEffect(() => {
    if (!connected) return;

    return subscribe("error_no_iota", () => {
      setIdentified(false);
      setIdentifying(false);
      setError("We couldn't reach your Iota");
      setErrorDescription(
        "You could try to restart your Iota, check for updates or check your network connection.",
      );
    });
  }, [connected, subscribe]);

  useEffect(() => {
    if (!connected || !identified) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const originalNow = Date.now();
        const data = await send("ping", { last_ping: originalNow });
        setOwnPing(Date.now() - originalNow);

        const remotePing = data.data.ping_iota;
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

  useEffect(() => {
    if (!mtpUrl) {
      return;
    }
    const url = mtpUrl;

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

    const scheduleReconnectReset = () => {
      clearReconnectResetTimer();
      reconnectResetTimer = setTimeout(() => {
        attempts = 0;
        reconnectResetTimer = null;
      }, RECONNECT_RESET * 1_000);
    };

    const scheduleReconnect = (reason?: unknown) => {
      if (disposed || reconnectScheduled) return;

      if (attempts >= RECONNECT_TRIES) {
        setError("Connection Failed");
        setErrorDescription(
          "Unable to connect to the server after multiple attempts. Please check your internet connection or try again later.",
        );
        log(0, "mtp", "red", "Reconnection attempts exhausted", reason);
        return;
      }

      attempts += 1;
      reconnectScheduled = true;
      reconnectTimer = setTimeout(() => {
        reconnectScheduled = false;
        reconnectTimer = null;
        void connect();
      }, RETRY_INTERVAL);
    };

    async function connect() {
      if (disposed || props.blockConnection) {
        return;
      }

      try {
        setReadyState(READY_STATE.CONNECTING);
        setConnected(false);
        setIdentified(false);
        setIdentifying(false);

        await MTPClient.init();
        const client = await MTPClient.create({
          url,
          pings: true,
          logger: (event) => {
            log(2, "mtp", event.type === "state" ? "cyan" : "blue", event.type === "state" ? event.data : event.type, event);
          },
        });

        if (disposed) {
          client.disconnect();
          return;
        }

        clientRef.current = client;
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
        scheduleReconnectReset();
        setReadyState(READY_STATE.OPEN);
        setConnected(true);
        setIdentifying(true);
        setError("");
        setErrorDescription("");

        await client.auth();
        const finalResponse = await authPayload;

        if (disposed || clientRef.current !== client) {
          return;
        }

        setFreshContacts(finalResponse.data.contacts);
        setFreshCommunities(finalResponse.data.communities ?? []);
        setFreshCalls(finalResponse.data.calls);
        setIdentifying(false);
        setIdentified(true);
      } catch (connectError) {
        if (disposed) return;

        clientRef.current?.disconnect();
        clientRef.current = null;
        clearReconnectResetTimer();
        setReadyState(READY_STATE.CLOSED);
        setConnected(false);
        setIdentified(false);
        setIdentifying(false);
        log(
          0,
          "mtp",
          "red",
          "Connection/authentication attempt failed",
          getProtocolErrorDetails(connectError) ?? connectError,
        );
        scheduleReconnect(connectError);
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
      setError("");
      setErrorDescription("");

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
      setReadyState(READY_STATE.CLOSED);
      setConnected(false);
      setIdentified(false);
      setIdentifying(false);
    };
  }, [mtpUrl, props.blockConnection]);

  const progress = useMemo(() => {
    if (!mtpUrl) return 10;
    if (readyState === READY_STATE.CONNECTING) return 30;
    if (!connected) return 45;
    if (identifying) return 75;
    if (!identified) return 90;
    return 100;
  }, [connected, identified, identifying, readyState, mtpUrl]);

  const loadingTitle = useMemo(() => {
    if (!mtpUrl) return "Looking up configuration";
    if (readyState === READY_STATE.CONNECTING || !connected)
      return "Connecting to Tensamin";
    if (identifying || !identified) return "Identifying secure session";
    return "Loading";
  }, [connected, identified, identifying, readyState, mtpUrl]);

  const loadingDescription = useMemo(() => {
    if (!mtpUrl) return "Loading connection details";
    if (readyState === READY_STATE.CONNECTING || !connected) {
      return "Establishing transport channel";
    }
    if (identifying || !identified) return "Waiting for authenticated session";
    return undefined;
  }, [connected, identified, identifying, readyState, mtpUrl]);

  if (error !== "" && errorDescription !== "") {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (!connected || !identified || !mtpUrl) {
    return (
      <Loading
        progress={progress}
        title={loadingTitle}
        description={loadingDescription}
        fullscreen
      />
    );
  }

  return (
    <MTPContext.Provider
      value={{
        send,
        subscribe,
        subscribePush,
        readyState,
        ownPing,
        iotaPing,
        identified,
        freshContacts,
        freshCommunities,
        freshCalls,
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
