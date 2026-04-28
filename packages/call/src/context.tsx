import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { log, toast } from "@tensamin/shared/log";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTTP } from "@tensamin/ttp";
import z from "zod";
import { ttp } from "@tensamin/shared/data";

import { LiveKitRoom, useLocalParticipant } from "@livekit/components-react";
import { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";
import { ExternalE2EEKeyProvider, LocalAudioTrack, Room } from "livekit-client";
import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";

export const context = createContext<contextType | undefined>(undefined);

export default function Provider(props: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { send } = useTTP();
  const { getSharedSecret, decryptText } = useCrypto();
  const { load } = useStorage();
  const { get } = useUser();
  const location = useLocation();
  const search = new URLSearchParams(location.searchStr);

  const [state, setState] = useState<
    "closed" | "closing" | "connecting" | "open" | "encrypting"
  >("closed");

  const [callId, setCallId] = useState<string | null>(
    location.pathname.startsWith("/call") ? search.get("id") : null,
  );
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
    setState("encrypting");
    setCallId(callId);
    setLivekitToken(await getCallToken(callId));
    log(2, "call", "purple", "Connecting to call", { callId, callSecret });
  }

  // Master reset function
  function disconnect() {
    setState("closing");
    setCallId(null);
    setCallSecret(null);
    setLivekitToken(null);
    room.disconnect();
    e2eeWorker.terminate();
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
        await keyProvider.setKey(decryptedSecret);
        await room.setE2EEEnabled(true);
        setCallSecret(decryptedSecret);
        setState("connecting");
      } catch (err) {
        log(1, "call", "red", "Failed getting call secret", err);
        disconnect();
      }
    } else {
      const random = crypto.randomUUID();
      await keyProvider.setKey(random);
      await room.setE2EEEnabled(true);
      setCallSecret(random);
      setState("connecting");
    }
    try {
      // check if user is already in call

      // connect to call
      const finalId = callId || crypto.randomUUID();
      connect(finalId);
      setView("grid");
      openCallPage(finalId);
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

  const [deaf, setDeaf] = useState(false);

  const toggleDeaf = () => {
    setDeaf((wasDeaf) => {
      room.remoteParticipants.forEach((participant) => {
        participant.setVolume(wasDeaf ? 100 : 0);
      });
      return !wasDeaf;
    });
  };

  const openCallPage = (callId: string) =>
    navigate({ to: "/call", search: { id: callId } });

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

  // Room & Encryption
  const [keyProvider] = useState(() => new ExternalE2EEKeyProvider());
  const [e2eeWorker] = useState(
    () => new Worker(new URL("livekit-client/e2ee-worker", import.meta.url)),
  );
  const [room] = useState(
    () =>
      new Room({
        dynacast: true,
        adaptiveStream: true,
        encryption: {
          keyProvider,
          worker: e2eeWorker,
        },
      }),
  );

  return (
    <context.Provider
      value={{
        state,
        view,
        setView,
        room,

        callId,
        openCallPage,

        deaf,
        toggleDeaf,

        disconnect,
        joinCall,
        currentCallData,
      }}
    >
      <LiveKitRoom
        serverUrl="wss://call.tensamin.net"
        token={livekitToken || ""}
        connect={state !== "closed" && livekitToken !== ""}
        room={room}
        onConnected={() => {
          setState("open");
          log(2, "call", "purple", "Connected to call", {
            callId,
            callSecret,
          });
        }}
        onDisconnected={() => {
          setState("closed");
          log(2, "call", "purple", "Disconnected from call", {
            callId,
            callSecret,
          });
        }}
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
        audio={true}
      >
        <NoiseFilter />
        {props.children}
      </LiveKitRoom>
    </context.Provider>
  );
}

function NoiseFilter() {
  const { microphoneTrack } = useLocalParticipant();
  const noiseFilter = useMemo(
    () =>
      new DeepFilterNoiseFilterProcessor({
        enabled: true,
        enableNoiseReduction: true,
        noiseReductionLevel: 80,
        sampleRate: 48000,
        assetConfig: {
          cdnUrl: "/assets",
        },
      }),
    [],
  );

  useEffect(() => {
    const track = microphoneTrack?.track;
    if (!(track instanceof LocalAudioTrack) || track.getProcessor()) return;

    track.setProcessor(noiseFilter).catch((err) => {
      log(1, "call", "red", "Failed to enable noise filter", err);
    });
  }, [microphoneTrack, noiseFilter]);

  return null;
}

type contextType = {
  state: "closed" | "closing" | "connecting" | "open" | "encrypting";
  view: "preview" | "focused" | "grid";
  setView: (view: "preview" | "focused" | "grid") => void;
  disconnect: () => void;
  joinCall: (userId: number, callSecret?: string, callId?: string) => void;
  currentCallData: z.infer<typeof ttp.call_data.response> | null;
  room: Room;
  openCallPage: (callId: string) => Promise<void>;
  callId: string | null;
  deaf: boolean;
  toggleDeaf: () => void;
};

export function useCall(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
