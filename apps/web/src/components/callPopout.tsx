import { lazy, Suspense } from "react";

import { useCall } from "@tensamin/call/state";

const Popout = lazy(() => import("@tensamin/call/popout"));

export default function CallPopout() {
  const active = useCall((state) => state.state !== "closed");

  return active ? (
    <Suspense fallback={null}>
      <Popout />
    </Suspense>
  ) : null;
}
