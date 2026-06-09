import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  Slider,
} from "@tensamin/ui";
import type { User } from "@tensamin/user/context";
import { useCall } from "../../store";
import { useState } from "react";

function EmptyCheckboxIndicator({ checked }: { checked: boolean }) {
  if (checked) {
    return null;
  }

  return (
    <span className="pointer-events-none absolute right-2 size-4 rounded-[4px] border border-current opacity-70" />
  );
}

export default function ContextMenu({
  user,
  ownId,
}: {
  user: User;
  ownId: number;
}) {
  const [muted, setMuted] = useState(false);
  const [soundboardMuted, setSoundboardMuted] = useState(false);
  const [serverDeafened, setServerDeafened] = useState(false);
  const [serverMuted, setServerMuted] = useState(false);
  const watchedStreamParticipantIds = useCall(
    (state) => state.watchedStreamParticipantIds,
  );

  return (
    <ContextMenuContent className="p-1">
      {watchedStreamParticipantIds.includes(user.user_id) &&
      user.user_id !== ownId ? (
        <ContextMenuItem variant="destructive">Stop Watching</ContextMenuItem>
      ) : null}
      <ContextMenuItem>Profile</ContextMenuItem>
      <ContextMenuItem>Change Nickname</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={(e) => e.preventDefault()}
        className="flex flex-col items-start pb-2"
      >
        <p>Volume</p>
        <Slider
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </ContextMenuItem>
      <ContextMenuCheckboxItem
        checked={muted}
        onCheckedChange={setMuted}
        onSelect={(e) => e.preventDefault()}
        className="flex justify-between"
      >
        <p>Mute</p>
        <EmptyCheckboxIndicator checked={muted} />
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={soundboardMuted}
        onCheckedChange={setSoundboardMuted}
        onSelect={(e) => e.preventDefault()}
        className="flex justify-between"
      >
        <p>Mute Soundboard</p>
        <EmptyCheckboxIndicator checked={soundboardMuted} />
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={serverDeafened}
        onCheckedChange={setServerDeafened}
        onSelect={(e) => e.preventDefault()}
        className="flex justify-between text-destructive focus:text-destructive"
      >
        <p>Server Deaf</p>
        <EmptyCheckboxIndicator checked={serverDeafened} />
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        checked={serverMuted}
        onCheckedChange={setServerMuted}
        onSelect={(e) => e.preventDefault()}
        className="flex justify-between text-destructive focus:text-destructive"
      >
        <p>Server Mute</p>
        <EmptyCheckboxIndicator checked={serverMuted} />
      </ContextMenuCheckboxItem>
      <ContextMenuItem variant="destructive">Disconnect</ContextMenuItem>
    </ContextMenuContent>
  );
}
