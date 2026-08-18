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
import "@methanium/ui/index.css";

import NotFound from "@/routes/404";

import AppLayout from "@/routes/app/layout";
import { createSettingsRoute } from "@tensamin/settings";
import OnboardingGate from "@tensamin/onboarding";

import Home from "@/routes/app/home";
import ChatScreen from "@tensamin/chat/screen";
import CallScreen from "@tensamin/call/screen";
import Login from "@/routes/screens/login";

import ChatContext from "@tensamin/chat/context";
import { useCall, useInitializeCall } from "@tensamin/call/store";
import { useIsSpeaking } from "@tensamin/call/speakingState";
import { Provider as MTPProvider } from "@tensamin/mtp";
import UserProvider from "@tensamin/user/context";
import DeeplinkContext, { useDeeplinks } from "@tensamin/tauri/deeplinkHandler";
import NotificationsProvider from "@tensamin/notifications/context";
import PwaRuntime from "@tensamin/pwa/runtime";

import TAuthWrapper from "@tensamin/tauth/context";

import { ErrorScreen, ThemeProvider, useTheme } from "@methanium/ui";
import z from "zod";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import Session from "@tensamin/storage/session";
import Crypto from "@tensamin/crypto/context";
import DesktopMediaProvider from "@tensamin/shared/desktopMedia";
import { log } from "@tensamin/shared/log";

import CacheSync from "@tensamin/cache/sync";

import { useStorage } from "@tensamin/storage/context";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useIsMobile, Toaster, TooltipProvider } from "@methanium/ui";
import { HotkeysProvider } from "@tensamin/hotkeys";

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

  const { load, secureStorage } = useStorage();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (secureStorage === null) return;
    let active = true;

    Promise.all([load("user_id"), load("mtp_keyring")])
      .then(([userId, keyring]) => {
        if (!active) return;
        if (userId !== 0 && keyring !== "") {
          setLoggedIn(true);
          if (location.pathname === "/login") {
            void navigate({ to: "/", replace: true });
          }
          return;
        }
        setLoggedIn(false);
        void navigate({
          to: "/login",
          replace: true,
        });
      })
      .catch((error) => {
        log(0, "login", "red", "Failed to load login state", error);
      });

    return () => {
      active = false;
    };
  }, [load, location.pathname, navigate, secureStorage]);

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
    parentThemeId,
    setParentThemeId,
    applyThemePreset,
    themeDesign,
    setThemeDesign,
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
      load("theme_parent"),
      load("theme_design"),
    ]).then(
      ([
        color,
        palette,
        primaryColor,
        polarity,
        tint,
        borderRadius,
        customCss,
        parent,
        design,
      ]) => {
        if (!active) {
          return;
        }

        if (customCss === "" && parent) applyThemePreset(parent);
        else setParentThemeId(parent || null);
        setThemeColor(color);
        setThemePalette(palette);
        setThemePrimaryColor(primaryColor);
        setThemePolarity(polarity);
        setThemeTint(tint);
        setThemeBorderRadius(borderRadius);
        if (customCss !== "") setThemeCustomCss(customCss);
        setThemeDesign(design);
        loadedRef.current = true;
      },
    );

    return () => {
      active = false;
    };
  }, [
    load,
    applyThemePreset,
    setThemeBorderRadius,
    setThemeColor,
    setThemeCustomCss,
    setParentThemeId,
    setThemeDesign,
    setThemePalette,
    setThemePolarity,
    setThemePrimaryColor,
    setThemeTint,
  ]);

  useEffect(() => {
    if (loadedRef.current) save("theme_color", themeColor);
  }, [save, themeColor]);

  useEffect(() => {
    if (loadedRef.current) save("theme_palette", themePalette);
  }, [save, themePalette]);

  useEffect(() => {
    if (loadedRef.current) save("theme_primary_color", themePrimaryColor);
  }, [save, themePrimaryColor]);

  useEffect(() => {
    if (loadedRef.current) save("theme_polarity", themePolarity);
  }, [save, themePolarity]);

  useEffect(() => {
    if (loadedRef.current) save("theme_tint", themeTint);
  }, [save, themeTint]);

  useEffect(() => {
    if (loadedRef.current) save("theme_border_radius", themeBorderRadius);
  }, [save, themeBorderRadius]);

  useEffect(() => {
    if (loadedRef.current) save("theme_custom_css", themeCustomCss);
  }, [save, themeCustomCss]);

  useEffect(() => {
    if (loadedRef.current) save("theme_parent", parentThemeId ?? "");
  }, [parentThemeId, save]);

  useEffect(() => {
    if (loadedRef.current) save("theme_design", themeDesign);
  }, [save, themeDesign]);

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
        parentThemeStorageKey={null}
        designStorageKey={null}
      >
        <div
          data-pwa-root
          className="box-border w-screen h-dvh overflow-hidden"
        >
          <Toaster position={isMobile ? "top-center" : "bottom-right"} />
          <TooltipProvider>
            <Storage>
              <PwaRuntime />
              <HotkeysProvider>
                <ThemeStorageBridge />
                <LoginWrapper>
                  <Outlet />
                </LoginWrapper>
              </HotkeysProvider>
            </Storage>
          </TooltipProvider>
        </div>
      </ThemeProvider>
    </DeeplinkContext>
  );
}

function AppShell() {
  return (
    <OnboardingGate>
      <Crypto>
        <DesktopMediaProvider>
          <MTPProvider>
            <CacheSync />
            <DeeplinkNavigator />
            <Session>
              <UserProvider>
                <CallInit />
                <TAuthWrapper>
                  <AppLayout>
                    <ChatContext>
                      <NotificationsProvider>
                        <Outlet />
                      </NotificationsProvider>
                    </ChatContext>
                  </AppLayout>
                </TAuthWrapper>
              </UserProvider>
            </Session>
          </MTPProvider>
        </DesktopMediaProvider>
      </Crypto>
    </OnboardingGate>
  );
}

function DeeplinkNavigator() {
  const { deeplinks } = useDeeplinks();
  const navigate = useNavigate();
  const handledCount = useRef(0);

  useEffect(() => {
    const links = deeplinks.slice(handledCount.current);
    handledCount.current = deeplinks.length;

    for (const link of links) {
      try {
        const url = new URL(link);
        const id = Number(url.searchParams.get("id"));
        if (
          url.protocol === "tensamin:" &&
          url.hostname === "chat" &&
          Number.isSafeInteger(id) &&
          id > 0
        ) {
          void navigate({ to: "/chat", search: { id } });
        }
      } catch {
        // Ignore malformed URLs delivered by the platform.
      }
    }
  }, [deeplinks, navigate]);

  return null;
}

function createCallTrayIcon(color: string, speaking: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;

  const context = canvas.getContext("2d");
  if (!context) return undefined;

  context.globalAlpha = speaking ? 1 : 0.55;
  context.fillStyle = color;
  context.beginPath();
  context.arc(16, 16, 13, 0, Math.PI * 2);
  context.fill();

  if (speaking) {
    context.globalAlpha = 0.3;
    context.fillStyle = "#ffffff";
    context.fill();
  }

  return canvas.toDataURL("image/png");
}

function CallInit() {
  const callInvitePopup = useInitializeCall();

  const { load } = useStorage();
  const {
    themeColor,
    themePalette,
    themePrimaryColor,
    themePolarity,
    themeTint,
    themeCustomCss,
  } = useTheme();
  const [localUserId, setLocalUserId] = useState(-1);
  const [primaryColor, setPrimaryColor] = useState("");
  const inCall = useCall((state) => state.state === "open");
  const speaking = useIsSpeaking(localUserId);

  useEffect(() => {
    let active = true;

    load("user_id").then((userId) => {
      if (active) setLocalUserId(userId);
    });

    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPrimaryColor(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim(),
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [
    themeColor,
    themeCustomCss,
    themePalette,
    themePolarity,
    themePrimaryColor,
    themeTint,
  ]);

  useEffect(() => {
    const iconDataUrl = primaryColor
      ? createCallTrayIcon(primaryColor, speaking)
      : undefined;

    void window.tensaminDesktop?.call
      ?.setStatus?.({
        inCall,
        speaking: inCall && speaking,
        iconDataUrl: inCall ? iconDataUrl : undefined,
      })
      .catch((error: unknown) => {
        console.error("Failed to update desktop call status", error);
      });
  }, [inCall, primaryColor, speaking]);

  return callInvitePopup;
}

const rootRoute = createRootRoute({
  component: RootShell,
  errorComponent: ({ error }: { error: Error }) => (
    <ErrorScreen
      description={error.message}
      error={"Unknown Error: " + error.name}
    />
  ),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
  notFoundComponent: NotFound,
});

const settingsRoute = createSettingsRoute(appRoute);

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
  appRoute.addChildren([homeRoute, chatRoute, callRoute, settingsRoute]),
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
