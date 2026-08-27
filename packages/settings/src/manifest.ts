import Accessibility from "./pages/accessibility";
import Cache from "./pages/cache";
import Call from "./pages/call";
import Chat from "./pages/chat";
import Index from "./pages/index";
import Licenses from "./pages/licenses";
import Profile from "./pages/profile";
import Security from "./pages/security";
import Theme from "./pages/theme";
import Hotkeys from "./pages/hotkeys";
import { settingsNavigation } from "./navigation";

const pageComponents = {
  profile: Profile,
  security: Security,
  chat: Chat,
  call: Call,
  cache: Cache,
  theme: Theme,
  accessibility: Accessibility,
  hotkeys: Hotkeys,
  licenses: Licenses,
} as const;

export const settingsPages = [
  { path: "/", component: Index },
  ...settingsNavigation.map((page) => ({
    ...page,
    component: pageComponents[page.path],
  })),
] as const;
