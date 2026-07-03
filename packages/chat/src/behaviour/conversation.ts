import type { BoundSendFn } from "@tensamin/mtp";
import type { RawMessages } from "../values";

/**
 * Executes getMessages.
 * @param send Parameter send.
 * @param amount Parameter amount.
 * @param offset Parameter offset.
 * @param UserId Parameter UserId.
 * @returns Promise<RawMessages>.
 */
export async function getMessages(
  send: BoundSendFn,
  amount: number,
  offset: number,
  UserId: number,
): Promise<RawMessages> {
  const messages = await send("messages_get", {
    amount: amount,
    offset: offset,
    UserId,
  });

  if (messages.type.startsWith("error")) {
    throw new Error(messages.type);
  }

  return messages.data.messages;
}
