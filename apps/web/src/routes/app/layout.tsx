import { type ReactNode } from "react";

import Sidebar from "@/components/sidebar";
import Navbar, { MobileNavbar } from "@/components/navbar";
import { useShowMobileNavbar } from "./useShowMobileNavbar";
import CallPopout from "@tensamin/call/popout";

import { useIsMobile, cn, SidebarProvider } from "@methanium/ui";

import { isTauri } from "@tauri-apps/api/core";

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();

  return (
    <div className="w-full h-full min-h-0 flex overflow-hidden bg-sidebar">
      <SidebarProvider className="h-full min-h-0 overflow-hidden">
        <Sidebar />
        <CallPopout />
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
