import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";

import "./index.css";
import "@tensamin/ui/index.css";

import NotFound from "@/routes/404";

import AppLayout from "@/routes/app/layout";
import SettingsLayout from "@/features/settings/layout";

import Home from "@/routes/app/home";
import ChatScreen from "@tensamin/chat/screen";
import CallScreen from "@tensamin/call/screen";
import Login from "@/routes/screens/login";

import CallPopout from "@tensamin/call/popout";
import ChatContext from "@tensamin/chat/context";
import { useInitializeCall } from "@tensamin/call/store";
import { Provider as TTPProvider } from "@tensamin/ttp";
import UserContext from "@tensamin/user/context";
import DeeplinkContext from "@tensamin/tauri/deeplinkHandler";
import NotificationsProvider from "@tensamin/notifications/context";

import TAuthWrapper from "@tensamin/tauth/context";

import { ThemeProvider, useTheme } from "@tensamin/ui";
import z from "zod";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import Session from "@tensamin/storage/session";
import Crypto from "@tensamin/crypto/context";
import DesktopMediaProvider from "@tensamin/shared/desktopMedia";

import LegalWrapper from "@/features/legal/screen";

import { useStorage } from "@tensamin/storage/context";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useIsMobile, Toaster, TooltipProvider } from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";

const wrapper = document.getElementById("root");

if (!wrapper) {
  throw new Error("Missing root element");
}

if (localStorage.getItem("log_level") === null) {
  console.log(
    "%cDo not paste anything in here, there is a 101.1% chance you're being scammed.",
    "color: red; font-size: 24px; font-weight: bold; background: #220000; padding: 8px 12px; border: 3px solid red;",
  );
}

// @ts-expect-error Declare global function
window.setLogLevelToMax = () => {
  localStorage.setItem("log_level", String(1000));
  location.reload();
};

function LoginWrapper({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const { load } = useStorage();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;

    load("user_id").then((userId) => {
      if (!active) {
        return;
      }

      if (userId !== 0) {
        setLoggedIn(true);
        return;
      }

      setLoggedIn(false);
      navigate({
        to: "/login",
      });
    });

    return () => {
      active = false;
    };
  }, [load, navigate]);

  if (loggedIn !== true && location.pathname !== "/login") {
    return null;
  }

  return children;
}

function ThemeStorageBridge() {
  const { load, save } = useStorage();
  const {
    themeColor,
    setThemeColor,
    themePalette,
    setThemePalette,
    themePrimaryColor,
    setThemePrimaryColor,
    themePolarity,
    setThemePolarity,
    themeTint,
    setThemeTint,
    themeBorderRadius,
    setThemeBorderRadius,
    themeCustomCss,
    setThemeCustomCss,
  } = useTheme();
  const loadedRef = useRef(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      load("theme_color"),
      load("theme_palette"),
      load("theme_primary_color"),
      load("theme_polarity"),
      load("theme_tint"),
      load("theme_border_radius"),
      load("theme_custom_css"),
    ]).then(
      ([
        color,
        palette,
        primaryColor,
        polarity,
        tint,
        borderRadius,
        customCss,
      ]) => {
        if (!active) {
          return;
        }

        setThemeColor(color);
        setThemePalette(palette);
        setThemePrimaryColor(primaryColor);
        setThemePolarity(polarity);
        setThemeTint(tint);
        setThemeBorderRadius(borderRadius);
        setThemeCustomCss(customCss);
        loadedRef.current = true;
      },
    );

    return () => {
      active = false;
    };
  }, [
    load,
    setThemeBorderRadius,
    setThemeColor,
    setThemeCustomCss,
    setThemePalette,
    setThemePolarity,
    setThemePrimaryColor,
    setThemeTint,
  ]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_color", themeColor);
  }, [save, themeColor]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_palette", themePalette);
  }, [save, themePalette]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_primary_color", themePrimaryColor);
  }, [save, themePrimaryColor]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_polarity", themePolarity);
  }, [save, themePolarity]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_tint", themeTint);
  }, [save, themeTint]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_border_radius", themeBorderRadius);
  }, [save, themeBorderRadius]);

  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    save("theme_custom_css", themeCustomCss);
  }, [save, themeCustomCss]);

  return null;
}

function RootShell() {
  const isMobile = useIsMobile();

  return (
    <DeeplinkContext>
      <ThemeProvider
        storageKey={null}
        colorStorageKey={null}
        paletteStorageKey={null}
        primaryColorStorageKey={null}
        tintStorageKey={null}
        borderRadiusStorageKey={null}
        customCssStorageKey={null}
      >
        <div className="w-screen h-dvh overflow-hidden">
          <Toaster
            position={isMobile ? "top-center" : "bottom-right"}
            {...(isTauri() && isMobile
              ? {
                  mobileOffset: {
                    top: "env(safe-area-inset-top)",
                  },
                }
              : {})}
          />
          <TooltipProvider>
            <Storage>
              <ThemeStorageBridge />
              <LoginWrapper>
                <LegalWrapper>
                  <Crypto>
                    <DesktopMediaProvider>
                      <Outlet />
                    </DesktopMediaProvider>
                  </Crypto>
                </LegalWrapper>
              </LoginWrapper>
            </Storage>
          </TooltipProvider>
        </div>
      </ThemeProvider>
    </DeeplinkContext>
  );
}

function AppShell() {
  return (
    <TTPProvider>
      <Session>
        <UserContext>
          <CallInit />
          <CallPopout />
          <TAuthWrapper>
            <AppLayout>
              <ChatContext>
                <NotificationsProvider>
                  <Outlet />
                </NotificationsProvider>
              </ChatContext>
            </AppLayout>
          </TAuthWrapper>
        </UserContext>
      </Session>
    </TTPProvider>
  );
}

function CallInit() {
  return useInitializeCall();
}

const rootRoute = createRootRoute({
  component: RootShell,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
  notFoundComponent: NotFound,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings",
  component: SettingsLayout,
  staticData: {
    showMobileNavbar: true,
  },
});

type SettingsRouteModule = {
  default?: () => React.JSX.Element;
  component?: () => React.JSX.Element;
};

const settingsRouteModules = import.meta.glob<SettingsRouteModule>(
  "./routes/settings/*.tsx",
  { eager: true },
);

const settingsChildren = Object.entries(settingsRouteModules).map(
  ([filePath, module]) => {
    const fileName = filePath.split("/").pop()?.replace(".tsx", "") ?? "";
    const path = fileName === "index" ? "/" : fileName;
    const component = module.component ?? module.default;

    if (!component) {
      throw new Error(
        `Settings route module "${filePath}" must export a default component`,
      );
    }

    return createRoute({
      getParentRoute: () => settingsRoute,
      path,
      component,
      staticData: {
        showMobileNavbar: true,
      },
    });
  },
);

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: Home,
  staticData: {
    showMobileNavbar: true,
  },
});

const chatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "chat",
  component: ChatScreen,
  validateSearch: z.object({
    id: z.number().optional(),
  }),
  staticData: {
    showMobileNavbar: false,
  },
});

const callRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "call",
  component: CallScreen,
  staticData: {
    showMobileNavbar: false,
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "login",
  component: Login,
  staticData: {
    showMobileNavbar: false,
  },
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    homeRoute,
    chatRoute,
    callRoute,
    settingsRoute.addChildren(settingsChildren),
  ]),
  loginRoute,
]);

const router = createRouter({
  routeTree,
  history:
    window.location.protocol === "file:" ? createHashHistory() : undefined,
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(wrapper).render(<RouterProvider router={router} />);
