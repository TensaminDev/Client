import { useEffect, useState, type ReactNode } from "react";

import Storage from "@tensamin/storage/context";
import Crypto from "@tensamin/crypto/context";
import Mobile from "@tensamin/mobile/context";

import LegalWrapper from "@/features/legal/screen";

import { Toaster } from "@tensamin/ui/cmp/sonner";
import { TooltipProvider } from "@tensamin/ui/cmp/tooltip";

import { useStorage } from "@tensamin/storage/context";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@tensamin/ui/utils";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout(props: { children: ReactNode }) {
  const [pixelRatio, setPixelRatio] = useState(devicePixelRatio);
  const [visible, setVisible] = useState(false);

  const isMobile = useIsMobile();

  useEffect(() => {
    const handleResize = () => {
      setPixelRatio(devicePixelRatio);
      setVisible(true);
      setTimeout(() => setVisible(false), 1000);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <div className="fixed top-0 left-0 z-100 w-screen h-screen flex flex-col justify-center items-center pointer-events-none select-none">
        {visible && (
          <div className="bg-card border p-1 text-xs">
            {Math.round(pixelRatio)}
          </div>
        )}

        {/* Todo: Make this nicer */}
        {pixelRatio !== 1 && (
          <div className="fixed bottom-0 right-0 m-3 text-xs text-red-500">
            Hey! You're zoomed in.
          </div>
        )}
      </div>
      <Toaster position={isMobile ? "top-center" : "bottom-right"} />
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
  }, [load, navigate, location.pathname]);

  if (loggedIn !== true && location.pathname !== "/login") {
    return null;
  }

  return children;
}
