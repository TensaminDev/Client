import { Button } from "@nonanium/ui";
import { toggleDeaf, useCall } from "../../store";
import { HeadphoneOff, Headphones } from "lucide-react";
import {
  type CallButtonProps,
  iconScale,
  withButtonTooltip,
} from "./tooltipButton";

export default function DeafButton({
  className,
  iconSize,
  tooltip,
  portalContainer,
}: CallButtonProps) {
  const deaf = useCall((state) => state.deaf);

  const button = (
    <Button
      variant={deaf ? "destructive" : "default"}
      onClick={toggleDeaf}
      className={className}
    >
      {deaf ? (
        <HeadphoneOff style={iconScale(iconSize)} />
      ) : (
        <Headphones style={iconScale(iconSize)} />
      )}
    </Button>
  );

  return withButtonTooltip(button, tooltip, portalContainer);
}
