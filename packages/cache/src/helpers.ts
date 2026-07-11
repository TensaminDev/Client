import type { CachedMessage, ConversationWindow } from "./schemas";

export function trimMessages(
  messages: readonly CachedMessage[],
  limit: number,
): CachedMessage[] {
  return [...messages]
    .sort((a, b) => b.SendTime - a.SendTime)
    .slice(0, limit)
    .sort((a, b) => a.SendTime - b.SendTime);
}

export function replaceConversation(
  windows: readonly ConversationWindow[],
  replacement: ConversationWindow,
): ConversationWindow[] {
  return [
    replacement,
    ...windows.filter((item) => item.UserId !== replacement.UserId),
  ];
}

export function selectConversationWindows(
  windows: readonly ConversationWindow[],
  limit: number,
): ConversationWindow[] {
  return [...windows]
    .sort((a, b) => b.LastMessageAt - a.LastMessageAt || a.UserId - b.UserId)
    .slice(0, limit);
}
