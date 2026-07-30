import { LeaveIcon } from "@livekit/components-react";
import { Button } from "@methanium/ui";
import { disconnect, useCall } from "../../store";
import {
  type CallButtonProps,
  iconScale,
  withButtonTooltip,
} from "./tooltipButton";

export default function LeaveButton({
  className,
  iconSize,
  tooltip,
  portalContainer,
}: CallButtonProps) {
  const state = useCall((store) => store.state);

  const button = (
    <Button
      className={className}
      onClick={() => disconnect()}
      disabled={state === "closing" || state === "closed"}
      variant="destructive"
    >
      <LeaveIcon style={iconScale(iconSize)} />
    </Button>
  );

  return withButtonTooltip(button, tooltip, portalContainer);
}
