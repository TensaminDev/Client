import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";

import AppLayout from "./layout";
import CallInit from "@/components/callRuntimeInit";
import CacheSync from "@tensamin/cache/sync";
import ChatContext from "@tensamin/chat/context";
import Crypto from "@tensamin/crypto/context";
import UserProvider from "@tensamin/identity/context";
import { Provider as MTPProvider } from "@tensamin/mtp";
import NotificationsProvider from "@tensamin/notifications/context";
import OnboardingGate from "@tensamin/onboarding";
import DesktopMediaProvider from "@tensamin/shared/desktopMedia";
import Session from "@tensamin/identity/session";
import { useDeeplinks } from "@tensamin/tauri/deeplinkHandler";
import TAuthWrapper from "@tensamin/tauth/context";

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

export default function AppShell() {
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
