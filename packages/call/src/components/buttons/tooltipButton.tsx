export type CallButtonProps = {
  className?: string;
  iconSize?: number;
  tooltip?: string;
  portalContainer?: HTMLElement;
};

export function iconScale(iconSize?: number) {
  return { scale: (iconSize ? iconSize + 100 : 100) + "%" };
}
