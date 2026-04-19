import { createContext, useContext, useEffect, useState } from "react";
import { log, toast } from "@tensamin/shared/log";
import { useNavigate } from "@tanstack/react-router";
import { useTTP } from "@tensamin/ttp";
import z from "zod";
import { ttp } from "@tensamin/shared/data";

import { LiveKitRoom } from "@livekit/components-react";
import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";

export const context = createContext<contextType | undefined>(undefined);

export default function Provider(props: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { send } = useTTP();
  const { encrypt, decrypt, getSharedSecret, decryptText } = useCrypto();
  const { load } = useStorage();
  const { get } = useUser();

  const [state, setState] = useState<
    "closed" | "closing" | "connecting" | "open"
  >("closed");

  const [callId, setCallId] = useState<string | null>(null);
  const [callSecret, setCallSecret] = useState<string | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);

  const getCallToken = async (callId: string) => {
    const response = await send("call_token", {
      call_id: callId,
    }).catch((err) => {
      log(1, "call", "red", "Failed to get call secret", err);
      throw err;
    });
    return response.data.call_token;
  };

  async function connect(callId: string) {
    setState("connecting");
    setCallId(callId);
    setCallSecret(callSecret);
    setLivekitToken(await getCallToken(callId));
    log(2, "call", "purple", "Connecting to call", { callId, callSecret });
  }

  // Master reset function
  function disconnect() {
    setState("closing");
    setCallId(null);
    setCallSecret(null);
    setLivekitToken(null);
  }

  // Utils
  async function joinCall(
    userId: number,
    callSecret?: string,
    callId?: string,
  ) {
    log(2, "call", "purple", "Call creation initialised");
    if (callSecret) {
      try {
        const sharedSecret = await getSharedSecret(
          await load("private_key"),
          await get((await load("user_id")) as number).then(
            (res) => res.public_key,
          ),
          await get(userId).then((res) => res.public_key),
        );
        const decryptedSecret = await decryptText(sharedSecret, callSecret);
        setCallSecret(decryptedSecret);
      } catch (err) {
        log(1, "call", "red", "Failed getting call secret", err);
        disconnect();
      }
    } else {
      setCallSecret(crypto.randomUUID());
    }
    try {
      // check if user is already in call

      // connect to call
      connect(callId || crypto.randomUUID());
      setView("grid");

      // navigate to call page
      navigate({ to: "/call", search: { userId: userId, callId: callId } });
    } catch (err) {
      log(1, "call", "red", "Failed to join call [navbar level]", err);
    }
  }

  // Event listener for incoming calls
  useEffect(() => {}, []);

  /**
   * All of UI
   */
  const [view, setView] = useState<"preview" | "focused" | "grid">("preview");
  const [currentCallData, setCurrentCallData] = useState<z.infer<
    typeof ttp.call_data.response
  > | null>(null);

  // Get current call information for preview view
  useEffect(() => {
    if (view !== "preview" || !callId) return;

    send("call_data", { call_id: callId })
      .then((data) => {
        setCurrentCallData(data.data);
      })
      .catch((err) => {
        log(1, "Call", "red", "Failed to get call data", {
          callId,
          error: err,
        });
        setCurrentCallData({
          users: [],
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
        connect={state !== "closed" && livekitToken !== ""}
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
              encryptData: async (data: Uint8Array<ArrayBuffer>) => {
                const encrypted = await encrypt(callSecret || "", data);
                return {
                  uuid: "",
                  payload: encrypted,
                  iv: new Uint8Array(),
                  keyIndex: 0,
                };
              },
              handleEncryptedData: async (
                payload: Uint8Array<ArrayBuffer>,
                iv: Uint8Array,
                participantIdentity: string,
                keyIndex: number,
              ) => {
                void iv;
                void participantIdentity;
                void keyIndex;

                const decrypted = await decrypt(callSecret || "", payload);

                return {
                  uuid: "",
                  payload: decrypted,
                };
              },
            },
          },
          loggerName: "call",
        }}
        onConnected={() => setState("open")}
        onDisconnected={() => setState("closed")}
        onError={(error) => {
          log(1, "call", "red", error.message);
          toast("error", error.message);
        }}
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
  joinCall: (userId: number, callSecret?: string, callId?: string) => void;
  currentCallData: z.infer<typeof ttp.call_data.response> | null;
};

export function useCall(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
