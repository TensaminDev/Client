import { RoomEvent } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCall } from "../../store";

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

function calculateOptimalGridLayout(
  containerWidth: number,
  containerHeight: number,
  itemCount: number,
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
      (containerWidth - GRID_GAP * Math.max(columns - 1, 0)) / columns;
    const maxTileHeight =
      (containerHeight - GRID_GAP * Math.max(rows - 1, 0)) / rows;
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
  const room = useCall((state) => state.room);
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [participantCount, setParticipantCount] = useState(
    () => room.remoteParticipants.size + 1,
  );

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncParticipantCount = () => {
      setParticipantCount(room.remoteParticipants.size + 1);
    };

    syncParticipantCount();

    room.on(RoomEvent.Connected, syncParticipantCount);
    room.on(RoomEvent.Disconnected, syncParticipantCount);
    room.on(RoomEvent.ParticipantConnected, syncParticipantCount);
    room.on(RoomEvent.ParticipantDisconnected, syncParticipantCount);

    return () => {
      room.off(RoomEvent.Connected, syncParticipantCount);
      room.off(RoomEvent.Disconnected, syncParticipantCount);
      room.off(RoomEvent.ParticipantConnected, syncParticipantCount);
      room.off(RoomEvent.ParticipantDisconnected, syncParticipantCount);
    };
  }, [room]);

  const layout = useMemo(
    () =>
      calculateOptimalGridLayout(
        containerSize.width,
        containerSize.height,
        participantCount,
      ),
    [containerSize.height, containerSize.width, participantCount],
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

  const users = useMemo(() => {
    const participants = [
      ...room.remoteParticipants.values(),
      room.localParticipant,
    ];
    return participants;
  }, [room.localParticipant, room.remoteParticipants]);

  return (
    <div ref={containerRef} className="h-[75vh] w-full overflow-hidden p-3">
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        {rows.map((row) => (
          <div key={row.rowIndex} className="flex justify-center gap-3">
            {row.participants.map((userIndex) => (
              <div
                key={userIndex}
                className="flex items-center justify-center rounded-xl bg-red-500"
                style={{
                  width: layout.tileWidth,
                  height: layout.tileHeight,
                }}
              >
                Test {users[userIndex]?.identity}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
