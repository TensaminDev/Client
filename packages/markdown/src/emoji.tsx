import twemoji from "@twemoji/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@methanium/ui";
import { resolveEmoji } from "./emojiData";

export {
  emojis,
  findEmojiShortcodes,
  normalizeShortcode,
  resolveEmoji,
  searchEmojis,
} from "./emojiData";
export type { EmojiDefinition } from "./emojiData";

export function getEmojiUrl(shortcode: string): string | undefined {
  const emoji = resolveEmoji(shortcode);
  return emoji ? `${twemoji.base}svg/${emoji.hexcode}.svg` : undefined;
}

export default function Emoji({
  className = "h-6 w-6",
  shortcode,
  tooltip = true,
}: {
  className?: string;
  shortcode: string;
  tooltip?: boolean;
}) {
  const emoji = resolveEmoji(shortcode);
  if (!emoji) return <span>{shortcode}</span>;

  const image = (
    <img
      alt={emoji.shortcode}
      className={className}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={`${twemoji.base}svg/${emoji.hexcode}.svg`}
    />
  );

  if (!tooltip) return image;

  return (
    <Tooltip>
      <TooltipTrigger render={image} />
      <TooltipContent sideOffset={8}>{emoji.shortcode}</TooltipContent>
    </Tooltip>
  );
}
