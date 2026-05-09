import { LeaveIcon } from "@livekit/components-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";
import { disconnect, useCall } from "../../store";

export default function LeaveButton({
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
  const state = useCall((store) => store.state);

  const button = (
    <Button
      className={className}
      onClick={() => disconnect()}
      disabled={state === "closing" || state === "closed"}
      variant="destructive"
    >
      <LeaveIcon style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
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
