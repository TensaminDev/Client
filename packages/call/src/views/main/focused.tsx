import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCall } from "../../store";
import Base from "../../components/modals/base";

const TILE_ASPECT_RATIO = 16 / 9;
const SECONDARY_ROW_HEIGHT_PX = 180;
const STACK_GAP_PX = 12;

export default function View() {
  const room = useCall((state) => state.room);

  const focusedParticipantId = useCall((state) => state.focusedParticipantId);
  const activeScreenShareParticipantIds = useCall(
    (state) => state.activeScreenShareParticipantIds,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedTileSize, setFocusedTileSize] = useState({ width: 0, height: 0 });
  const [isFocusedTileFlush, setIsFocusedTileFlush] = useState(false);

  const users = useMemo(() => {
    const participants = [
      ...room.remoteParticipants.values(),
      room.localParticipant,
    ];

    return participants.filter((participant) => {
      const participantId = Number(participant.identity);
      return Number.isInteger(participantId) && participantId > 0;
    });
  }, [room]);

  const userIds = useMemo(
    () => users.map((participant) => Number(participant.identity)),
    [users],
  );

  const tiles = useMemo(
    () => [
      ...activeScreenShareParticipantIds
        .filter((id) => id !== focusedParticipantId)
        .map((participantId) => ({
          key: `stream:${participantId}`,
          kind: "stream" as const,
          participantId,
        })),
      ...userIds
        .filter((id) => id !== focusedParticipantId)
        .filter((id) => !activeScreenShareParticipantIds.includes(id))
        .map((participantId) => ({
          key: `user:${participantId}`,
          kind: "user" as const,
          participantId,
        })),
    ],
    [activeScreenShareParticipantIds, userIds, focusedParticipantId],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const syncTileLayout = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(0, Math.floor(window.innerWidth + 1 - rect.left));
      const height = Math.max(0, Math.floor(container.clientHeight));
      const reservedHeight =
        tiles.length > 0 ? SECONDARY_ROW_HEIGHT_PX + STACK_GAP_PX : 0;
      const availableHeight = Math.max(0, height - reservedHeight);
      const nextWidth = Math.max(
        0,
        Math.min(width, availableHeight * TILE_ASPECT_RATIO),
      );
      const nextHeight = Math.max(0, nextWidth / TILE_ASPECT_RATIO);
      const widthDelta = Math.abs(width - nextWidth);

      setFocusedTileSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
      setIsFocusedTileFlush(widthDelta <= 1);
    };

    syncTileLayout();

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncTileLayout);
    });
    observer.observe(container);

    window.addEventListener("resize", syncTileLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTileLayout);
    };
  }, [tiles.length, focusedParticipantId]);

  if (focusedParticipantId == null) {
    return null;
  }

  const focusedParticipant = room.getParticipantByIdentity(
    String(focusedParticipantId),
  );

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="flex max-h-full w-full flex-col items-center overflow-hidden"
        style={{ gap: tiles.length > 0 ? STACK_GAP_PX : 0 }}
      >
        <div className="w-full flex justify-center overflow-hidden">
          <div className="overflow-hidden" style={focusedTileSize}>
            <Base
              flush={isFocusedTileFlush}
              type={focusedParticipant?.isScreenShareEnabled ? "stream" : "user"}
              participant={room.getParticipantByIdentity(
                String(focusedParticipantId),
              )}
            />
          </div>
        </div>
        {tiles.length > 0 && (
          <div
            className="w-full shrink-0 flex justify-center gap-2 overflow-x-auto"
            style={{ height: SECONDARY_ROW_HEIGHT_PX }}
          >
            {tiles.map((tile) => (
              <div key={tile.key} className="h-full shrink-0 aspect-video">
                <Base
                  type={tile.kind}
                  participant={room.getParticipantByIdentity(
                    String(tile.participantId),
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
