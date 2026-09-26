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
    </SidebarRoot>
  );
}
