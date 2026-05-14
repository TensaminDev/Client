import Wrapper from "@tensamin/user/wrapper";
import { Basic, Loading } from "./modals/basic";
import List from "@/features/conversation/list/body";

import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";
import { useIsMobile } from "@tensamin/ui";
import { MobileNavbar } from "./navbar";

import SidebarBox from "@tensamin/call/sidebarBox";
import { useShowMobileNavbar } from "@/routes/app/layout";
/**
 * Renders the conversation sidebar with account summary and conversation list.
 * On mobile the sidebar is always kept in the DOM and hidden via CSS
 * (opacity + translateX) instead of being unmounted. This keeps the DOM and
 * React state alive while the drawer is closed, allowing the sidebar to open
 * instantly on subsequent toggles.
 * @returns Sidebar JSX.
 */
export default function Sidebar() {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();
  const { openMobile, setOpenMobile } = useSidebar();

  const content = (
    <>
      <SidebarContent
        className={
          isTauri() && isMobile ? "pt-[env(safe-area-inset-top)]" : "pt-2"
        }
      >
        <div className="h-full w-full flex flex-col gap-3 p-2 pt-0!">
          <div>
            <Wrapper
              loading={<Loading />}
              userId={"own"}
              component={(user) => <Basic user={user} />}
            />
          </div>
          <div className="h-full">
            <List />
          </div>
        </div>
      </SidebarContent>
      {isMobile && !showMobileNavbar && (
        <SidebarFooter className="p-0!">
          <MobileNavbar />
        </SidebarFooter>
      )}
      {!isMobile && (
        <SidebarFooter>
          <SidebarBox />
        </SidebarFooter>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setOpenMobile(false)}
          />
        )}
        <div
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="fixed inset-y-0 left-0 z-50 w-screen bg-sidebar p-0 text-sidebar-foreground transition-[transform,opacity] duration-150 ease-linear"
          style={{
            transform: openMobile ? "translateX(0)" : "translateX(-100%)",
            opacity: openMobile ? 1 : 0,
            pointerEvents: openMobile ? "auto" : "none",
          }}
        >
          <div className="flex h-full w-full flex-col">{content}</div>
        </div>
      </>
    );
  }

  return <SidebarRoot className="border-0!">{content}</SidebarRoot>;
}
