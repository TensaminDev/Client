import { createContext, useContext, useEffect, useState } from "react";
import { log, toast } from "@tensamin/shared/log";
import { useNavigate } from "@tanstack/react-router";
import { useTTP } from "@tensamin/ttp/context";
import z from "zod";
import { ttp } from "@tensamin/shared/data";

import { LiveKitRoom } from "@livekit/components-react";

export const context = createContext<contextType | undefined>(undefined);

export default function Provider(props: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { send } = useTTP();

  const [state, setState] = useState<
    "closed" | "closing" | "connecting" | "open"
  >("closed");

  const [callId, setCallId] = useState<string | null>(null);
  const [callSecret, setCallSecret] = useState<string | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);

  function connect(callId: string, callSecret: string) {
    setState("connecting");
    setCallId(callId);
    setCallSecret(callSecret);
    log(2, "Call", "purple", "Connecting to call", { callId, callSecret });
  }

  // Master reset function
  function disconnect() {
    setState("closing");
    setCallId(null);
    setCallSecret(null);
    setLivekitToken(null);
  }

  // Utils
  function joinCall(userId: number, callId?: string) {
    // get/generate e2ee secret
    /// go into convs and find call id
    /// generate shared secret and decrypt enc call secret

    // check if user is already in call

    // connect to call
    connect("", "");
    setView("grid");

    // navigate to call page
    navigate({ to: "/call", search: { userId: userId, callId: callId } });
  }

  // Event listener for incoming calls
  useEffect(() => {}, []);

  /**
   * All of UI
   */
  const [view, setView] = useState<"preview" | "focused" | "grid">("preview");
  const [currentCallData, setCurrentCallData] = useState<z.infer<
    typeof ttp.get_call_data.response
  > | null>(null);

  // Get current call information for preview view
  useEffect(() => {
    if (view !== "preview" || !callId) return;

    send("get_call_data", { call_id: callId })
      .then((data) => {
        setCurrentCallData(data.data);
      })
      .catch((err) => {
        log(1, "Call", "red", "Failed to get call data", {
          callId,
          error: err,
        });
        setCurrentCallData({
          someInfo: "Failed",
        });
      });
  }, [callId, send, view]);

  return (
    <context.Provider
      value={{
        state,
        view,
        setView,

        connect,
        disconnect,
        joinCall,
        currentCallData,
      }}
    >
      <LiveKitRoom
        serverUrl="wss://call.tensamin.net"
        token={livekitToken || ""}
        connect={state !== "closed"}
        options={{
          encryption: {
            e2eeManager: {
              on(event, callback) {
                void event;
                void callback;
                return this;
              },
              isEnabled: callSecret !== null,
              isDataChannelEncryptionEnabled: true,
              setup: async (room) => {
                void room;
              },
              setupEngine: async (engine) => {
                void engine;
              },
              setParticipantCryptorEnabled: async (
                enabled: boolean,
                participantIdentity: string,
              ) => {
                console.log(
                  `Set participant ${participantIdentity} cryptor enabled: ${enabled}`,
                );
              },
              setSifTrailer: async (trailer: Uint8Array) => {
                void trailer;
              },

              // Encryption
              encryptData: async (data: Uint8Array) => {
                console.log(callSecret);
                return {
                  uuid: "",
                  payload: data,
                  iv: new Uint8Array(),
                  keyIndex: 0,
                };
              },
              handleEncryptedData: async (
                payload: Uint8Array,
                iv: Uint8Array,
                participantIdentity: string,
                keyIndex: number,
              ) => {
                void iv;
                void participantIdentity;
                void keyIndex;
                console.log(callSecret);
                return {
                  uuid: crypto.randomUUID(),
                  payload,
                };
              },
            },
          },
        }}
        onConnected={() => setState("open")}
        onDisconnected={() => setState("closed")}
        onError={(error) => log(1, "Call", "red", error.message)}
        onMediaDeviceFailure={(failure, kind) => {
          log(1, "call", "red", "Media device failure", { failure, kind });
          toast("error", "Media device failure. See console for details.");
        }}
        onEncryptionError={(error) => {
          log(1, "call", "red", "Encryption error", { error });
          toast(
            "error",
            "Error during call encryption. See console for details.",
          );
        }}
      >
        {props.children}
      </LiveKitRoom>
    </context.Provider>
  );
}

type contextType = {
  state: "closed" | "closing" | "connecting" | "open";
  view: "preview" | "focused" | "grid";
  setView: (view: "preview" | "focused" | "grid") => void;
  connect: (callId: string, callSecret: string) => void;
  disconnect: () => void;
  joinCall: (userId: number, callId?: string) => void;
  currentCallData: z.infer<typeof ttp.get_call_data.response> | null;
};

export function useCall(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
