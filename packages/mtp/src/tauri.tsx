import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ConnectionState,
  MTPProxyConnection,
  type MTPFrame,
  type MTPProxyAdapter,
} from "mtp";
import {
  mtp as mtpSchemas,
  type Calls,
  type Communities,
  type Contacts,
} from "@tensamin/shared/data";
import { log } from "@tensamin/shared/log";
import { getAppFocused, subscribeAppFocus } from "@tensamin/shared/focus";

import {
  type BoundSendFn,
  MTPContext,
  type ProtocolMessage,
  removeMissingContacts,
  updateContactNotifications,
  type SealedRelayResult,
  type SealedRelaySend,
  useMessageHandlers,
} from "./mtpContext";
import { useSessionActivity } from "./sessionActivity";

type NativeSnapshot = {
  generation: number;
  readyState: number;
  identified: boolean;
  state?: unknown;
  error?: string;
};

function createTauriAdapter() {
  const subscriptions = new Map<string, Set<(message: MTPFrame) => void>>();
  const adapter: MTPProxyAdapter = {
    request: (type, data) =>
      invoke<MTPFrame>("mtp_request", { typeName: type, data }),
    subscribe(type, handler) {
      const handlers = subscriptions.get(type) ?? new Set();
      handlers.add(handler);
      subscriptions.set(type, handlers);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) subscriptions.delete(type);
      };
    },
  };
  return {
    adapter,
    dispatch(message: MTPFrame) {
      for (const handler of subscriptions.get(message.type) ?? [])
        handler(message);
    },
  };
}

export function TauriProvider(props: {
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
  const [clientState, setClientState] = useState<
    ProtocolMessage<"AccountStateSnapshot">["data"] | null
  >(null);
  const generationRef = useRef(0);
  const { addInterceptor, attachSubscriptions, interceptorsRef, subscribe } =
    useMessageHandlers();
  const [{ bridge, connection }] = useState(() => {
    const bridge = createTauriAdapter();
    return {
      bridge,
      connection: new MTPProxyConnection(bridge.adapter, {
        schemas: mtpSchemas,
        throwProtocolErrors: true,
        onValidationError: (error) => {
          log(1, "mtp", "red", "Failed to validate native MTP message", error);
        },
      }),
    };
  });

  // The native backend loads an AccountStateSnapshot after every login.
  const applySnapshot = useCallback(async (next: NativeSnapshot) => {
    if (next.generation < generationRef.current) return;
    generationRef.current = next.generation;
    if (next.error)
      log(0, "android", "orange", "MTP connection failed", next.error);
    if (!next.identified) {
      setClientState(null);
      setSnapshot(next);
      return;
    }
    if (next.state === undefined) {
      setSnapshot({
        ...next,
        identified: false,
        error: "Native MTP connection omitted initial state",
      });
      return;
    }
    try {
      const state = await mtpSchemas.AccountStateSnapshot.response.parseAsync(
        next.state,
      );
      setFreshContacts(state.Contacts);
      setFreshCommunities(state.Communities);
      setFreshCalls(state.Calls);
      setClientState(state);
      setSnapshot(next);
    } catch (error) {
      log(0, "mtp", "red", "Invalid native MTP state", error);
      setSnapshot({
        ...next,
        identified: false,
        error: "Invalid AccountStateSnapshot payload",
      });
    }
  }, []);

  const dispatchMessage = useCallback(
    (message: MTPFrame) => {
      bridge.dispatch(message);
    },
    [bridge],
  );

  useEffect(() => {
    return attachSubscriptions(connection);
  }, [attachSubscriptions, connection]);

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
    if (clientState?.PresenceSnapshotComplete) {
      setFreshContacts((contacts) =>
        removeMissingContacts(contacts, clientState.MissingUserIds),
      );
    }
  }, [clientState]);

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

  useEffect(() => {
    if (props.blockConnection) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      try {
        const nextUnlisten = await listen<
          | { kind: "state"; snapshot: NativeSnapshot }
          | { kind: "message"; generation: number; message: MTPFrame }
          | { kind: "log"; level: number; message: string; details?: unknown }
        >("mtp://event", ({ payload }) => {
          if (disposed) return;
          if (payload.kind === "state") {
            void applySnapshot(payload.snapshot);
          } else if (payload.kind === "message") {
            if (payload.generation === generationRef.current) {
              dispatchMessage(payload.message);
            }
          } else {
            log(
              payload.level,
              "android",
              "orange",
              payload.message,
              payload.details,
            );
          }
        });
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      } catch (error) {
        log(0, "mtp", "red", "Failed to subscribe to native MTP events", error);
      }
      try {
        const current = await invoke<NativeSnapshot>("mtp_status");
        if (!disposed) await applySnapshot(current);
      } catch (error) {
        log(0, "mtp", "red", "Failed to load native MTP status", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applySnapshot, dispatchMessage, props.blockConnection]);

  useEffect(() => {
    if (props.blockConnection) return;
    const updateVisibility = () => {
      void invoke("mtp_set_ui_visible", {
        visible: getAppFocused(),
      });
    };
    updateVisibility();
    const unsubscribe = subscribeAppFocus(updateVisibility);
    return () => {
      unsubscribe();
      void invoke("mtp_set_ui_visible", { visible: false });
    };
  }, [props.blockConnection]);

  const send = useCallback<BoundSendFn>(
    async (type, data, options) => {
      const response = await connection.request(type, data, options);
      if (response.type === "GetStates") {
        setFreshContacts((contacts) =>
          removeMissingContacts(
            contacts,
            (response as ProtocolMessage<"GetStates">).data.MissingUserIds ??
              [],
          ),
        );
      }
      for (const interceptor of interceptorsRef.current) {
        void Promise.resolve(interceptor({ type, data, response })).catch(
          (error) => {
            log(1, "mtp", "yellow", "MTP interceptor failed", error, { type });
          },
        );
      }
      return response;
    },
    [connection, interceptorsRef],
  );
  const sendSealedRelay = useCallback<SealedRelaySend>(
    async (type, data, options) => {
      return invoke<SealedRelayResult>("mtp_send_sealed_relay", {
        request: {
          typeName: type,
          data,
          nextHop: options.nextHop,
          finalRecipientId: options.finalRecipientId,
          metadataRecipients: options.metadataRecipients,
          contentRecipients: options.contentRecipients,
        },
      });
    },
    [],
  );
  const connected = snapshot.readyState === ConnectionState.Connected;
  useSessionActivity({
    connected: connected && snapshot.identified,
    send,
  });

  return (
    <MTPContext.Provider
      value={{
        send,
        sendCallControl: (_ownerOmikronId, ...args) => send(...args),
        sendSealedRelay,
        subscribe,
        addInterceptor,
        readyState: snapshot.readyState,
        identified: snapshot.identified,
        freshContacts,
        freshCommunities,
        freshCalls,
        clientState,
        contextReady: connected && snapshot.identified,
        sessionEstablished: connected && snapshot.identified,
        connectionStatus: null,
        retryConnection: () => location.reload(),
        loadingDescription: connected
          ? "Waiting for authenticated session"
          : "Establishing native transport channel",
      }}
    >
      {props.children}
    </MTPContext.Provider>
  );
}
