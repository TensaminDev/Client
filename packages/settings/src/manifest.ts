import { lazy } from "react";
import { settingsNavigation } from "./navigation";

const pageComponents = {
  profile: lazy(() => import("./pages/profile")),
  security: lazy(() => import("./pages/security")),
  chat: lazy(() => import("./pages/chat")),
  call: lazy(() => import("./pages/call")),
  cache: lazy(() => import("./pages/cache")),
  theme: lazy(() => import("./pages/theme")),
  accessibility: lazy(() => import("./pages/accessibility")),
  hotkeys: lazy(() => import("./pages/hotkeys")),
  licenses: lazy(() => import("./pages/licenses")),
} as const;

export const settingsPages = [
  { path: "/", component: lazy(() => import("./pages/index")) },
  ...settingsNavigation.map((page) => ({
    ...page,
    component: pageComponents[page.path],
  })),
] as const;
