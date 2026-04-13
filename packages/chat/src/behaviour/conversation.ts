import type { BoundSendFn } from "@tensamin/ttp";
import type { TTP } from "@tensamin/shared/data";
import type { RawMessages } from "../values";

/**
 * Executes getMessages.
 * @param send Parameter send.
 * @param amount Parameter amount.
 * @param offset Parameter offset.
 * @param user_id Parameter user_id.
 * @returns Promise<RawMessages>.
 */
export async function getMessages(
  send: BoundSendFn<TTP>,
  amount: number,
  offset: number,
  user_id: number,
): Promise<RawMessages> {
  const messages = await send("messages_get", {
    amount: amount,
    offset: offset,
    user_id: user_id,
  });

  if (messages.type.startsWith("error")) {
    throw new Error(messages.type);
  }

  return messages.data.messages;
}
