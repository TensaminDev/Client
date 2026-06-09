import { Button } from "@tensamin/ui";
import { toggleMute, useCall } from "../../store";
import { Mic, MicOff } from "lucide-react";
import { type CallButtonProps, iconScale, withTooltip } from "./tooltipButton";

export default function MuteButton({
  className,
  iconSize,
  tooltip,
  portalContainer,
}: CallButtonProps) {
  const micEnabled = useCall((state) => state.micEnabled);

  const button = (
    <Button
      variant={micEnabled ? "default" : "destructive"}
      className={className}
      onClick={() => void toggleMute()}
    >
      {micEnabled ? (
        <Mic style={iconScale(iconSize)} />
      ) : (
        <MicOff style={iconScale(iconSize)} />
      )}
    </Button>
  );

  return withTooltip(button, tooltip, portalContainer);
}
