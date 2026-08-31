import { useCall } from "@tensamin/call/state";
import SidebarBox from "@tensamin/call/sidebarBox";

export default function CallSidebarBox() {
  const active = useCall((state) => state.state !== "closed");

  return active ? <SidebarBox /> : null;
}
