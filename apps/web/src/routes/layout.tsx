import { useEffect, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import Crypto from "@tensamin/crypto/context";
import Mobile from "@tensamin/tauri/context";

import LegalWrapper from "@/features/legal/screen";

import { useStorage } from "@tensamin/storage/context";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useIsMobile, Toaster, TooltipProvider } from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout(props: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <>
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
                <Mobile>{props.children}</Mobile>
              </Crypto>
            </LegalWrapper>
          </LoginWrapper>
        </Storage>
      </TooltipProvider>
    </>
  );
}

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
