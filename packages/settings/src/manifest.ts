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

export const settingsPages = [
  { path: "/", component: Index },
  {
    category: "account",
    path: "profile",
    label: "Profile",
    component: Profile,
  },
  {
    category: "account",
    path: "security",
    label: "Security",
    component: Security,
  },
  { category: "general", path: "chat", label: "Chat", component: Chat },
  { category: "general", path: "call", label: "Call", component: Call },
  { category: "application", path: "cache", label: "Cache", component: Cache },
  { category: "application", path: "theme", label: "Theme", component: Theme },
  {
    category: "application",
    path: "accessibility",
    label: "Accessibility",
    component: Accessibility,
  },
  {
    category: "application",
    path: "hotkeys",
    label: "Hotkeys",
    component: Hotkeys,
  },
  {
    category: "application",
    path: "licenses",
    label: "Licenses",
    component: Licenses,
  },
] as const;

export const settingsNavigation = settingsPages.filter(
  (page): page is Exclude<(typeof settingsPages)[number], { path: "/" }> =>
    page.path !== "/",
);
