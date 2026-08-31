import { useCall } from "@tensamin/call/state";
import Popout from "@tensamin/call/popout";

export default function CallPopout() {
  const active = useCall((state) => state.state !== "closed");

  return active ? <Popout /> : null;
}
