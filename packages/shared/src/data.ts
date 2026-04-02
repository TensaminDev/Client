import { z } from "zod";

import { legalDocsSchema } from "./features/legal/schema";
import { community, conversation } from "./features/conversation/schema";

const fileFromMessage = z.object({
  name: z.string(),
  id: z.uuidv4(),
  type: z.enum(["image", "image_top_right", "file"]),
});

const message = z.object({
  height: z.number(),
  not_encrypted: z.boolean().optional(),
  sent_by_self: z.boolean(),
  timestamp: z.number(),
  content: z.base64(),
  files: z.array(fileFromMessage).optional(),
  tint: z.string().length(7).startsWith("#").optional(),
  avatar: z.boolean().optional(),
  display: z.boolean().optional(),
  message_state: z.enum(["read", "received", "sent", "sending", "awaiting"]), // awaiting for 'internal' use
});

export const failedUser = {
  display: "Failed",
  iota_id: 0,
  omikron_connections: [],
  online_status: "user_borked",
  public_key: "",
  sub_end: 0,
  sub_level: 0,
  user_id: 0,
  username: "unknown",
} as z.infer<typeof ttp.get_user_data.response>;

// TTP
export const ttp = {
  identification: {
    request: z
      .object({
        user_id: z.number().optional(),
        iota_id: z.number().optional(),
      })
      .refine(
        (value) =>
          (typeof value.user_id === "number") !==
          (typeof value.iota_id === "number"),
        {
          message: "Either user_id or iota_id must be provided",
        },
      ),
    response: z.object({
      challenge: z.string(),
      public_key: z.base64(),
    }),
  },
  get_user_data: {
    request: z.object({
      user_id: z.number(),
    }),
    response: z.object({
      about: z.string().max(255).optional(),
      avatar: z.string().optional(),
      display: z.string().max(15),
      iota_id: z.number(),
      omikron_connections: z.array(z.number()),
      omikron_id: z.number().optional(),
      online_status: z.enum([
        "user_offline",
        "user_online",
        "user_dnd",
        "user_idle",
        "user_wc",
        "user_borked",
        "iota_offline",
        "iota_online",
        "iota_borked",
      ]),
      public_key: z.base64(),
      status: z.string().max(15).optional(),
      sub_end: z.number(),
      sub_level: z.number(),
      user_id: z.number(),
      username: z.string().max(15),
    }),
  },
  challenge_response: {
    request: z.object({
      challenge: z.base64(),
    }),
    response: z.object({
      accepted: z.boolean(),
    }),
  },
  ping: {
    request: z.object({
      last_ping: z.number(),
    }),
    response: z.object({
      ping_iota: z.number(),
    }),
  },
  get_conversations: {
    request: z.object({}),
    response: z.object({
      user_ids: z.array(conversation),
    }),
  },
  get_communities: {
    request: z.object({}),
    response: z.object({
      communities: z.array(community),
    }),
  },
  message_live: {
    request: z.object({}),
    response: z.object({
      sender_id: z.number(),
      timestamp: z.number(),
      message,
    }),
  },
  messages_get: {
    request: z.object({
      user_id: z.number(),
      amount: z.number(),
      offset: z.number(),
    }),
    response: z.object({
      messages: z.array(message),
    }),
  },
  message_send: {
    request: z.object({
      height: z.number(),
      content: z.base64(),
      receiver_id: z.number(),
      timestamp: z.number(),
      files: z.array(fileFromMessage).optional(),
    }),
    response: z.object({}),
  },
  add_conversation: {
    request: z.object({
      chat_partner_id: z.number().optional(),
      chat_partner_name: z.string().min(1).max(15).optional(),
    }),
    response: z.object({}),
  },
  message_state: {
    request: z.object({
      chat_partner_id: z.number(),
      timestamp: z.number(),
      message_state: message.shape.message_state,
    }),
    response: z.object({
      chat_partner_id: z.number(),
      message_state: message.shape.message_state,
      timestamp: z.number(),
    }),
  },
} satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export type TTP = typeof ttp;

// Storage
export interface Storage {
  user_id: number;
  private_key: string;
  ppandtos_done: boolean;
  accepted_terms_of_service: boolean;
  accepted_privacy_policy: boolean;
  analytics_crash_reports: boolean;
  analytics_usage_data: boolean;
  analytics_done: boolean;
  legal_docs: z.infer<typeof legalDocsSchema>;
  chat_invert_enter_behaviour: boolean;
}

export const storageDefaults: Storage = {
  user_id: 0,
  private_key: "",
  ppandtos_done: false,
  accepted_terms_of_service: false,
  accepted_privacy_policy: false,
  analytics_crash_reports: true,
  analytics_usage_data: true,
  analytics_done: false,
  legal_docs: {
    eula: {
      version: "0.0",
      hash: "000000000000",
      unix: 0,
    },
    tos: {
      version: "0.0",
      hash: "000000000000",
      unix: 0,
    },
    pp: {
      version: "0.0",
      hash: "000000000000",
      unix: 0,
    },
  },
  chat_invert_enter_behaviour: false,
};
