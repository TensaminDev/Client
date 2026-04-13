import {
  useState,
  createContext,
  type ReactNode,
  useRef,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { useCrypto } from "@tensamin/crypto/context";
import { log } from "@tensamin/shared/log";
import { useStorage } from "@tensamin/storage/context";
import { createTransportClient, READY_STATE, type BoundSendFn } from "@tensamin/ttp-core";
import type { PushHandler } from "@tensamin/ttp-core";
import {
  PING_INTERVAL,
  RECONNECT_RESET,
  RECONNECT_TRIES,
  RETRY_INTERVAL,
  TRANSPORT_URL,
} from "./values";
import {
  ttp as schemas,
  ttp,
  type TTP as Schemas,
} from "@tensamin/shared/data";
import { LoadingScreen as Loading } from "@tensamin/ui";
import { ErrorScreen } from "@tensamin/ui";

import { version } from "../../../package.json";
import z from "zod";

const FATAL_IDENTIFICATION_ERROR_TYPES = new Set([
  "error",
  "error_invalid_user_id",
  "error_no_user_id",
  "error_invalid_challenge",
  "error_invalid_secret",
  "error_invalid_private_key",
  "error_invalid_public_key",
  "error_not_authenticated",
]);

/**
 * Detects whether an error chain contains a STOP_SENDING transport signal.
 * @param error Unknown error value from transport operations.
 * @returns True when the error represents a STOP_SENDING condition.
 */
function isStopSendingError(error: unknown) {
  if (typeof error === "string") {
    return error.includes("STOP_SENDING");
  }

  if (error instanceof Error) {
    if (error.message.includes("STOP_SENDING")) {
      return true;
    }

    const errorWithCause = error as Error & { cause?: unknown };
    if (errorWithCause.cause !== undefined) {
      return isStopSendingError(errorWithCause.cause);
    }

    return false;
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage.includes("STOP_SENDING");
    }
  }

  return false;
}

/**
 * Classifies identification errors that should be treated as terminal.
 * @param error Unknown error raised during identification.
 * @returns True when identification should fail without retry.
 */
function isFatalIdentificationError(error: unknown) {
  if (typeof error === "object" && error !== null && "type" in error) {
    const type = (error as { type?: unknown }).type;
    if (
      typeof type === "string" &&
      FATAL_IDENTIFICATION_ERROR_TYPES.has(type)
    ) {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error.message.includes("Missing or invalid user id") ||
    error.message.includes("Missing private key") ||
    error.message.includes("Identification challenge was rejected") ||
    error.message.includes("timed out after") ||
    error.message.includes("Response validation failed")
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts structured protocol error details for identification logging.
 * @param error Unknown error raised during identification.
 * @returns Structured protocol error details when available.
 */
function getProtocolErrorDetails(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  if (!("type" in error)) {
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

type ContextType = {
  send: BoundSendFn<Schemas>;
  subscribePush: (handler: PushHandler) => () => void;
  readyState: number;
  ownPing: number;
  iotaPing: number;
  identified: boolean;
  contacts: z.infer<typeof ttp.challenge_response.response.shape.contacts>;
  communities: z.infer<
    typeof ttp.challenge_response.response.shape.communities
  >;
};

const TTPContext = createContext<ContextType | undefined>(undefined);

/**
 * Provides ttp transport state and authenticated send operations to children.
 * @param props Component props with children.
 * @returns Loading, error, or provider-wrapped JSX.
 */
export function Provider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const { load } = useStorage();
  const { decrypt, getSharedSecret } = useCrypto();

  const [readyState, setReadyState] = useState<number>(READY_STATE.CLOSED);
  const [connected, setConnected] = useState<boolean>(false);
  const [identified, setIdentified] = useState<boolean>(false);
  const [identifying, setIdentifying] = useState<boolean>(false);

  const [ownPing, setOwnPing] = useState<number>(0);
  const [iotaPing, setIotaPing] = useState<number>(0);

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [communities, setCommunities] = useState<
    z.infer<typeof ttp.challenge_response.response.shape.communities>
  >([]);
  const [contacts, setContacts] = useState<
    z.infer<typeof ttp.challenge_response.response.shape.contacts>
  >([]);

  const clientRef = useRef<ReturnType<
    typeof createTransportClient<Schemas>
  > | null>(null);
  const identificationStartedRef = useRef(false);

  /**
   * Sends typed protocol messages through the active transport client.
   * @param type Protocol message type.
   * @param data Optional request payload.
   * @param options Optional request id.
   * @returns A promise for the typed message payload.
   */
  const send = useCallback<BoundSendFn<Schemas>>(
    ((
      type: string,
      data?: Record<string, unknown>,
      options?: { id?: number },
    ) => {
      const client = clientRef.current;

      if (!client) {
        return Promise.reject(new Error("ttp is not connected"));
      }

      return client.send(type as keyof Schemas & string, data as never, {
        ...options,
      });
    }) as BoundSendFn<Schemas>,
    [],
  );

  /**
   * Subscribes to unsolicited push events from the active transport client.
   * @param handler Callback invoked for each push message.
   * @returns Unsubscribe function.
   */
  const subscribePush = useCallback((handler: PushHandler) => {
    const client = clientRef.current;

    if (!client) {
      return () => {};
    }

    return client.subscribePush(handler);
  }, []);

  useEffect(() => {
    if (!connected || !identified) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const originalNow = Date.now();

        const data = await send("ping", {
          last_ping: originalNow,
        });

        const travelTime = Date.now() - originalNow;
        setOwnPing(travelTime);

        const remotePing = data.data.ping_iota;
        if (typeof remotePing === "number") {
          setIotaPing(remotePing);
        }
      } catch (intervalError) {
        log(1, "ttp", "yellow", "Ping failed", intervalError);
      }
    }, PING_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [connected, identified, send]);

  useEffect(() => {
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectResetTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectScheduled = false;
    let disposed = false;

    /**
     * Clears any scheduled reconnect timeout and resets scheduling flags.
     * @returns Void.
     */
    const clearReconnectTimer = () => {
      if (!reconnectTimer) {
        return;
      }

      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectScheduled = false;
    };

    /**
     * Clears the stability timer that resets reconnect attempt counters.
     * @returns Void.
     */
    const clearReconnectResetTimer = () => {
      if (!reconnectResetTimer) {
        return;
      }

      clearTimeout(reconnectResetTimer);
      reconnectResetTimer = null;
    };

    /**
     * Starts the stability timer that resets reconnect attempts after uptime.
     * @returns Void.
     */
    const scheduleReconnectReset = () => {
      clearReconnectResetTimer();
      reconnectResetTimer = setTimeout(() => {
        attempts = 0;
        reconnectResetTimer = null;
      }, RECONNECT_RESET * 1_000);
    };

    /**
     * Schedules a delayed reconnect attempt unless retries are exhausted.
     * @param reason Optional reason for reconnect scheduling.
     * @returns Void.
     */
    const scheduleReconnect = (reason?: unknown) => {
      if (disposed || reconnectScheduled) {
        return;
      }

      if (attempts >= RECONNECT_TRIES) {
        setError("Connection Failed");
        setErrorDescription(
          "Unable to connect to the server after multiple attempts. Please check your internet connection or try again later.",
        );
        log(0, "ttp", "red", "Reconnection attempts exhausted", reason);
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

    const transportClient = !props.blockConnection
      ? createTransportClient(schemas, {
          url: TRANSPORT_URL,
          onReadyStateChange: (state) => {
            setReadyState(state);

            if (state === READY_STATE.OPEN) {
              clearReconnectTimer();
              scheduleReconnectReset();
              identificationStartedRef.current = false;
              setConnected(true);
              setIdentified(false);
              setError("");
              setErrorDescription("");
              return;
            }

            clearReconnectResetTimer();
            identificationStartedRef.current = false;
            setConnected(false);
            setIdentified(false);
          },
          onClose: ({ error: closeError, intentional }) => {
            clearReconnectResetTimer();
            setConnected(false);
            setIdentified(false);
            setIdentifying(false);

            if (disposed || intentional) {
              return;
            }

            log(0, "ttp", "red", "Disconnected", closeError);
            scheduleReconnect(closeError);
          },
        })
      : null;

    clientRef.current = transportClient;

    /**
     * Establishes the transport connection and schedules reconnect on failures.
     * @returns Promise that resolves after one connection attempt.
     */
    async function connect() {
      if (disposed) {
        return;
      }

      try {
        await transportClient?.connect(TRANSPORT_URL);
      } catch (connectError) {
        if (disposed) {
          return;
        }

        log(0, "ttp", "red", "Connection attempt failed", connectError);
        scheduleReconnect(connectError);
      }
    }

    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearReconnectResetTimer();

      if (clientRef.current === transportClient) {
        clientRef.current = null;
      }

      void transportClient?.close("context-dispose");
      setReadyState(READY_STATE.CLOSED);
      setConnected(false);
      setIdentified(false);
      setIdentifying(false);
      identificationStartedRef.current = false;
    };
  }, [props.blockConnection]);

  useEffect(() => {
    if (!connected) {
      setIdentifying(false);
      setIdentified(false);
      identificationStartedRef.current = false;
      return;
    }

    if (identificationStartedRef.current) {
      return;
    }

    identificationStartedRef.current = true;
    let cancelled = false;
    setIdentifying(true);
    setIdentified(false);

    /**
     * Executes the challenge-response identification handshake.
     * @returns Promise that resolves when identification flow completes.
     */
    const identify = async () => {
      try {
        const sessionId = await load("session_id");
        const userId = await load("user_id");
        const privateKey = await load("private_key");

        if (
          !Number.isSafeInteger(userId) ||
          userId <= 0 ||
          privateKey.trim() === "" ||
          !Number.isSafeInteger(sessionId) ||
          sessionId <= 0
        ) {
          throw new Error("Invalid credentials");
        }

        // Challenge Request
        const challengeEnvelope = await send("identification", {
          version,
          session_id: sessionId,
          user_id: userId,
        }).catch((challengeError) => {
          throw new Error(
            "Failed to obtain identification challenge from server",
            challengeError,
          );
        });

        // Shared Secret
        const sharedSecret = await getSharedSecret(
          privateKey,
          "",
          challengeEnvelope.data.public_key,
        ).catch((secretError) => {
          throw new Error(
            "Failed to derive shared secret for identification",
            secretError,
          );
        });

        // Challenge Decryption
        const decryptedChallenge = await decrypt(
          sharedSecret,
          challengeEnvelope.data.challenge,
        ).catch((decryptionError) => {
          throw new Error(
            "Failed to decrypt identification challenge",
            decryptionError,
          );
        });

        // Challenge Response
        const finalResponse = await send("challenge_response", {
          challenge: decryptedChallenge,
        }).catch((error) => {
          setError("Identification Failed");
          setErrorDescription(
            "Unable to complete secure identification. Please verify your credentials and try again.",
          );
          throw error;
        });

        // Data handling
        setContacts(finalResponse.data.contacts);
        setCommunities(finalResponse.data.communities);
        if (cancelled) {
          return;
        }

        setError("");
        setErrorDescription("");
        setIdentified(true);
      } catch (identificationError) {
        if (cancelled) {
          return;
        }

        if (isStopSendingError(identificationError)) {
          setError("Connection closed");
          setErrorDescription(
            "The connection was forcefully closed by the Omikron.",
          );
          setIdentified(false);
          return;
        }

        const isFatal = isFatalIdentificationError(identificationError);
        const protocolErrorDetails =
          getProtocolErrorDetails(identificationError);

        log(
          isFatal ? 0 : 1,
          "ttp",
          isFatal ? "red" : "yellow",
          "Identification handshake failed",
          protocolErrorDetails ?? identificationError,
        );

        setIdentified(false);

        setError("Identification Failed");
        setErrorDescription(
          isFatal
            ? "Unable to complete secure identification. Please verify your credentials and try again."
            : "Unable to complete secure identification because the transport request failed.",
        );
      } finally {
        if (!cancelled) {
          setIdentifying(false);
        }
      }
    };

    void identify();

    return () => {
      cancelled = true;
    };
  }, [connected, decrypt, getSharedSecret, load, send]);

  const progress = useMemo(() => {
    if (readyState === READY_STATE.CONNECTING) return 30;
    if (!connected) return 45;
    if (identifying) return 75;
    if (!identified) return 90;
    return 100;
  }, [connected, identified, identifying, readyState]);

  const loadingTitle = useMemo(() => {
    if (readyState === READY_STATE.CONNECTING || !connected) {
      return "Connecting to Tensamin";
    }

    if (identifying || !identified) {
      return "Identifying secure session";
    }

    return "Loading";
  }, [connected, identified, identifying, readyState]);

  const loadingDescription = useMemo(() => {
    if (readyState === READY_STATE.CONNECTING || !connected) {
      return "Establishing transport channel";
    }

    if (identifying || !identified) {
      return "Verifying challenge-response handshake";
    }

    return undefined;
  }, [connected, identified, identifying, readyState]);

  if (error !== "" && errorDescription !== "") {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (!connected || !identified) {
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
    <TTPContext.Provider
      value={{
        send,
        subscribePush,
        readyState,
        ownPing,
        iotaPing,
        identified,
        contacts,
        communities,
      }}
    >
      {props.children}
    </TTPContext.Provider>
  );
}

/**
 * Returns the active ttp context and enforces provider usage.
 * @returns ttp context API for transport operations and connection state.
 */
export function useTTP(): ContextType {
  const context = useContext(TTPContext);
  if (!context) {
    throw new Error("useTTP must be used within a TTPProvider");
  }
  return context;
}
