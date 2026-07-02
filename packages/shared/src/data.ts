import { z } from "zod";

import { legalDocsSchema } from "./features/legal/schema";
import {
  settingsStorageDefaults,
  type SettingsStorageDefaults,
} from "./settings";

const fileFromMessage = z.object({
  name: z.string(),
  id: z.uuidv4(),
  type: z.enum(["image", "image_top_right", "file"]),
});

export const message = z.object({
  height: z.number(),
  not_encrypted: z.boolean().optional(),
  sent_by_self: z.boolean().optional(),
  send_time: z.number(),
  content: z.base64(),
  files: z.array(fileFromMessage).optional(),
  tint: z.string().length(7).startsWith("#").optional(),
  avatar: z.boolean().optional(),
  display: z.boolean().optional(),
  message_state: z
    .enum(["read", "received", "sent", "sending", "awaiting"]) // awaiting for 'internal' use
    .default("received"),
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
} as z.infer<typeof mtp.get_user_data.response>;

const authPayload = z.object({
  communities: z.array(z.object({})).optional(),
  contacts: z.array(
    z.object({
      last_message_at: z.number(),
      user_id: z.number(),
      last_message: z
        .object({
          content: z.base64(),
          sender_id: z.number(),
        })
        .optional(),
      messages: z.array(message),
    }),
  ),
  calls: z.array(
    z.object({
      call_id: z.string(),
      call_secret: z.base64().optional(),
      call_members: z.array(z.number()),
    }),
  ),
});

export type Contacts = z.infer<typeof authPayload.shape.contacts>;
export type Communities = z.infer<typeof authPayload.shape.communities>;
export type Calls = z.infer<typeof authPayload.shape.calls>;

type Base16Palette = Record<
  | "base00"
  | "base01"
  | "base02"
  | "base03"
  | "base04"
  | "base05"
  | "base06"
  | "base07"
  | "base08"
  | "base09"
  | "base0A"
  | "base0B"
  | "base0C"
  | "base0D"
  | "base0E"
  | "base0F",
  string
>;

// MTP
const user = z.object({
  about: z.string().max(255).optional(),
  avatar: z.string().optional(),
  display: z.string().min(1).max(15),
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
  username: z.string().min(1).max(15),
});
export const mtp = {
  temp_cool_type: {
    request: z.object({}).optional(),
    response: authPayload,
  },
  get_user_data: {
    request: z.object({
      user_id: z.number().optional(),
      username: z.string().optional(),
    }),
    response: user,
  },
  change_user_data: {
    request: user.partial(),
    response: z.object({}),
  },
  ping: {
    request: z.object({
      last_ping: z.number(),
    }),
    response: z.object({
      ping_iota: z.number(),
    }),
  },
  message_live: {
    request: z.object({}).optional(),
    response: z.object({
      sender_id: z.number(),
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
      send_time: z.number(),
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
    request: z
      .object({
        chat_partner_id: z.number(),
        send_time: z.number(),
        message_state: message.shape.message_state,
      })
      .or(
        z.object({
          message_state: message.shape.message_state,
        }),
      ),
    response: z.object({
      chat_partner_id: z.number(),
      message_state: message.shape.message_state,
      send_time: z.number(),
    }),
  },

  load_txt_record: {
    request: z.object({
      path: z.string(),
    }),
    response: z.object({
      content: z.string(),
    }),
  },
  authenticate_app: {
    request: z.object({
      app_identifier: z.string(),
    }),
    response: z.object({
      challenge: z.base64(),
    }),
  },
  create_app: {
    request: z.object({
      app_public_key: z.base64(),
      app_identifier: z.string(),
    }),
    response: z.object({}),
  },

  // Calls
  call_token: {
    request: z.object({
      call_id: z.string(),
    }),
    response: z.object({
      call_token: z.string(),
    }),
  },
  call_data: {
    request: z.object({
      call_id: z.string(),
    }),
    response: z.object({
      user_ids: z.array(z.number()),
    }),
  },
  call_invite: {
    request: z.object({
      call_id: z.string(),
      call_secret: z.base64(),
      receiver_id: z.number(),
    }),
    response: z.object({
      call_id: z.string().optional(),
      call_secret: z.base64().optional(),
      sender_id: z.number().optional(),
    }),
  },
  error_no_iota: {
    request: z.object({}).optional(),
    response: z.object({}),
  },
} satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export type MTP = typeof mtp;

// Storage
export interface Storage extends SettingsStorageDefaults {
  session_id: number;
  user_id: number;
  private_key: string;
  ppandtos_done: boolean;
  accepted_terms_of_service: boolean;
  accepted_privacy_policy: boolean;
  analytics_crash_reports: boolean;
  analytics_usage_data: boolean;
  analytics_done: boolean;
  legal_docs: z.infer<typeof legalDocsSchema>;
  cached_contacts: Contacts;
  cached_communities: Communities;
  mtp_url: string;
  call_mute_range_start: number;
  call_mute_range_end: number;
  theme_color: string;
  theme_palette: Base16Palette | null;
  theme_primary_color: string;
  theme_polarity: "dark" | "light" | "system";
  theme_tint: "soft" | "hard" | "extreme";
  theme_border_radius: number;
  theme_custom_css: string;
  chat_trusted_domains: string[];
  chat_picker_saved_media: string[];
  chat_picker_last_tab: "gif" | "meme" | "saved";
  chat_picker_size: {
    width: number;
    height: number;
  } | null;
}

export const storageDefaults: Storage = {
  session_id: 0,
  user_id: 0,
  private_key: "",
  ppandtos_done: false,
  accepted_terms_of_service: false,
  accepted_privacy_policy: false,
  analytics_crash_reports: true,
  analytics_usage_data: true,
  analytics_done: false,
  ...settingsStorageDefaults,
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
  cached_contacts: [],
  cached_communities: [],
  mtp_url: "https://tensamin.net:959",
  call_mute_range_start: -55,
  call_mute_range_end: -45,
  theme_color: "",
  theme_palette: null,
  theme_primary_color: "",
  theme_polarity: "system",
  theme_tint: "soft",
  theme_border_radius: 0.55,
  theme_custom_css: "",
  chat_trusted_domains: [
    // Other platforms
    "cdn.discordapp.com",

    // Tenor
    "tenor.com",
    "c.tenor.com",

    // Klipy
    "static.klipy.com",
    "static1.klipy.com",
    "static2.klipy.com",

    // Giphy
    "giphy.com",
    "www.giphy.com",
    "media.giphy.com",
    "i.giphy.com",
    "media0.giphy.com",
    "media1.giphy.com",
    "media2.giphy.com",
    "media3.giphy.com",
    "media4.giphy.com",
  ],
  chat_picker_saved_media: [],
  chat_picker_last_tab: "gif",
  chat_picker_size: null,
};

// User Status
export function getStatusColor(
  status: z.infer<typeof mtp.get_user_data.response.shape.online_status>,
) {
  switch (status) {
    case "user_online":
      return "#22c55e";
    case "iota_online":
      return "#22c55e";
    case "user_dnd":
      return "#ef4444";
    case "user_idle":
      return "#f59e0b";
    case "user_wc":
      return "#3b82f6";
    case "user_borked":
    case "iota_borked":
      return "#6b7280";
    case "user_offline":
    case "iota_offline":
    default:
      return "#9ca3af";
  }
}
