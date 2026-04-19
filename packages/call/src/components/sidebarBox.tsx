import { useCall } from "../context";

export default function SidebarBox() {
  const { state } = useCall();

  return state === "closed" ? null : <div>Sidebar {state}</div>;
}
