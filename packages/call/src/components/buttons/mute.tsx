import { Button } from "@tensamin/ui";
import { toggleMute, useCall } from "../../store";
import { Mic, MicOff } from "lucide-react";

export default function MuteButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const micEnabled = useCall((state) => state.micEnabled);

  return (
    <Button
      variant={micEnabled ? "default" : "destructive"}
      className={className}
      onClick={() => void toggleMute()}
    >
      {micEnabled ? (
        <Mic style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
      ) : (
        <MicOff style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
      )}
    </Button>
  );
}
