import { createContext, useContext, useEffect, useState } from "react";
import { log } from "@tensamin/shared/log";
import { useNavigate } from "@tanstack/react-router";

export const context = createContext<contextType | undefined>(undefined);

export default function Provider(props: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const [state, setState] = useState<"closed" | "connecting" | "open">(
    "closed",
  );

  const [callId, setCallId] = useState<string | null>(null);
  const [callSecret, setCallSecret] = useState<string | null>(null);

  console.log(callId, callSecret);

  function connect(callId: string, callSecret: string) {
    setState("connecting");
    setCallId(callId);
    setCallSecret(callSecret);
    log(2, "Call", "purple", "Connecting to call", { callId, callSecret });
  }

  // Master reset function
  function disconnect() {
    setState("closed");
    setCallId(null);
    setCallSecret(null);
  }

  // Utils
  function joinCall(userId: number, callId?: string) {
    // get/generate e2ee secret
    // go into convs and find call id
    // generate shared secret and decrypt enc call secret

    // check if user is already in call

    // connect to call
    connect("", "");

    // navigate to call page
    navigate({ to: "/call", search: { userId: userId, callId: callId } });
  }

  // Event listener for incoming calls
  useEffect(() => {}, []);

  return (
    <context.Provider
      value={{
        state,
        connect,
        disconnect,
        joinCall,
      }}
    >
      {props.children}
    </context.Provider>
  );
}

type contextType = {
  state: "closed" | "connecting" | "open";
  connect: (callId: string, callSecret: string) => void;
  disconnect: () => void;
  joinCall: (userId: number, callId?: string) => void;
};

export function useCall(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
