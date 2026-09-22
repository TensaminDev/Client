import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LoadingScreen } from "@methanium/ui";

import AppLayout from "./layout";
import CallInit from "@/components/callRuntimeInit";
import CacheSync from "@tensamin/cache/sync";
import ChatContext from "@tensamin/chat/context";
import Crypto from "@tensamin/crypto/context";
import UserProvider from "@tensamin/identity/context";
import { Provider as MTPProvider, useMTP } from "@tensamin/mtp";
import NotificationsProvider from "@tensamin/notifications/context";
import OnboardingGate from "@tensamin/onboarding";
import DesktopMediaProvider from "@tensamin/shared/desktopMedia";
import Session from "@tensamin/identity/session";
import { useDeeplinks } from "@tensamin/tauri/deeplinkHandler";
import { SettingsProfilesProvider } from "@tensamin/settings";

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
        } else if (
          url.protocol === "tensamin:" &&
          url.hostname === "authorize"
        ) {
          const request = url.searchParams.get("request");
          if (request) void navigate({ to: "/authorize", search: { request } });
        }
      } catch {
        // Ignore malformed URLs delivered by the platform.
      }
    }
  }, [deeplinks, navigate]);

  return null;
}

function MainApp() {
  const { contextReady, loadingDescription } = useMTP();

  return (
    <SettingsProfilesProvider>
      <OnboardingGate
        connectionReady={contextReady}
        connectionDescription={loadingDescription}
      >
        <CacheSync />
        <DeeplinkNavigator />
        <Session>
          <UserProvider>
            <CallInit />
            <AppLayout>
              <ChatContext>
                <NotificationsProvider>
                  <Outlet />
                </NotificationsProvider>
              </ChatContext>
            </AppLayout>
          </UserProvider>
        </Session>
      </OnboardingGate>
    </SettingsProfilesProvider>
  );
}

export default function AppShell() {
  const authorizing = useLocation().pathname === "/authorize";

  return (
    <Crypto>
      <DesktopMediaProvider>
        <MTPProvider
          fallback={
            <LoadingScreen title="Starting secure messaging" progress={8} />
          }
        >
          {authorizing ? <Outlet /> : <MainApp />}
        </MTPProvider>
      </DesktopMediaProvider>
    </Crypto>
  );
}
