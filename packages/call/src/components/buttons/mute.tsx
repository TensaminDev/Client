import { Button } from "@tensamin/ui";
import { useCall } from "../../context";
import { Mic, MicOff } from "lucide-react";

export default function MuteButton({ className }: { className?: string }) {
  const { room } = useCall();
  const micEnabled = room.localParticipant.isMicrophoneEnabled;

  return (
    <Button
      variant={micEnabled ? "default" : "destructive"}
      className={className}
    >
      {micEnabled ? <Mic /> : <MicOff />}
    </Button>
  );
}
