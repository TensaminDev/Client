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

function bytesFromProtocol(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === "string") return base64ToUint8Array(value);
  throw new Error("expected protocol bytes");
}

type ParsedFrameLike = {
  id?: number;
  type: string;
  data: unknown;
};

interface MTPSessionState {
  version: 1;
  conversationId: string;
  ownClientId: bigint;
  peerClientId: bigint;
  peerPublicKey: Uint8Array;
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
  sendCount: number;
  recvCount: number;
  createdAt: number;
  updatedAt: number;
}

interface MTPSessionStorage {
  getSession(conversationId: string): Promise<MTPSessionState | null>;
  setSession(state: MTPSessionState): Promise<void>;
  deleteSession(conversationId: string): Promise<void>;
}

interface EncryptedDeviceSecretRecord {
  userId: string;
  deviceId: string;
  secretId: string;
  version: number;
  encryptedSecret: Uint8Array;
  wrappingPublicKeyId?: string;
  wrappingScheme: string;
  createdAt: number;
  updatedAt: number;
}

interface MTPEncryptedDeviceSecretProvider {
  setEncryptedDeviceSecret(record: EncryptedDeviceSecretRecord): Promise<void>;
  getEncryptedDeviceSecret(query: {
    userId: string;
    deviceId?: string;
    secretId?: string;
  }): Promise<EncryptedDeviceSecretRecord | null>;
}

function serializeSessionState(
  state: MTPSessionState,
): Record<string, unknown> {
  return {
    ...state,
    ownClientId: state.ownClientId.toString(),
    peerClientId: state.peerClientId.toString(),
    peerPublicKey: Array.from(state.peerPublicKey),
    sendChainKey: Array.from(state.sendChainKey),
    recvChainKey: Array.from(state.recvChainKey),
  };
}

function deserializeSessionState(value: unknown): MTPSessionState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.conversationId !== "string") return null;
  return {
    version: 1,
    conversationId: raw.conversationId,
    ownClientId: BigInt(String(raw.ownClientId)),
    peerClientId: BigInt(String(raw.peerClientId)),
    peerPublicKey: new Uint8Array(raw.peerPublicKey as number[]),
    sendChainKey: new Uint8Array(raw.sendChainKey as number[]),
    recvChainKey: new Uint8Array(raw.recvChainKey as number[]),
    sendCount: Number(raw.sendCount),
    recvCount: Number(raw.recvCount),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
}

class LocalMTPSessionStorage implements MTPSessionStorage {
  constructor(
    private readonly load: <K extends "e2ee_sessions">(
      key: K,
    ) => Promise<Record<string, unknown> | undefined>,
    private readonly save: <K extends "e2ee_sessions">(
      key: K,
      value: Record<string, unknown>,
    ) => Promise<void>,
  ) {}

  async getSession(conversationId: string): Promise<MTPSessionState | null> {
    const sessions = (await this.load("e2ee_sessions")) ?? {};
    return deserializeSessionState(sessions[conversationId]);
  }

  async setSession(state: MTPSessionState): Promise<void> {
    const sessions = { ...((await this.load("e2ee_sessions")) ?? {}) };
    sessions[state.conversationId] = serializeSessionState(state);
    await this.save("e2ee_sessions", sessions);
  }

  async deleteSession(conversationId: string): Promise<void> {
    const sessions = { ...((await this.load("e2ee_sessions")) ?? {}) };
    delete sessions[conversationId];
    await this.save("e2ee_sessions", sessions);
  }
}

function frameField<T>(
  frame: ParsedFrameLike,
  pascal: string,
  camel: string,
): T {
  const data = frame.data as Record<string, unknown>;
  return (data[pascal] ?? data[camel]) as T;
}

type ConnectedMTPClient = Awaited<ReturnType<typeof MTPClient.create>> & {
  request(
    type: string,
    data: Record<string, unknown>,
    options?: { responseType?: string },
  ): Promise<ParsedFrameLike>;
  sendEncrypted(
    type: string,
    data: Record<string, unknown>,
    options: {
      recipientClientId?: bigint | number | string;
      recipientPublicKey?: string | Uint8Array | number[];
      senderUserId?: string;
      recipientUserId?: string;
      recipientDeviceId?: string;
    },
  ): Promise<void>;
  subscribeEncrypted(
    type: string,
    handler: (data: unknown, meta: ParsedFrameLike) => void,
  ): () => void;
  decryptEncryptedRecord(
    frameData: Record<string, unknown>,
  ): Promise<ParsedFrameLike>;
};

class NetworkEncryptedDeviceSecretProvider implements MTPEncryptedDeviceSecretProvider {
  #client: ConnectedMTPClient | null = null;

  attach(client: ConnectedMTPClient): void {
    this.#client = client;
  }

  async setEncryptedDeviceSecret(
    record: EncryptedDeviceSecretRecord,
  ): Promise<void> {
    if (!this.#client) {
      throw new Error("encrypted device secret provider is not attached");
    }
    if (!record.encryptedSecret?.length || !record.wrappingScheme) {
      throw new Error(
        "encrypted device secret record is missing ciphertext metadata",
      );
    }

    await this.#client.request("SetEncryptedDeviceSecret", {
      UserId: record.userId,
      DeviceId: record.deviceId,
      SecretId: record.secretId,
      VersionNumber: record.version,
      EncryptedSecret: record.encryptedSecret,
      WrappingPublicKeyId: record.wrappingPublicKeyId,
      WrappingScheme: record.wrappingScheme,
      CreatedAt: record.createdAt,
    });
  }

  async getEncryptedDeviceSecret(query: {
    userId: string;
    deviceId?: string;
    secretId?: string;
  }): Promise<EncryptedDeviceSecretRecord | null> {
    if (!this.#client) {
      throw new Error("encrypted device secret provider is not attached");
    }

    try {
      const response = await this.#client.request(
        "GetEncryptedDeviceSecret",
        {
          UserId: query.userId,
          DeviceId: query.deviceId,
          SecretId: query.secretId,
        },
        { responseType: "EncryptedDeviceSecretResponse" },
      );

      if (response.type === "ErrorNotFound") return null;

      return {
        userId: frameField(response, "UserId", "userId"),
        deviceId: frameField(response, "DeviceId", "deviceId"),
        secretId: frameField(response, "SecretId", "secretId"),
        version: Number(frameField(response, "VersionNumber", "versionNumber")),
        encryptedSecret: bytesFromProtocol(
          frameField(response, "EncryptedSecret", "encryptedSecret"),
        ),
        wrappingPublicKeyId: frameField(
          response,
          "WrappingPublicKeyId",
          "wrappingPublicKeyId",
        ),
        wrappingScheme: frameField(
          response,
          "WrappingScheme",
          "wrappingScheme",
        ),
        createdAt: Number(frameField(response, "CreatedAt", "createdAt")),
        updatedAt: Number(frameField(response, "UpdatedAt", "updatedAt")),
      };
    } catch (error) {
      if (String(error).includes("ErrorNotFound")) return null;
      throw error;
    }
  }
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

export type BoundSendEncryptedFn = <T extends keyof Schemas & string>(
  type: T,
  data: z.infer<Schemas[T]["request"]>,
  options: {
    recipientClientId?: bigint | number | string;
    recipientPublicKey?: string | Uint8Array | number[];
    senderUserId?: string;
    recipientUserId?: string;
    recipientDeviceId?: string;
  },
) => Promise<void>;

export type PushHandler = (message: ProtocolMessage) => void;

type ContextType = {
  send: BoundSendFn;
  sendEncrypted: BoundSendEncryptedFn;
  subscribe: <T extends keyof Schemas & string>(
    type: T,
    handler: (message: ProtocolMessage<T>) => void,
  ) => () => void;
  subscribePush: (handler: PushHandler) => () => void;
  subscribeEncrypted: <T extends keyof Schemas & string>(
    type: T,
    handler: (
      data: z.infer<Schemas[T]["response"]>,
      meta: ProtocolMessage<T>,
    ) => void,
  ) => () => void;
  decryptEncryptedRecord: (
    frameData: Record<string, unknown>,
  ) => Promise<ParsedFrameLike>;
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
    type: message.type,
    data: parsed.data,
  } as ProtocolMessage<T>;
}

export function Provider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const { load, save } = useStorage();

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

  const clientRef = useRef<ConnectedMTPClient | null>(null);

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

  const sendEncrypted: BoundSendEncryptedFn = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;

      if (!client) {
        throw new Error("mtp is not connected");
      }

      let recipientClientId = options.recipientClientId;
      let recipientPublicKey = options.recipientPublicKey;
      if (recipientClientId == null) {
        if (!options.recipientUserId) {
          throw new Error("recipientClientId or recipientUserId is required");
        }

        const recipientUserId = Number(options.recipientUserId);
        if (!Number.isSafeInteger(recipientUserId) || recipientUserId <= 0) {
          throw new Error("recipientUserId must be a valid user id");
        }

        const response = await client.request(
          "GetUserData",
          { UserId: recipientUserId },
          { responseType: "GetUserData" },
        );
        if (response.type === "ErrorNotFound") {
          throw new Error("Recipient user data not found");
        }

        recipientPublicKey = frameField<string>(
          response,
          "PublicKey",
          "publicKey",
        );
        if (!recipientPublicKey) {
          throw new Error("Recipient has no encryption public key available");
        }
        recipientClientId = BigInt(recipientUserId);
      }

      await client.sendEncrypted(type, data as Record<string, unknown>, {
        recipientClientId,
        recipientPublicKey,
        senderUserId: options.senderUserId,
        recipientUserId: options.recipientUserId,
        recipientDeviceId: options.recipientDeviceId,
      });
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

  const subscribeEncrypted = useCallback<ContextType["subscribeEncrypted"]>(
    (type, handler) => {
      const client = clientRef.current;
      if (!client) {
        return () => {};
      }

      return client.subscribeEncrypted(type, (data, meta) => {
        handler(data as z.infer<Schemas[typeof type]["response"]>, {
          id: meta.id,
          type: meta.type,
          data: data as z.infer<Schemas[typeof type]["response"]>,
        });
      });
    },
    [],
  );

  const decryptEncryptedRecord = useCallback<
    ContextType["decryptEncryptedRecord"]
  >(async (frameData) => {
    const client = clientRef.current;
    if (!client) throw new Error("mtp is not connected");
    return client.decryptEncryptedRecord(frameData);
  }, []);

  const decryptEncryptedRecordForQueue = decryptEncryptedRecord;

  const subscribePush = useCallback((handler: PushHandler) => {
    const client = clientRef.current;
    if (!client) {
      return () => {};
    }

    const unsubscribers = [
      "MessageLive",
      "MessageState",
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

        const encryptedDeviceSecretProvider =
          new NetworkEncryptedDeviceSecretProvider();

        const createMTPClient = MTPClient.create as unknown as (
          options: Record<string, unknown>,
        ) => Promise<ConnectedMTPClient>;
        const client = await createMTPClient({
          url,
          credentials: {
            clientId: BigInt(userId),
            keyring: base64ToUint8Array(await load("mtp_keyring")),
          },
          hostPublicKey: omikronPublicKey,
          descriptor: "client",
          pings: true,
          encryptedDeviceSecretProvider,
          sessionStorage: new LocalMTPSessionStorage(
            load as never,
            save as never,
          ),
          logger: (event: {
            type: string;
            data?: unknown;
            direction?: "send" | "recv";
          }) => {
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

        encryptedDeviceSecretProvider.attach(client);

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
  }, [mtpUrl, props.blockConnection, load, save]);

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
        sendEncrypted: typeof sendEncrypted;
        subscribe: typeof subscribe;
        subscribePush: typeof subscribePush;
        subscribeEncrypted: typeof subscribeEncrypted;
        decryptEncryptedRecord: typeof decryptEncryptedRecordForQueue;
      }>(),
    [],
  );
  useEffect(() => {
    if (connected && identified && mtpUrl) {
      mtpRef.set({
        send,
        sendEncrypted,
        subscribe,
        subscribePush,
        subscribeEncrypted,
        decryptEncryptedRecord: decryptEncryptedRecordForQueue,
      });
    }
  }, [
    connected,
    identified,
    mtpUrl,
    send,
    sendEncrypted,
    subscribe,
    subscribePush,
    subscribeEncrypted,
    decryptEncryptedRecordForQueue,
    mtpRef,
  ]);

  const sendQueued: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const mtp = await mtpRef.get();
      return mtp.send(type, data, options);
    },
    [mtpRef],
  );

  const sendEncryptedQueued: BoundSendEncryptedFn = useMemo(
    () => async (type, data, options) => {
      const mtp = await mtpRef.get();
      return mtp.sendEncrypted(type, data, options);
    },
    [mtpRef],
  );

  const decryptEncryptedRecordQueued: ContextType["decryptEncryptedRecord"] =
    useMemo(
      () => async (frameData) => {
        const mtp = await mtpRef.get();
        return mtp.decryptEncryptedRecord(frameData);
      },
      [mtpRef],
    );

  return (
    <MTPContext.Provider
      value={{
        send: sendQueued,
        sendEncrypted: sendEncryptedQueued,
        subscribe,
        subscribePush,
        subscribeEncrypted,
        decryptEncryptedRecord: decryptEncryptedRecordQueued,
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
