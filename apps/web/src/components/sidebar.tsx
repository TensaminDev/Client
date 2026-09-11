import { Sidebar as SidebarRoot, SidebarFooter } from "@methanium/ui";

import CallSidebarBox from "./callSidebarBox";
import Communications from "./communications";

export default function Sidebar() {
  return (
    <SidebarRoot className="border-0!">
      <Communications />
      <SidebarFooter>
        <CallSidebarBox />
      </SidebarFooter>
    </SidebarRoot>
  );
}
