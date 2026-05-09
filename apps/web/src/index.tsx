import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
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

import ChatContext from "@tensamin/chat/context";
import { useInitializeCall } from "@tensamin/call/store";
import { Provider as TTPProvider } from "@tensamin/ttp";
import UserContext from "@tensamin/user/context";
import DeeplinkContext from "@tensamin/tauri/deeplinkHandler";
import NotificationsProvider from "@tensamin/notifications/context";

import TAuthWrapper from "@tensamin/tauth/context";

import { ThemeProvider } from "@tensamin/ui";
import z from "zod";

import { useEffect, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import Session from "@tensamin/storage/session";
import Crypto from "@tensamin/crypto/context";
import Mobile from "@tensamin/tauri/context";

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

function RootShell() {
  const isMobile = useIsMobile();

  return (
    <DeeplinkContext>
      <ThemeProvider>
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
              <LoginWrapper>
                <LegalWrapper>
                  <Crypto>
                    <Mobile>
                      <Outlet />
                    </Mobile>
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
  useInitializeCall();

  return null;
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
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(wrapper).render(<RouterProvider router={router} />);
