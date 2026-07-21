import { describe, expect, it } from "vitest";
import {
  replaceConversation,
  selectConversationWindows,
  trimMessages,
} from "./helpers";
import type { CachedMessage, ConversationWindow } from "./schemas";

const message = (SendTime: number): CachedMessage => ({
  SenderId: 1,
  SendTime,
  Content: "Y2lwaGVydGV4dA==",
  MessageState: "received",
});
const window = (UserId: number, LastMessageAt: number): ConversationWindow => ({
  UserId,
  LastMessageAt,
  Messages: [],
});

describe("conversation cache helpers", () => {
  it("selects the five most recent windows", () => {
    const selected = selectConversationWindows(
      [
        window(1, 1),
        window(2, 6),
        window(3, 3),
        window(4, 4),
        window(5, 5),
        window(6, 2),
      ],
      5,
    );
    expect(selected.map(({ UserId }) => UserId)).toEqual([2, 5, 4, 3, 6]);
  });

  it("replaces only the matching conversation", () => {
    expect(
      replaceConversation([window(1, 1), window(2, 2)], window(1, 9)),
    ).toEqual([window(1, 9), window(2, 2)]);
  });

  it("retains the newest messages in chronological order", () => {
    expect(
      trimMessages([message(2), message(3), message(1)], 2).map(
        (item) => item.SendTime,
      ),
    ).toEqual([2, 3]);
  });
});
