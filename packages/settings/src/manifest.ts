import { settingsNavigation } from "./navigation";

import SettingsIndex from "./pages/index";
import Profile from "./pages/profile";
import Security from "./pages/security";
import Chat from "./pages/chat";
import Call from "./pages/call";
import Cache from "./pages/cache";
import Theme from "./pages/theme";
import Accessibility from "./pages/accessibility";
import Hotkeys from "./pages/hotkeys";
import Legal from "./pages/legal";

const pageComponents = {
  profile: Profile,
  security: Security,
  chat: Chat,
  call: Call,
  cache: Cache,
  theme: Theme,
  accessibility: Accessibility,
  hotkeys: Hotkeys,
  legal: Legal,
} as const;

export const settingsPages = [
  { path: "/", component: SettingsIndex },
  ...settingsNavigation.map((page) => ({
    ...page,
    component: pageComponents[page.path],
  })),
] as const;
