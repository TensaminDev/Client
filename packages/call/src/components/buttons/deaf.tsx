import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";
import { toggleDeaf, useCall } from "../../store";
import { HeadphoneOff, Headphones } from "lucide-react";

export default function DeafButton({
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
  const deaf = useCall((state) => state.deaf);

  const button = (
    <Button
      variant={deaf ? "destructive" : "default"}
      onClick={toggleDeaf}
      className={className}
    >
      {deaf ? (
        <HeadphoneOff
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
      ) : (
        <Headphones
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
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
