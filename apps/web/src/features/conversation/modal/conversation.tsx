import { Basic, Loading } from "@/components/modals/basic";
import Wrapper from "@tensamin/user/wrapper";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tensamin/ui/cmp/context-menu";
import { useNavigate } from "@tanstack/react-router";

export default function ConversationModal({ userId }: { userId: number }) {
  const navigate = useNavigate();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="select-none cursor-pointer"
          onClick={() => navigate({ to: "/chat", search: { id: userId } })}
        >
          <Wrapper
            loading={<Loading />}
            userId={userId}
            component={(user) => <Basic user={user} />}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem>Test</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
