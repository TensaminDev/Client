import Wrapper from "@tensamin/user/wrapper";
import { Basic, Loading } from "./modals/basic";
import List from "@/features/conversation/list/body";

import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
} from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";
import { useIsMobile } from "@tensamin/ui";
import { MobileNavbar } from "./navbar";

import SidebarBox from "@tensamin/call/sidebarBox";
import { useShowMobileNavbar } from "@/routes/app/layout";

/**
 * Renders the conversation sidebar with account summary and conversation list.
 * @returns Sidebar JSX.
 */
export default function Sidebar() {
  const isMobile = useIsMobile();
  const showMobileNavbar = useShowMobileNavbar();

  return (
    <SidebarRoot className="border-0!">
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
    </SidebarRoot>
  );
}
