import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@methanium/ui", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}));
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { normalizeShortcode, resolveEmoji, searchEmojis } from "./emojiData";
import { parseEmojiText, parseInlineNodes } from "./markdown";
import {
  createEmojiCompletionSource,
  findEmojiRanges,
  MAX_RENDERED_EMOJI_OPTIONS,
} from "./input";

describe("emoji shortcodes", () => {
  it("normalizes aliases to their canonical shortcode", () => {
    expect(normalizeShortcode(":flame:")).toBe(":fire:");
    expect(normalizeShortcode("+1")).toBe(":thumbsup:");
  });

  it("resolves every search result to a Twemoji hexcode", () => {
    const results = searchEmojis("fire");
    expect(results[0]?.shortcode).toBe(":fire:");
    expect(results.every((emoji) => emoji.hexcode.length > 0)).toBe(true);
  });

  it("shows all emojis for an empty query", () => {
    expect(searchEmojis("").length).toBeGreaterThan(1000);
  });

  it("bounds the number of mounted autocomplete rows", () => {
    expect(MAX_RENDERED_EMOJI_OPTIONS).toBeLessThanOrEqual(100);
  });

  it("parses known shortcodes and preserves unknown ones", () => {
    expect(parseEmojiText("a :fire: b :not_an_emoji:")).toEqual([
      { type: "text", value: "a " },
      { type: "emoji", shortcode: ":fire:" },
      { type: "text", value: " b :not_an_emoji:" },
    ]);
  });

  it("recognizes a valid shortcode sharing an unknown closing colon", () => {
    expect(parseEmojiText(":bla:thumbsup:")).toEqual([
      { type: "text", value: ":bla" },
      { type: "emoji", shortcode: ":thumbsup:" },
    ]);

    const state = EditorState.create({
      doc: ":bla:thumbsup:",
      extensions: [markdown()],
    });
    expect(findEmojiRanges(state)[0]?.from).toBe(4);
  });

  it("does not parse underscores inside emoji shortcodes as emphasis", () => {
    expect(parseInlineNodes("before :white_check_mark: after")).toEqual([
      { type: "text", value: "before " },
      { type: "emoji", shortcode: ":white_check_mark:" },
      { type: "text", value: " after" },
    ]);
  });

  it("contains the picker defaults", () => {
    expect(resolveEmoji(":thumbsup:")).toBeDefined();
    expect(resolveEmoji(":white_check_mark:")).toBeDefined();
  });

  it("finds completed emoji shortcodes in editor state", () => {
    const state = EditorState.create({
      doc: "before :fire: after :not_an_emoji:",
      extensions: [markdown()],
    });

    expect(
      findEmojiRanges(state).map(({ from, shortcode, to }) => ({
        from,
        shortcode,
        to,
      })),
    ).toEqual([{ from: 7, shortcode: ":fire:", to: 13 }]);
  });

  it("does not replace emoji shortcodes inside code", () => {
    const state = EditorState.create({
      doc: "`:fire:`\n\n```\n:fire:\n```\n\n:fire:",
      extensions: [markdown()],
    });

    expect(findEmojiRanges(state)).toHaveLength(1);
    expect(findEmojiRanges(state)[0]?.from).toBe(26);
  });

  it("ranks frequently used emojis first for a bare colon", async () => {
    const state = EditorState.create({ doc: ":", extensions: [markdown()] });
    const result = await createEmojiCompletionSource({
      ":fire:": 50,
      ":thumbsup:": 2,
    })(new CompletionContext(state, 1, false));

    expect(result?.options[0]?.displayLabel).toBe(":fire:");
    expect(result?.options[1]?.displayLabel).toBe(":thumbsup:");
  });

  it("keeps typed relevance above usage frequency", async () => {
    const state = EditorState.create({
      doc: ":fire",
      extensions: [markdown()],
    });
    const result = await createEmojiCompletionSource({
      ":fire_engine:": 10000,
      ":fire:": 1,
    })(new CompletionContext(state, 5, false));

    expect(result?.options[0]?.displayLabel).toBe(":fire:");
    expect(result?.options[0]?.boost).toBeGreaterThan(
      result?.options[1]?.boost ?? 0,
    );
  });

  it("merges alias frequencies into canonical completions", async () => {
    const state = EditorState.create({ doc: ":", extensions: [markdown()] });
    const result = await createEmojiCompletionSource({
      ":fire:": 2,
      ":flame:": 3,
    })(new CompletionContext(state, 1, false));
    const fire = result?.options.find(
      (option) => option.displayLabel === ":fire:",
    );

    expect(fire?.boost).toBe(15);
  });
});
