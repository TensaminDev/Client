import { type ReactNode } from "react";

import Sidebar from "@/components/sidebar";
import Navbar, { MobileNavbar } from "@/components/navbar";

import { useIsMobile, cn, SidebarProvider } from "@tensamin/ui";

import { isTauri } from "@tauri-apps/api/core";
import { useLocation, useMatches } from "@tanstack/react-router";

/**
 * Executes Layout.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();

  return (
    <div className="w-full h-full min-h-0 flex overflow-hidden bg-sidebar">
      <SidebarProvider className="h-full min-h-0 overflow-hidden">
        <Sidebar />
        <div
          // Background of ui that is overlapping with the system ui
          className={cn(
            "w-full h-full min-h-0 flex flex-col overflow-hidden",
            isTauri() && isMobile && "pt-[env(safe-area-inset-top)]",
            isMobile && showMobileNavbar && "bg-background",
          )}
        >
          {!isMobile && <Navbar forMobile={false} />}
          {isMobile && !showMobileNavbar && <Navbar forMobile={true} />}

          <div
            className={cn(
              "bg-background min-h-0 flex-1 w-full overflow-hidden",
              !isMobile && "rounded-tl-3xl border-t border-l",
            )}
          >
            {children}
          </div>

          {isMobile && showMobileNavbar && <MobileNavbar />}
        </div>
      </SidebarProvider>
    </div>
  );
}

export function useShowMobileNavbar(): boolean {
  const matches = useMatches();
  const location = useLocation();

  const value = matches.some(
    (match) =>
      match.pathname === location.pathname &&
      // @ts-expect-error Stuff
      match.staticData?.showMobileNavbar === true,
  );

  return value;
}
