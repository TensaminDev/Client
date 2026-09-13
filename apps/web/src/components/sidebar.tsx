import { Sidebar as SidebarRoot, SidebarFooter } from "@methanium/ui";

import CallSidebarBox from "./callSidebarBox";
import Communications from "./communications";

export default function Sidebar() {
  return (
    <SidebarRoot className="z-20 border-0!">
      <Communications />
      <SidebarFooter>
        <CallSidebarBox />
      </SidebarFooter>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[calc(3rem+11.5px)] right-0 bottom-0 z-20 border-r border-(--border)/40"
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute top-12 -right-[19px] z-20 h-[13px] w-[20px] -translate-y-px overflow-visible"
        viewBox="0 0 20 13"
      >
        <rect width="13" height="13" fill="var(--background)" />
        <path
          d="M0 0H13V.5H12.5C5.873.5.5 5.873.5 12.5V13H0Z"
          fill="var(--sidebar)"
        />
        <path
          d="M20 .5H12.5C5.873.5.5 5.873.5 12.5V13"
          fill="none"
          className="opacity-40"
          stroke="var(--border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </SidebarRoot>
  );
}
