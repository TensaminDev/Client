import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import "./index.css";

import NotFound from "@/routes/404";

import RootLayout from "./routes/layout";
import AppLayout from "./routes/app/layout";

import Home from "@/routes/app/home";
import ChatScreen from "@tensamin/chat/screen";
import CallScreen from "@tensamin/call/screen";
import Login from "@/routes/screens/login";
import Signup from "@/routes/screens/signup";

import ChatContext from "@tensamin/chat/context";
import CallContext from "@tensamin/call/context";
import SocketContext from "@tensamin/ttp/context";
import UserContext from "@tensamin/user/context";

import { ThemeProvider } from "@tensamin/ui/theme";
import z from "zod";

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

function RootShell() {
  return (
    <ThemeProvider>
      <div className="w-screen h-screen overflow-hidden">
        <RootLayout>
          <Outlet />
        </RootLayout>
      </div>
    </ThemeProvider>
  );
}

function AppShell() {
  return (
    <SocketContext>
      <UserContext>
        <CallContext>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </CallContext>
      </UserContext>
    </SocketContext>
  );
}

function Chat() {
  return (
    <ChatContext>
      <ChatScreen />
    </ChatContext>
  );
}

const rootRoute = createRootRoute({
  component: RootShell,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: Home,
});

const chatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "chat",
  component: Chat,
  validateSearch: z.object({
    id: z.number().optional(),
  }),
});

const callRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "call",
  component: CallScreen,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "login",
  component: Login,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "signup",
  component: Signup,
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([homeRoute, chatRoute, callRoute]),
  loginRoute,
  signupRoute,
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
