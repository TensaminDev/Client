import shortcodeData from "emojibase-data/en/shortcodes/joypixels.json";

type ShortcodeValue = string | string[];

export type EmojiDefinition = {
  aliases: readonly string[];
  hexcode: string;
  name: string;
  shortcode: string;
};

function normalizeName(value: string) {
  return value
    .trim()
    .replace(/^:+|:+$/g, "")
    .toLowerCase();
}

export const emojis: readonly EmojiDefinition[] = Object.entries(
  shortcodeData as Record<string, ShortcodeValue>,
).map(([hexcode, value]) => {
  const aliases = Array.isArray(value) ? value : [value];
  const name = aliases[0];

  return {
    aliases,
    hexcode: hexcode.toLowerCase().replaceAll("_", "-"),
    name,
    shortcode: `:${name}:`,
  };
});

const emojiByName = new Map<string, EmojiDefinition>();
for (const emoji of emojis) {
  for (const alias of emoji.aliases) {
    emojiByName.set(normalizeName(alias), emoji);
  }
}

export function resolveEmoji(value: string): EmojiDefinition | undefined {
  return emojiByName.get(normalizeName(value));
}

export function normalizeShortcode(value: string): string | undefined {
  return resolveEmoji(value)?.shortcode;
}

export function findEmojiShortcodes(value: string) {
  const matches: Array<{
    emoji: EmojiDefinition;
    from: number;
    to: number;
  }> = [];
  let searchFrom = 0;

  while (searchFrom < value.length) {
    const from = value.indexOf(":", searchFrom);
    if (from === -1) break;

    const candidate = value.slice(from).match(/^:([a-z0-9_+-]+):/i);
    if (!candidate) {
      searchFrom = from + 1;
      continue;
    }

    const emoji = resolveEmoji(candidate[1]);
    if (!emoji) {
      // The closing colon may also open the next valid shortcode.
      searchFrom = from + candidate[0].length - 1;
      continue;
    }

    const to = from + candidate[0].length;
    matches.push({ emoji, from, to });
    searchFrom = to;
  }

  return matches;
}

export function searchEmojis(query: string): EmojiDefinition[] {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return [...emojis];

  return emojis
    .map((emoji) => {
      const names = emoji.aliases.map(normalizeName);
      const exact = names.includes(normalizedQuery);
      const prefix = names.some((name) => name.startsWith(normalizedQuery));
      const contains = names.some((name) => name.includes(normalizedQuery));
      return { emoji, rank: exact ? 0 : prefix ? 1 : contains ? 2 : 3 };
    })
    .filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank || a.emoji.name.localeCompare(b.emoji.name))
    .map(({ emoji }) => emoji);
}
