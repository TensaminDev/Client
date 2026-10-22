import { useStorage } from "@tensamin/storage/context";
import { useCallback, useEffect, useState } from "react";
import { normalizeShortcode } from "@nonanium/ui/markdown";

const RANKS_CHANGED_EVENT = "tensamin-reaction-ranks-changed";
let recordQueue = Promise.resolve();

function normalizeRanks(ranks: Record<string, number>) {
  return Object.entries(ranks).reduce<Record<string, number>>(
    (normalized, [value, frequency]) => {
      const shortcode = normalizeShortcode(value);
      if (!shortcode || !Number.isFinite(frequency) || frequency <= 0) {
        return normalized;
      }

      normalized[shortcode] = (normalized[shortcode] ?? 0) + frequency;
      return normalized;
    },
    {},
  );
}

function rankedEmojis(ranks: Record<string, number>) {
  return Object.entries(ranks)
    .filter(
      ([emoji, frequency]) =>
        normalizeShortcode(emoji) !== undefined &&
        Number.isFinite(frequency) &&
        frequency > 0,
    )
    .sort(([emojiA, frequencyA], [emojiB, frequencyB]) =>
      frequencyB === frequencyA
        ? emojiA.localeCompare(emojiB)
        : frequencyB - frequencyA,
    )
    .flatMap(([emoji]) => {
      const shortcode = normalizeShortcode(emoji);
      return shortcode ? [shortcode] : [];
    });
}

export function getRecentEmojis(ranks: Record<string, number>, amount: number) {
  return rankedEmojis(ranks).slice(0, amount);
}

export function useEmojiRanks() {
  const { load, save } = useStorage();
  const [ranks, setRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    void load("reactions").then((storedRanks) => {
      const normalized = normalizeRanks(storedRanks);
      setRanks(normalized);
      if (JSON.stringify(normalized) !== JSON.stringify(storedRanks)) {
        void save("reactions", normalized);
      }
    });

    function handleRanksChanged(event: Event) {
      setRanks((event as CustomEvent<Record<string, number>>).detail);
    }

    window.addEventListener(RANKS_CHANGED_EVENT, handleRanksChanged);
    return () =>
      window.removeEventListener(RANKS_CHANGED_EVENT, handleRanksChanged);
  }, [load, save]);

  return { ranks };
}

export function useRecordEmojiUse() {
  const { load, save } = useStorage();

  return useCallback(
    (emoji: string) => {
      const shortcode = normalizeShortcode(emoji);
      if (!shortcode) return;

      recordQueue = recordQueue
        .catch(() => undefined)
        .then(async () => {
          const normalized = normalizeRanks(await load("reactions"));
          const next = {
            ...normalized,
            [shortcode]: (normalized[shortcode] ?? 0) + 1,
          };
          await save("reactions", next);
          window.dispatchEvent(
            new CustomEvent(RANKS_CHANGED_EVENT, { detail: next }),
          );
        });
    },
    [load, save],
  );
}
