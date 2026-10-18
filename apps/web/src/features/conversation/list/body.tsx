import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SpecialSwitch } from "@nonanium/ui";

import ConversationModal from "../modal/conversation";
import CommunityModal from "../modal/community";
import { Loader2 } from "lucide-react";
import { useSession } from "@tensamin/identity/session";

export default function List() {
  const [category, setCategory] = useState<"conversations" | "communities">(
    "conversations",
  );

  const { contacts, communities } = useSession();
  const items = category === "conversations" ? contacts : communities;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousOrder = useRef<{ category: string; ids: number[] } | null>(
    null,
  );

  // TanStack Virtual is intentionally used here; React Compiler memoization is skipped.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items?.length || 0,
    estimateSize: () => 50,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) =>
      category === "conversations"
        ? `conversation-${contacts[index]?.UserId ?? index}`
        : `community-${index}`,
  });

  useLayoutEffect(() => {
    if (category !== "conversations") {
      previousOrder.current = { category, ids: [] };
      return;
    }

    const ids = contacts.map((contact) => contact.UserId);
    const previous = previousOrder.current;
    previousOrder.current = { category, ids };
    if (
      previous?.category !== category ||
      previous.ids.length === 0 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const oldPositions = new Map(previous.ids.map((id, index) => [id, index]));
    const movedToTop = ids[0] !== previous.ids[0] && oldPositions.has(ids[0]);
    scrollRef.current
      ?.querySelectorAll<HTMLElement>("[data-contact-id]")
      .forEach((row) => {
        const id = Number(row.dataset.contactId);
        const oldIndex = oldPositions.get(id);
        const newIndex = ids.indexOf(id);
        if (oldIndex === undefined) {
          row.animate(
            [
              { opacity: 0, transform: "translateY(8px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        } else if (oldIndex !== newIndex) {
          const offset = Math.max(
            -220,
            Math.min(220, (oldIndex - newIndex) * 50),
          );
          row.animate(
            movedToTop && id === ids[0]
              ? [
                  { transform: `translateY(${offset}px)` },
                  { transform: "translateY(-3px)", offset: 0.68 },
                  { transform: "translateY(1px)", offset: 0.85 },
                  { transform: "translateY(0)" },
                ]
              : [
                  { transform: `translateY(${offset}px)` },
                  { transform: "translateY(0)" },
                ],
            {
              duration: movedToTop && id === ids[0] ? 230 : 170,
              easing: "ease-out",
            },
          );
        }
      });
  }, [category, contacts]);

  return (
    <div className="flex flex-col h-full">
      <SpecialSwitch
        className="mx-2"
        value={category}
        onValueChange={setCategory}
        options={[
          { value: "conversations", label: "Conversations" },
          { value: "communities", label: "Communities" },
        ]}
      />
      <div
        ref={scrollRef}
        id="conversation-list"
        className="overflow-y-auto flex-1 h-full p-1 px-2 pt-3"
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
              const itemKey = virtualItem.key;

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
                  <div
                    data-contact-id={
                      category === "conversations"
                        ? contacts[virtualItem.index]?.UserId
                        : undefined
                    }
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
