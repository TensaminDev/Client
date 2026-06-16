import { z } from "zod";
import { ttp } from "@tensamin/shared/data";

export type RawMessages = z.infer<typeof ttp.messages_get.response>["messages"];

export type RawMessage = RawMessages[number];

export type LiveMessage = RawMessage & {
  failed?: boolean;
  localId: string;
};

export const PAGE_SIZE = 30;
export const FALLBACK_MESSAGE_HEIGHT = 28;
export const MESSAGES_PER_VIRTUAL_ROW = 30;
