import { lazy, Suspense } from "react";

import { useCall } from "@tensamin/call/state";

const SidebarBox = lazy(() => import("@tensamin/call/sidebarBox"));

export default function CallSidebarBox() {
  const active = useCall((state) => state.state !== "closed");

  return active ? (
    <Suspense fallback={null}>
      <SidebarBox />
    </Suspense>
  ) : null;
}
