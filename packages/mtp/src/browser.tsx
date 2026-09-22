import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast as sonnerToast } from "@methanium/ui";
import { base64ToBytes, ConnectionState, MTPClient } from "mtp";
import createAsyncQueue from "@tensamin/shared/asyncQueue";
import {
  mtp as mtpSchemas,
  type Calls,
  type Communities,
  type Contacts,
} from "@tensamin/shared/data";
import { log } from "@tensamin/shared/log";
import { useStorage } from "@tensamin/storage/context";

import {
  type BoundSendFn,
  MTPContext,
  type ProtocolMessage,
  removeMissingContacts,
  updateContactNotifications,
  type SealedRelaySend,
  useMessageHandlers,
} from "./mtpContext";
import {
  DISCOVERY_TIMEOUT,
  INITIAL_SYNC_TIMEOUT,
  RECONNECT_JITTER,
  RECONNECT_TRIES,
  RETRY_INTERVAL,
  STATE_ACK_TIMEOUT,
} from "./values";
import { useSessionActivity } from "./sessionActivity";

type BrowserMtpClient = Awaited<ReturnType<typeof createBrowserClient>>;

const CONNECTION_TOAST_ID = "mtp-connection-toast";

function createBrowserClient(
  options: Omit<Parameters<typeof MTPClient.create>[0], "schemas">,
) {
  return MTPClient.create({
    ...options,
    schemas: mtpSchemas,
    throwProtocolErrors: true,
    onValidationError: (error) => {
      log(1, "mtp", "red", "Failed to validate push message", error);
    },
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Initial state synchronization was cancelled");
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const timeout = setTimeout(
      () => finish(() => reject(new Error(timeoutMessage))),
      timeoutMs,
    );
    const onAbort = () => finish(() => reject(abortError(signal)));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function initializeAccountState(
  client: BrowserMtpClient,
  signal: AbortSignal,
  syncTimeoutMs = INITIAL_SYNC_TIMEOUT,
): Promise<ProtocolMessage<"AccountStateSnapshot">> {
  await withDeadline(
    client.auth(),
    syncTimeoutMs,
    "MTP authentication timed out",
    signal,
  );
  const state = (await withDeadline(
    client.request("AccountStateRequest", {}),
    syncTimeoutMs,
    "Initial state synchronization timed out",
    signal,
  )) as ProtocolMessage<"AccountStateSnapshot">;
  if (signal.aborted) throw abortError(signal);
  return state;
}

function protocolErrorDetails(error: unknown) {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return null;
  }
  const protocolError = error as {
    id?: unknown;
    type?: unknown;
    frame?: unknown;
  };
  return {
    id: protocolError.id,
    type: protocolError.type,
    frame: protocolError.frame,
  };
}

function protocolEventForLog(event: {
  type?: unknown;
  data?: unknown;
}): unknown {
  if (
    (event.type === "UserBlobChanged" ||
      event.type === "UserBlobGet" ||
      event.type === "UserBlobPut") &&
    event.data &&
    typeof event.data === "object" &&
    "Blob" in event.data
  ) {
    const data = event.data as { Blob?: unknown };
    const { Blob: blob, ...metadata } = data;
    return {
      ...event,
      data: {
        ...metadata,
        BlobBytes: blob instanceof Uint8Array ? blob.byteLength : undefined,
      },
    };
  }
  return event;
}

export function BrowserProvider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const { load } = useStorage();
  const [readyState, setReadyState] = useState<number>(
    ConnectionState.Disconnected,
  );
  const [identified, setIdentified] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [connectionToast, setConnectionToast] = useState<
    | { kind: "reconnecting"; attempt: number }
    | { kind: "failed"; description: string }
    | null
  >(null);
  const [freshCommunities, setFreshCommunities] = useState<Communities>([]);
  const [freshContacts, setFreshContacts] = useState<Contacts>([]);
  const [freshCalls, setFreshCalls] = useState<Calls>([]);
  const [clientState, setClientState] = useState<
    ProtocolMessage<"AccountStateSnapshot">["data"] | null
  >(null);
  const clientRef = useRef<BrowserMtpClient | null>(null);
  const callControlRequestRef = useRef<
    | ((
        ownerOmikronId: number | undefined,
        ...args: Parameters<BoundSendFn>
      ) => ReturnType<BoundSendFn>)
    | null
  >(null);
  const { addInterceptor, attachSubscriptions, interceptorsRef, subscribe } =
    useMessageHandlers();
  const connected = readyState === ConnectionState.Connected;
  const retryConnectionRef = useRef(() => {});

  useEffect(() => {
    if (!connectionToast) {
      sonnerToast.dismiss(CONNECTION_TOAST_ID);
      return;
    }
    if (connectionToast.kind === "reconnecting") {
      sonnerToast.loading(
        `Reconnecting to server... (attempt ${connectionToast.attempt} of ${RECONNECT_TRIES})`,
        { id: CONNECTION_TOAST_ID, duration: Infinity },
      );
      return;
    }
    sonnerToast.error("Connection failed", {
      id: CONNECTION_TOAST_ID,
      description: connectionToast.description,
      icon: null,
      duration: Infinity,
      closeButton: true,
      action: {
        label: "Retry",
        onClick: () => retryConnectionRef.current(),
      },
    });
  }, [connectionToast]);

  const [mtpUrl, setMtpUrl] = useState<string | null>(null);
  useEffect(() => {
    load("omega_url").then(setMtpUrl);
  }, [load]);

  const send: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;
      if (!client) throw new Error("mtp is not connected");
      try {
        const response = await client.request(type, data, options);
        log(2, "mtp", "cyan", `< ${response.type}`, {
          hint: "info",
          type: response.type,
          data: response.data,
          direction: "recv",
        });
        if (response.type === "GetStates") {
          setFreshContacts((contacts) =>
            removeMissingContacts(
              contacts,
              (response as ProtocolMessage<"GetStates">).data.MissingUserIds ??
                [],
            ),
          );
        }
        return response;
      } catch (error) {
        const details = protocolErrorDetails(error);
        log(
          1,
          "mtp",
          "red",
          `< ${typeof details?.type === "string" ? details.type : `${type} failed`}`,
          error,
        );
        throw error;
      }
    },
    [],
  );
  const sendToCallOwner = useMemo(
    () =>
      async (
        ownerOmikronId: number | undefined,
        ...args: Parameters<BoundSendFn>
      ) => {
        const request = callControlRequestRef.current;
        if (!request) throw new Error("mtp call control is not connected");
        return request(ownerOmikronId, ...args);
      },
    [],
  );
  const sendSealedRelay: SealedRelaySend = useMemo(
    () => async (type, data, options) => {
      const client = clientRef.current;
      if (!client) throw new Error("mtp is not connected");
      await client.sendSealedRelay(type, data, {
        nextHop: options.nextHop,
        finalRecipientId: options.finalRecipientId,
        metadataRecipients: options.metadataRecipients,
        contentRecipients: options.contentRecipients,
      });
      return { type: "RelaySent", data: {} };
    },
    [],
  );

  const resolveConnectionRef = useRef(() => {});
  useEffect(() => {
    if (!mtpUrl) return;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectScheduled = false;
    let disposed = false;
    let connectionGeneration = 0;
    let cleanupConnection = () => {};

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectScheduled = false;
    };
    const scheduleReconnect = (error: unknown) => {
      if (disposed || reconnectScheduled) return;
      attempts += 1;
      const shortRetry = attempts <= RECONNECT_TRIES;
      if (!shortRetry) {
        log(0, "mtp", "red", "Reconnection attempts exhausted", error);
        setConnectionToast({
          kind: "failed",
          description:
            error instanceof Error
              ? `${error.message.split(":")[0]}.`
              : "Connection lost.",
        });
        return;
      }
      setConnectionToast({ kind: "reconnecting", attempt: attempts });
      const jitter = 1 + (Math.random() * 2 - 1) * RECONNECT_JITTER;
      reconnectScheduled = true;
      reconnectTimer = setTimeout(
        () => {
          reconnectScheduled = false;
          reconnectTimer = null;
          void connect();
        },
        Math.round(RETRY_INTERVAL * jitter),
      );
    };

    async function connect() {
      if (disposed || props.blockConnection) return;
      const generation = ++connectionGeneration;
      let client: BrowserMtpClient | null = null;
      let failed = false;
      let connectionReady = false;
      let detachSubscriptions = () => {};
      let unsubscribeNoIota = () => {};
      const ownerClients = new Map<number, BrowserMtpClient>();
      const attemptAbort = new AbortController();
      const cleanup = () => {
        attemptAbort.abort(
          new Error("Initial state synchronization was cancelled"),
        );
        unsubscribeNoIota();
        detachSubscriptions();
        for (const ownerClient of ownerClients.values())
          ownerClient.disconnect();
        ownerClients.clear();
        callControlRequestRef.current = null;
        client?.disconnect();
        if (clientRef.current === client) clientRef.current = null;
        if (generation === connectionGeneration) {
          setReadyState(ConnectionState.Disconnected);
          setIdentified(false);
          setIdentifying(false);
        }
      };
      cleanupConnection = cleanup;
      try {
        setIdentified(false);
        setIdentifying(false);
        setClientState(null);
        const [userId, keyring] = await Promise.all([
          load("user_id"),
          load("mtp_keyring"),
        ]);
        if (!userId || !keyring) throw new Error("Missing login credentials");
        const forcedOmikronUrl = await load("forced_omikron_url");
        const forcedOmikronPublicKey = await load("forced_omikron_public_key");
        let url = null;
        let omikronPublicKey = null;
        let primaryOmikronId: number | undefined;
        if (forcedOmikronUrl && forcedOmikronPublicKey) {
          url = forcedOmikronUrl;
          omikronPublicKey = forcedOmikronPublicKey;
        } else {
          log(2, "mtp", "purple", "Fetching Omikron data.");
          const data = await fetch(`${mtpUrl}api/get/omikron/${userId}`, {
            signal: AbortSignal.any([
              attemptAbort.signal,
              AbortSignal.timeout(DISCOVERY_TIMEOUT),
            ]),
          });
          if (data.status === 404) {
            throw new Error("No Omikron assignment is currently available");
          }
          if (!data.ok)
            throw new Error(`Omikron discovery failed: HTTP ${data.status}`);
          const omikronData = (await data.json()) as {
            id: number;
            ip_address: string;
            port: number;
            public_key: string;
          };
          if (
            !omikronData.ip_address ||
            !omikronData.port ||
            !omikronData.id ||
            !omikronData.public_key
          ) {
            throw new Error("Invalid Omikron data");
          }
          url = `https://${omikronData.ip_address}:${omikronData.port}`;
          omikronPublicKey = omikronData.public_key;
          primaryOmikronId = omikronData.id;
        }
        if (!url || !omikronPublicKey) {
          throw new Error("Missing Omikron URL or Public Key");
        }
        log(2, "mtp", "green", "Connecting to: " + url);
        client = await createBrowserClient({
          url,
          credentials: { clientId: userId, keyring: base64ToBytes(keyring) },
          hostPublicKey: { value: omikronPublicKey, encoding: "base64" },
          descriptor: "client",
          pings: true,
          securityProfile: { protectedSignatureSuite: "dual" },
          logger: (event) => {
            if (event.type === "state") {
              if (generation !== connectionGeneration) return;
              const state = client?.state ?? ConnectionState.Disconnected;
              setReadyState(state);
              if (
                (state === ConnectionState.Disconnected ||
                  state === ConnectionState.Failed) &&
                clientRef.current === client &&
                !failed
              ) {
                failed = true;
                const error = new Error("MTP connection lost");
                attemptAbort.abort(error);
                if (connectionReady) {
                  cleanup();
                  scheduleReconnect(error);
                }
              }
            }
            if (
              event.type !== "Pong" &&
              event.type !== "Ping" &&
              event.type !== "Relay"
            ) {
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
                protocolEventForLog(event),
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
        callControlRequestRef.current = async (
          ownerOmikronId,
          type,
          data,
          options,
        ) => {
          if (ownerOmikronId == null || ownerOmikronId === primaryOmikronId) {
            return activeClient.request(type, data, options);
          }

          let ownerClient = ownerClients.get(ownerOmikronId);
          if (!ownerClient) {
            const response = await fetch(
              `${mtpUrl}api/get/omikron/${ownerOmikronId}`,
              {
                signal: attemptAbort.signal,
              },
            );
            if (!response.ok) {
              throw new Error(
                `Call owner discovery failed: HTTP ${response.status}`,
              );
            }
            const owner = (await response.json()) as {
              id: number;
              ip_address: string;
              port: number;
              public_key: string;
            };
            if (
              owner.id !== ownerOmikronId ||
              !owner.ip_address ||
              !owner.port ||
              !owner.public_key
            ) {
              throw new Error(
                "Call owner discovery returned an invalid Omikron",
              );
            }
            ownerClient = await createBrowserClient({
              url: `https://${owner.ip_address}:${owner.port}`,
              credentials: {
                clientId: userId,
                keyring: base64ToBytes(keyring),
              },
              hostPublicKey: { value: owner.public_key, encoding: "base64" },
              descriptor: "client-call-control",
              pings: true,
              securityProfile: { protectedSignatureSuite: "dual" },
              logger: (event) => {
                if (event.type !== "Ping" && event.type !== "Pong") {
                  log(
                    2,
                    "mtp",
                    "purple",
                    `call owner ${ownerOmikronId}: ${event.type}`,
                  );
                }
              },
            });
            try {
              await ownerClient.auth();
            } catch (error) {
              ownerClient.disconnect();
              throw error;
            }
            ownerClients.set(ownerOmikronId, ownerClient);
          }
          return ownerClient.request(type, data, options);
        };
        detachSubscriptions = attachSubscriptions(activeClient);
        unsubscribeNoIota = subscribe("ErrorNoIota", () => {
          if (clientRef.current !== activeClient || failed) return;
          failed = true;
          const error = new Error("No Iota is currently connected");
          attemptAbort.abort(error);
          cleanup();
          scheduleReconnect(error);
        });
        setReadyState(activeClient.state);
        setIdentifying(true);
        const finalResponse = await initializeAccountState(
          activeClient,
          attemptAbort.signal,
        );
        if (disposed || clientRef.current !== activeClient) return;
        setFreshContacts(finalResponse.data.Contacts);
        if (finalResponse.data.PresenceSnapshotComplete) {
          setFreshContacts((contacts) =>
            removeMissingContacts(contacts, finalResponse.data.MissingUserIds),
          );
        }
        setFreshCommunities(finalResponse.data.Communities);
        setFreshCalls(finalResponse.data.Calls);
        setClientState(finalResponse.data);
        await withDeadline(
          activeClient.request("AccountStateApplied", {}),
          STATE_ACK_TIMEOUT,
          "Account state acknowledgement timed out",
          attemptAbort.signal,
        );
        connectionReady = true;
        setIdentifying(false);
        setIdentified(true);
        clearReconnectTimer();
        attempts = 0;
        setConnectionToast(null);
        resolveConnectionRef.current?.();
      } catch (connectError) {
        if (disposed || generation !== connectionGeneration) {
          client?.disconnect();
          return;
        }
        failed = true;
        cleanup();
        const message =
          connectError instanceof Error
            ? connectError.message
            : String(connectError ?? "Unknown error");
        log(
          0,
          "mtp",
          "red",
          `Connection/authentication attempt failed: ${message}`,
          protocolErrorDetails(connectError) ?? connectError,
        );
        scheduleReconnect(connectError);
      }
    }

    retryConnectionRef.current = () => {
      if (disposed) return;
      clearReconnectTimer();
      attempts = 0;
      setConnectionToast(null);
      void connect();
    };
    void connect();
    return () => {
      disposed = true;
      retryConnectionRef.current = () => {};
      clearReconnectTimer();
      cleanupConnection();
      setReadyState(ConnectionState.Disconnected);
      setIdentified(false);
      setIdentifying(false);
      setConnectionToast(null);
      sonnerToast.dismiss(CONNECTION_TOAST_ID);
    };
  }, [attachSubscriptions, load, mtpUrl, props.blockConnection, subscribe]);

  useEffect(() => {
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
  }, [subscribe]);

  useEffect(
    () =>
      subscribe("GetStates", (message) => {
        setFreshContacts((contacts) =>
          removeMissingContacts(contacts, message.data.MissingUserIds ?? []),
        );
      }),
    [subscribe],
  );

  useEffect(() => {
    const messageLive = subscribe("MessageLive", ({ data }) => {
      setFreshContacts((contacts) =>
        updateContactNotifications(
          contacts,
          data.SenderId,
          data.notifications,
          data.LastMessageAt,
        ),
      );
    });
    const notificationChanged = subscribe("PushNotification", ({ data }) => {
      setFreshContacts((contacts) =>
        updateContactNotifications(
          contacts,
          data.ChatPartnerId,
          data.notifications,
          data.LastMessageAt,
        ),
      );
    });
    return () => {
      messageLive();
      notificationChanged();
    };
  }, [subscribe]);

  const loadingDescription = useMemo(() => {
    if (!mtpUrl) return "Loading connection details";
    if (readyState === ConnectionState.Connecting || !connected) {
      return "Establishing transport channel";
    }
    if (identifying || !identified) return "Waiting for authenticated session";
    return "Loading...";
  }, [connected, identified, identifying, readyState, mtpUrl]);
  const contextReady = connected && identified && mtpUrl !== null;
  const mtpRef = useMemo(() => createAsyncQueue<{ send: typeof send }>(), []);
  useEffect(() => {
    if (connected && identified && mtpUrl) {
      mtpRef.set({ send });
    }
  }, [connected, identified, mtpUrl, send, mtpRef]);

  const sendQueued: BoundSendFn = useMemo(
    () => async (type, data, options) => {
      const mtp = await mtpRef.get();
      const response = await mtp.send(type, data, options);
      for (const interceptor of interceptorsRef.current) {
        void Promise.resolve(interceptor({ type, data, response })).catch(
          (error) => {
            log(1, "mtp", "yellow", "MTP interceptor failed", error, { type });
          },
        );
      }
      return response;
    },
    [interceptorsRef, mtpRef],
  );
  useSessionActivity({ connected: contextReady, send: sendQueued });

  return (
    <MTPContext.Provider
      value={{
        send: sendQueued,
        sendCallControl: sendToCallOwner,
        sendSealedRelay,
        subscribe,
        addInterceptor,
        readyState,
        identified,
        freshContacts,
        freshCommunities,
        freshCalls,
        clientState,
        contextReady,
        loadingDescription,
      }}
    >
      {props.children}
    </MTPContext.Provider>
  );
}
