import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";
import { toggleMute, useCall } from "../../store";
import { Mic, MicOff } from "lucide-react";

export default function MuteButton({
  className,
  iconSize,
  tooltip,
  portalContainer,
}: {
  className?: string;
  iconSize?: number;
  tooltip?: string;
  portalContainer?: HTMLElement;
}) {
  const micEnabled = useCall((state) => state.micEnabled);

  const button = (
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

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent portalProps={{ container: portalContainer }}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
