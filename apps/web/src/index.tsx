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
import Home from "@/routes/app/home";
import AppShell from "@/routes/app/shell";
import Login from "@/routes/screens/login";
import Register from "@/features/register/register";

import { createSettingsRoute } from "@tensamin/settings";
import ChatScreen from "@tensamin/chat/screen";
import CallScreen from "@tensamin/call/screen";
import Authorize from "@tensamin/tauth/authorize";

import DeeplinkContext from "@tensamin/tauri/deeplinkHandler";

import { LoadingScreen, ThemeProvider, useTheme } from "@methanium/ui";
import z from "zod";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import { log } from "@tensamin/shared/log";

import { useStorage } from "@tensamin/storage/context";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useIsMobile, Toaster, TooltipProvider } from "@methanium/ui";
import { HotkeysProvider } from "@tensamin/hotkeys";
import StartupErrorScreen from "@tensamin/storage/startupError";

let nextNavigationDirection: "forward" | "back" = "forward";
addEventListener("popstate", () => {
  nextNavigationDirection = "back";
});
addEventListener("tensamin:navigate-back", () => {
  nextNavigationDirection = "back";
});

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
window.enableDev = () => {
  localStorage.setItem("log_level", String(1000));
  location.reload();
};

function LoginWrapper({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState<Error | null>(null);

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
          const pendingAuthorization = sessionStorage.getItem(
            "tauth.authorization",
          );
          if (location.pathname === "/login" && pendingAuthorization) {
            sessionStorage.removeItem("tauth.authorization");
            window.location.assign(pendingAuthorization);
            return;
          }
          if (
            location.pathname === "/login" ||
            location.pathname === "/register"
          ) {
            void navigate({ to: "/", replace: true });
          }
          return;
        }
        setLoggedIn(false);
        if (location.pathname !== "/register") {
          if (location.pathname === "/authorize") {
            sessionStorage.setItem("tauth.authorization", window.location.href);
          }
          void navigate({
            to: "/login",
            replace: true,
          });
        }
      })
      .catch((error) => {
        log(0, "login", "red", "Failed to load login state", error);
        setLoginError(
          error instanceof Error ? error : new Error(String(error)),
        );
      });

    return () => {
      active = false;
    };
  }, [load, location.pathname, navigate, secureStorage]);

  if (loginError) {
    return (
      <StartupErrorScreen
        error="Failed to load login state"
        description={loginError.message}
      />
    );
  }

  if (
    loggedIn !== true &&
    location.pathname !== "/login" &&
    location.pathname !== "/register"
  ) {
    return <LoadingScreen title="Checking account" noProgress />;
  }

  return children;
}

function ThemeStorageBridge() {
  const { load, save } = useStorage();
  const { subscribe } = useStorage();
  const [profileRevision, setProfileRevision] = useState(0);
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
    notCustomized,
    themeDesign,
    setThemeDesign,
  } = useTheme();
  const loadedRef = useRef(false);

  useEffect(
    () =>
      subscribe((keys, bulk) => {
        if (bulk && keys.some((key) => key.startsWith("theme_"))) {
          loadedRef.current = false;
          setProfileRevision((revision) => revision + 1);
        }
      }),
    [subscribe],
  );

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

        setThemePolarity(polarity);
        if ((notCustomized || customCss === "") && parent) {
          applyThemePreset(parent);
        } else {
          setParentThemeId(parent || null);
          setThemeColor(color);
          setThemePalette(palette);
          setThemePrimaryColor(primaryColor);
          setThemeTint(tint);
          setThemeBorderRadius(borderRadius);
          setThemeCustomCss(customCss);
          setThemeDesign(design);
        }
        loadedRef.current = true;
      },
    );

    return () => {
      active = false;
    };
  }, [
    load,
    applyThemePreset,
    notCustomized,
    setThemeBorderRadius,
    setThemeColor,
    setThemeCustomCss,
    setParentThemeId,
    setThemeDesign,
    setThemePalette,
    setThemePolarity,
    setThemePrimaryColor,
    setThemeTint,
    profileRevision,
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
          data-safe-area-root
          className="box-border w-screen h-dvh overflow-hidden bg-background"
        >
          <Toaster position={isMobile ? "top-center" : "bottom-right"} />
          <TooltipProvider>
            <Storage>
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

const rootRoute = createRootRoute({
  component: RootShell,
  errorComponent: ({ error }: { error: Error }) => (
    <StartupErrorScreen
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
    showMobileNavbar: false,
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
    showMobileNavbar: true,
  },
});

const callRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "call",
  component: CallScreen,
  staticData: {
    showMobileNavbar: true,
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

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "register",
  component: Register,
  staticData: {
    showMobileNavbar: false,
  },
});

const authorizeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "authorize",
  validateSearch: z.object({ request: z.string().optional() }),
  component: function AuthorizationRoute() {
    const { request } = authorizeRoute.useSearch();
    return <Authorize request={request} />;
  },
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    homeRoute,
    chatRoute,
    callRoute,
    settingsRoute,
    authorizeRoute,
  ]),
  loginRoute,
  registerRoute,
]);

const router = createRouter({
  routeTree,
  history:
    window.location.protocol === "file:" ? createHashHistory() : undefined,
  defaultViewTransition: {
    types: ({ hrefChanged }) => {
      const direction = nextNavigationDirection;
      nextNavigationDirection = "forward";
      return hrefChanged &&
        matchMedia("(max-width: 767px)").matches &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches &&
        "startViewTransition" in document &&
        CSS.supports("selector(:active-view-transition-type(forward))")
        ? [direction]
        : false;
    },
  },
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(wrapper).render(<RouterProvider router={router} />);
