import { type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";

export type CallButtonProps = {
  className?: string;
  iconSize?: number;
  tooltip?: string;
  portalContainer?: HTMLElement;
};

export function iconScale(iconSize?: number) {
  return { scale: (iconSize ? iconSize + 100 : 100) + "%" };
}

export function withTooltip(
  button: ReactElement,
  tooltip?: string,
  portalContainer?: HTMLElement,
) {
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
