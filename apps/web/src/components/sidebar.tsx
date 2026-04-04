import { useStorage } from "@tensamin/storage/context";
import Wrapper from "@tensamin/user/wrapper";
import * as React from "react";
import { Basic, Loading } from "./modals/basic";
import List from "@/features/conversation/list/body";

import {
  Sidebar as SidebarRoot,
  SidebarContent,
} from "@tensamin/ui/cmp/sidebar";
import { isTauri } from "@tauri-apps/api/core";

/**
 * Renders the conversation sidebar with account summary and conversation list.
 * @returns Sidebar JSX.
 */
export default function Sidebar() {
  const [userId, setUserId] = React.useState<undefined | number>(undefined);
  const { load } = useStorage();

  React.useEffect(() => {
    load("user_id").then(setUserId);
  }, [load]);

  return (
    <SidebarRoot>
      <SidebarContent className={isTauri() ? "pt-[env(safe-area-inset-top)]" : "pt-2"}>
        <div className="h-full w-full flex flex-col gap-3 p-2 pt-0!">
          <div>
            <Wrapper
              loading={<Loading />}
              userId={userId}
              component={(user) => <Basic user={user} />}
            />
          </div>
          <div className="h-full">
            <List />
          </div>
        </div>
      </SidebarContent>
    </SidebarRoot>
  );
}
