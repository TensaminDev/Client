import { Basic, Loading } from "@/components/modals/basic";
import Wrapper from "@tensamin/identity/wrapper";
import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  useSidebar,
} from "@methanium/ui";
import { useNavigate } from "@tanstack/react-router";
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
            className="relative select-none cursor-pointer"
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
              component={(user) => <Basic user={user} />}
            />
            <span
              hidden={notifications === 0}
              className={cn(
                "h-4 absolute -left-1 -top-1 flex items-center justify-center text-[10.5px] leading-none text-primary-foreground bg-(--destructive) rounded-full",
                notifications < 10 ? "w-4" : "w-auto",
              )}
            >
              {notifications > 99 ? "99+" : notifications}
            </span>
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
