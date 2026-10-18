import { Button } from "@nonanium/ui";
import { Emoji } from "@nonanium/ui/markdown";
import { getRecentEmojis, useEmojiRanks } from "./emojiRanks";

export default function EmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  const { ranks } = useEmojiRanks();
  const emojis = getRecentEmojis(ranks, 3);

  return (
    <div className="flex flex-row gap-1 p-1">
      {emojis.map((emoji) => (
        <Button
          key={emoji}
          className="h-10 w-10 p-0"
          onClick={() => onSelect(emoji)}
          type="button"
          variant="ghost"
        >
          <Emoji shortcode={emoji} />
        </Button>
      ))}
    </div>
  );
}
