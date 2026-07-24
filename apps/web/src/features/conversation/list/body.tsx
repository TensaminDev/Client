import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import Switch from "./switch";
import ConversationModal from "../modal/conversation";
import CommunityModal from "../modal/community";
import { Loader2 } from "lucide-react";
import { useSession } from "@tensamin/storage/session";

export default function List() {
  const [category, setCategory] = useState<"conversations" | "communities">(
    "conversations",
  );

  const { contacts, communities } = useSession();
  const items = category === "conversations" ? contacts : communities;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // TanStack Virtual is intentionally used here; React Compiler memoization is skipped.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items?.length || 0,
    estimateSize: () => 60,
    getScrollElement: () => scrollRef.current,
  });

  return (
    <div className="flex flex-col gap-3 h-full">
      <Switch category={category} setCategory={setCategory} />
      <div
        ref={scrollRef}
        id="conversation-list"
        className="overflow-y-auto flex-1 h-full"
      >
        {items === null ? (
          <div className="flex items-center justify-center pt-5">
            <p className="text-foreground/45 flex gap-1 items-center justify-center">
              <Loader2 size={18} className="animate-spin" />
              Loading...
            </p>
          </div>
        ) : null}
        <div
          className="relative w-full flex flex-col"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {items &&
            virtualizer.getVirtualItems().map((virtualItem) => {
              const itemKey = `${category}-${virtualItem.index}`;

              return (
                <div
                  key={itemKey}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {category === "conversations" ? (
                    contacts?.[virtualItem.index] ? (
                      <ConversationModal
                        userId={contacts[virtualItem.index].UserId}
                      />
                    ) : null
                  ) : communities?.[virtualItem.index] ? (
                    <CommunityModal
                    //community={communities[virtualItem.index]}
                    />
                  ) : null}
                </div>
              );
            })}
          <p
            className="text-center text-sm px-2 text-muted-foreground transition-all duration-200 ease-in-out"
            hidden={contacts.length !== 0 || category !== "conversations"}
            style={{
              opacity:
                contacts.length === 0 && category === "conversations" ? 1 : 0,
            }}
          >
            Get started by adding a conversation
          </p>
        </div>
      </div>
    </div>
  );
}
