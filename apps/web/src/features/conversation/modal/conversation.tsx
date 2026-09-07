import { Basic, Loading } from "@/components/modals/basic";
import Wrapper from "@tensamin/identity/wrapper";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  useSidebar,
} from "@methanium/ui";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useSession } from "@tensamin/identity/session";

export default function ConversationModal({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { contacts } = useSession();
  const notifications =
    contacts.find((contact) => contact.UserId === userId)?.notifications ?? 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className="select-none cursor-pointer"
            onClick={() => {
              navigate({ to: "/chat", search: { id: userId } });
              setOpenMobile(false);
            }}
          >
            <Wrapper
              loading={<Loading />}
              userId={userId}
              fields={[
                "Display",
                "Username",
                "Avatar",
                "OnlineStatus",
                "Status",
              ]}
              component={(user) => (
                <Basic
                  user={user}
                  extra={
                    notifications > 0 ? (
                      <span
                        className="absolute right-2 top-2 flex min-w-5 items-center justify-center gap-1 rounded-full border border-primary/40 bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground"
                        aria-label={`${notifications} unread ${notifications === 1 ? "message" : "messages"}`}
                      >
                        <Bell className="size-2.5" aria-hidden="true" />
                        {notifications > 99 ? "99+" : notifications}
                      </span>
                    ) : null
                  }
                />
              )}
            />
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem>Test</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
