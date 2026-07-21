import { mtp } from "@tensamin/shared/data";
import { z } from "zod";

export const accountIdSchema = z.string().min(1);
export const contactSchema = z.object({
  LastMessageAt: z.number(),
  UserId: z.number(),
  LastMessage: z
    .object({ Content: z.base64(), SenderId: z.number() })
    .optional(),
  Messages: z.array(mtp.MessageGet.response),
});
export const contactsSchema = z.array(contactSchema);
export const userProfileSchema = mtp.GetUserData.response;

// Content remains the protocol base64 ciphertext. This package never decrypts messages.
export const cachedMessageSchema = mtp.MessageGet.response;
export const conversationWindowSchema = z.object({
  UserId: z.number(),
  LastMessageAt: z.number(),
  Messages: z.array(cachedMessageSchema),
});

export type Contact = z.infer<typeof contactSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type CachedMessage = z.infer<typeof cachedMessageSchema>;
export type ConversationWindow = z.infer<typeof conversationWindowSchema>;
