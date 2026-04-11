import { Basic, Loading } from "@/components/modals/basic";
import Wrapper from "@tensamin/user/wrapper";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tensamin/ui";
import { useNavigate } from "@tanstack/react-router";
import { useSidebar } from "@tensamin/ui";

export default function ConversationModal({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

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
              component={(user) => <Basic user={user} />}
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
