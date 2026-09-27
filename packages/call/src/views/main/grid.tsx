import { RoomEvent } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCall, getRoom } from "../../store";
import Base from "../../components/modals/base";
import { cn, useIsMobile } from "@methanium/ui";

const TILE_ASPECT_RATIO = 16 / 9;
const GRID_GAP = 12;

type GridLayout = {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  rowCounts: number[];
};

function buildBalancedRows(itemCount: number, rows: number) {
  if (itemCount === 0 || rows === 0) {
    return [];
  }

  const baseCount = Math.floor(itemCount / rows);
  const remainder = itemCount % rows;

  return Array.from(
    { length: rows },
    (_, index) => baseCount + (index < remainder ? 1 : 0),
  );
}

export function calculateOptimalGridLayout(
  containerWidth: number,
  containerHeight: number,
  itemCount: number,
  gap = GRID_GAP,
): GridLayout {
  if (containerWidth <= 0 || containerHeight <= 0 || itemCount <= 0) {
    return {
      columns: 0,
      rows: 0,
      tileWidth: 0,
      tileHeight: 0,
      rowCounts: [],
    };
  }

  let bestLayout: GridLayout = {
    columns: 1,
    rows: itemCount,
    tileWidth: 0,
    tileHeight: 0,
    rowCounts: Array.from({ length: itemCount }, () => 1),
  };

  for (let columns = 1; columns <= itemCount; columns++) {
    const rows = Math.ceil(itemCount / columns);
    const maxTileWidth =
      (containerWidth - gap * Math.max(columns - 1, 0)) / columns;
    const maxTileHeight =
      (containerHeight - gap * Math.max(rows - 1, 0)) / rows;
    const tileWidth = Math.min(maxTileWidth, maxTileHeight * TILE_ASPECT_RATIO);
    const tileHeight = tileWidth / TILE_ASPECT_RATIO;

    if (tileWidth <= 0 || tileHeight <= 0) {
      continue;
    }

    const currentArea = tileWidth * tileHeight;
    const bestArea = bestLayout.tileWidth * bestLayout.tileHeight;

    if (currentArea > bestArea) {
      bestLayout = {
        columns,
        rows,
        tileWidth,
        tileHeight,
        rowCounts: buildBalancedRows(itemCount, rows),
      };
    }
  }

  return bestLayout;
}

export default function View() {
  const room = getRoom();
  const layoutVersion = useCall((state) => state.layoutVersion);
  const activeScreenShareParticipantIds = useCall(
    (state) => state.activeScreenShareParticipantIds,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [participantVersion, setParticipantVersion] = useState(0);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const syncContainerSize = () => {
      const { width, height } = element.getBoundingClientRect();
      setContainerSize({ width, height });
    };

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    syncContainerSize();
    observer.observe(element);

    return () => observer.disconnect();
  }, [layoutVersion]);

  useEffect(() => {
    const syncParticipants = () => {
      setParticipantVersion((version) => version + 1);
    };

    syncParticipants();

    room.on(RoomEvent.Connected, syncParticipants);
    room.on(RoomEvent.Disconnected, syncParticipants);
    room.on(RoomEvent.ParticipantConnected, syncParticipants);
    room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
    room.on(RoomEvent.TrackPublished, syncParticipants);
    room.on(RoomEvent.TrackUnpublished, syncParticipants);
    room.on(RoomEvent.TrackSubscribed, syncParticipants);
    room.on(RoomEvent.TrackUnsubscribed, syncParticipants);
    room.on(RoomEvent.ParticipantAttributesChanged, syncParticipants);

    return () => {
      room.off(RoomEvent.Connected, syncParticipants);
      room.off(RoomEvent.Disconnected, syncParticipants);
      room.off(RoomEvent.ParticipantConnected, syncParticipants);
      room.off(RoomEvent.ParticipantDisconnected, syncParticipants);
      room.off(RoomEvent.TrackPublished, syncParticipants);
      room.off(RoomEvent.TrackUnpublished, syncParticipants);
      room.off(RoomEvent.TrackSubscribed, syncParticipants);
      room.off(RoomEvent.TrackUnsubscribed, syncParticipants);
      room.off(RoomEvent.ParticipantAttributesChanged, syncParticipants);
    };
  }, [room]);

  const users = useMemo(() => {
    const participants = [
      ...room.remoteParticipants.values(),
      room.localParticipant,
    ];

    return participants.filter((participant) => {
      const participantId = Number(participant.identity);
      return Number.isInteger(participantId) && participantId > 0;
    });
    // eslint-disable-next-line
  }, [participantVersion, room]);

  const userIds = useMemo(
    () => users.map((participant) => Number(participant.identity)),
    [users],
  );

  const layout = useMemo(
    () =>
      calculateOptimalGridLayout(
        containerSize.width,
        containerSize.height,
        activeScreenShareParticipantIds.length + userIds.length,
      ),
    [
      activeScreenShareParticipantIds.length,
      containerSize.height,
      containerSize.width,
      userIds.length,
    ],
  );

  const rows = useMemo(() => {
    let nextParticipant = 0;

    return layout.rowCounts.map((count, rowIndex) => {
      const participants = Array.from(
        { length: count },
        () => nextParticipant++,
      );
      return { rowIndex, participants };
    });
  }, [layout.rowCounts]);

  const tiles = useMemo(
    () => [
      ...activeScreenShareParticipantIds.map((participantId) => ({
        key: `stream:${participantId}`,
        kind: "stream" as const,
        participantId,
      })),
      ...userIds.map((participantId) => ({
        key: `user:${participantId}`,
        kind: "user" as const,
        participantId,
      })),
    ],
    [activeScreenShareParticipantIds, userIds],
  );

  function getParticipantById(participantId: number) {
    if (Number(room.localParticipant.identity) === participantId) {
      return room.localParticipant;
    }

    return room.getParticipantByIdentity(String(participantId));
  }

  const isMobile = useIsMobile();

  return (
    <div
      ref={containerRef}
      style={{
        height: "calc(100% - 2rem)",
        width: "calc(100% - 2rem)",
      }}
      className={cn("overflow-hidden", isMobile ? "" : "p-3")}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        {rows.map((row) => (
          <div key={row.rowIndex} className="flex justify-center gap-3">
            {row.participants.map((userIndex) => {
              const tile = tiles[userIndex];

              if (!tile) {
                return null;
              }

              return (
                <div
                  key={tile.key}
                  className="flex items-center justify-center rounded-xl"
                  style={{
                    width: layout.tileWidth,
                    height: layout.tileHeight,
                  }}
                >
                  <Base
                    type={tile.kind}
                    participant={getParticipantById(tile.participantId)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
