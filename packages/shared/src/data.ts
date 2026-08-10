import { z } from "zod";
import type { ThemeDesign } from "@methanium/ui";

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

const bytesLike = z.union([
  z.instanceof(Uint8Array),
  z.array(z.number().int().min(0).max(255)),
  z.base64(),
]);

const protocolBytes = z.instanceof(Uint8Array);

function bytesFromProtocol(value: z.infer<typeof bytesLike>): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);

  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const protocolBytesResponse = bytesLike.transform(bytesFromProtocol);

const chatSecretResponse = z.object({
  UserId: z.string(),
  ChatId: z.string(),
  SecretId: z.string(),
  VersionNumber: z.number(),
  EncryptedSecret: bytesLike,
  KemCiphertext: bytesLike,
  WrappingScheme: z.string(),
  CreatedAt: z.number(),
  UpdatedAt: z.number(),
});

const chatSecretRecipient = z.object({
  UserId: z.string(),
  EncryptedSecret: protocolBytes,
  KemCiphertext: protocolBytes,
});

const callSecretEnvelopeResponse = z.object({
  SecretId: z.string(),
  VersionNumber: z.number(),
  EncryptedSecret: protocolBytesResponse,
  KemCiphertext: protocolBytesResponse,
  WrappingScheme: z.string(),
});

const callSecretEnvelopeRequest = z.object({
  SecretId: z.string(),
  VersionNumber: z.number(),
  EncryptedSecret: protocolBytes,
  KemCiphertext: protocolBytes,
  WrappingScheme: z.string(),
});

export const Reaction = z.object({
  Reaction: z.string(),
  SenderId: z.number(),
});

export const Message = z.object({
  NotEncrypted: z.boolean().optional(),
  SenderId: z.number(),
  SendTime: z.number(),
  Content: z.base64(),
  Files: z.array(fileFromMessage).optional(),
  Tint: z.string().length(7).startsWith("#").optional(),
  Avatar: z.boolean().optional(),
  Display: z.boolean().optional(),
  ReplyId: z.number().optional(),
  MessageState: z
    .enum(["read", "received", "sent", "sending", "awaiting"]) // awaiting for 'internal' use
    .default("received"),
  Edited: z.boolean().optional(),
  Reactions: z.array(Reaction).optional(),
});

export const failedUser = {
  Display: "Failed",
  IotaId: 0,
  OmikronConnections: [],
  OnlineStatus: "user_borked",
  PublicKey: "",
  SubEnd: 0,
  SubLevel: 0,
  UserId: 0,
  Username: "unknown",
} as z.infer<typeof mtp.GetUserData.response>;

const authPayload = z.object({
  Communities: z.array(z.object({})).default([]),
  Contacts: z
    .array(
      z.object({
        LastMessageAt: z.number().default(0),
        UserId: z.number(),
        LastMessage: z
          .object({
            Content: z.base64(),
            SenderId: z.number(),
          })
          .optional(),
        Messages: z.array(Message).default([]),
      }),
    )
    .default([]),
  Calls: z
    .array(
      z.object({
        CallId: z.string(),
        CallSecret: callSecretEnvelopeResponse.optional(),
        CallMembers: z.array(z.number()),
      }),
    )
    .default([]),
});

const clientStateSync = authPayload.extend({
  SessionId: z.number().int().positive(),
  VersionNumber: z.number().int().nonnegative(),
  CacheSchemaVersion: z.number().int().nonnegative(),
  SyncMode: z.enum(["full", "delta"]),
  Messages: z.array(Message).default([]),
  DeletedMessageIds: z.array(z.number()).default([]),
  DeletedContactIds: z.array(z.number()).default([]),
});

export type Contacts = z.infer<typeof authPayload.shape.Contacts>;
export type Communities = z.infer<typeof authPayload.shape.Communities>;
export type Calls = z.infer<typeof authPayload.shape.Calls>;

// MTP
const userFields = {
  About: z.string().max(255).optional(),
  Avatar: z.string().optional(),
  Display: z.string().min(1).max(15),
  IotaId: z.number(),
  OmikronConnections: z.array(z.number()),
  OmikronId: z.number().optional(),
  PublicKey: z.base64(),
  Status: z.string().max(15).optional(),
  SubEnd: z.number(),
  SubLevel: z.number(),
  UserId: z.number(),
  Username: z.string().min(1).max(15),
};

export const publicUserStateSchema = z.enum([
  "user_online",
  "user_idle",
  "user_dnd",
  "user_wc",
  "user_offline",
  "iota_offline",
]);

export const userPresencePreferenceSchema = z.enum([
  "user_online",
  "user_idle",
  "user_dnd",
  "user_wc",
  "user_invisible",
]);

export const clientUserStateSchema = z.union([
  publicUserStateSchema,
  userPresencePreferenceSchema,
]);

export const publicUserSchema = z.object({
  ...userFields,
  OnlineStatus: z.enum([
    "user_online",
    "user_idle",
    "user_dnd",
    "user_wc",
    "user_offline",
    "iota_offline",
    "user_borked",
    "iota_online",
    "iota_borked",
  ]),
});

export const accountUserSchema = z.object({
  ...userFields,
  OnlineStatus: userPresencePreferenceSchema,
});

export const userSchema = z.union([publicUserSchema, accountUserSchema]);

export const userStateEntrySchema = z.object({
  UserId: z.number().int().positive(),
  UserState: publicUserStateSchema,
});

export const mtp = {
  IdentificationResponse: {
    request: z.object({}).optional(),
    response: authPayload,
  },
  ClientConnected: {
    request: z.object({
      SessionId: z.number().int().positive(),
      VersionNumber: z.number().int().nonnegative(),
      CacheValid: z.boolean(),
      CacheSchemaVersion: z.number().int().nonnegative(),
    }),
    response: clientStateSync,
  },
  ClientStateSync: {
    request: z.object({}).optional(),
    response: clientStateSync,
  },
  ClientStateAck: {
    request: z.object({
      SessionId: z.number().int().positive(),
      VersionNumber: z.number().int().nonnegative(),
    }),
    response: z.object({}),
  },
  GetUserData: {
    request: z.object({
      UserId: z.number().optional(),
      Username: z.string().optional(),
    }),
    response: userSchema,
  },
  GetStates: {
    request: z.object({
      SessionId: z.number().int().positive(),
      UserIds: z.array(z.number().int().positive()),
    }),
    response: z.object({
      SessionId: z.number().int().positive(),
      // Keep valid entries when one entry in a server snapshot is malformed.
      UserStates: z.array(userStateEntrySchema.nullable().catch(null)),
      MissingUserIds: z.array(z.number().int().positive()).optional(),
    }),
  },
  ClientChanged: {
    request: z.object({}).optional(),
    response: z.object({
      SessionId: z.number().int().positive(),
      UserId: z.number().int().positive(),
      UserState: clientUserStateSchema,
    }),
  },
  ChangeUserData: {
    request: z
      .object({
        About: userFields.About,
        Avatar: userFields.Avatar,
        Display: userFields.Display,
        OnlineStatus: userPresencePreferenceSchema,
        PublicKey: userFields.PublicKey,
        Status: userFields.Status,
        Username: userFields.Username,
      })
      .partial(),
    response: z.object({}),
  },
  MessageDelete: {
    request: z.object({
      ChatPartnerId: z.number(),
      SendTime: z.number(),
    }),
    response: z.object({}),
  },
  MessageDeleteLive: {
    request: z.object({}),
    response: z.object({
      ChatPartnerId: z.number(),
      SendTime: z.number(),
    }),
  },
  MessageEditLive: {
    request: z.object({}),
    response: z.object({
      Content: z.base64(),
      ChatPartnerId: z.number(),
      SendTime: z.number(),
    }),
  },
  MessageEdit: {
    request: z.object({
      Content: z.base64(),
      ChatPartnerId: z.number(),
      SendTime: z.number(),
    }),
    response: z.object({}),
  },
  MessageReactionAdd: {
    request: z.object({
      Reaction: z.string(),
      SendTime: z.number(),
      ChatPartnerId: z.number(),
    }),
    response: z.object(),
  },
  MessageReactionRemove: {
    request: z.object({
      Reaction: z.string(),
      SendTime: z.number(),
      ChatPartnerId: z.number(),
    }),
    response: z.object(),
  },
  MessageReactionLive: {
    request: z.object(),
    response: z.object({
      Reaction: z.string(),
      SendTime: z.number(),
      ChatPartnerId: z.number(),
      SenderId: z.number(),
      Accepted: z.boolean(),
    }),
  },
  MessageLive: {
    request: z.object({}).optional(),
    response: z
      .object({
        SenderId: z.number(),
        Message: Message.extend({ SenderId: z.number().optional() }),
      })
      .transform(({ SenderId, Message }) => ({
        SenderId,
        Message: { ...Message, SenderId: Message.SenderId ?? SenderId },
      })),
  },
  MessageGet: {
    request: z.object({
      SendTime: z.number(),
    }),
    response: Message,
  },
  MessagesGet: {
    request: z.object({
      UserId: z.number(),
      Amount: z.number(),
      Offset: z.number(),
    }),
    response: z.object({
      Messages: z.array(Message),
    }),
  },
  MessageSend: {
    request: z.object({
      Content: z.base64(),
      ReceiverId: z.number(),
      SendTime: z.number(),
      ReplyId: z.number().optional(),
      Files: z.array(fileFromMessage).optional(),
    }),
    response: z.object({}),
  },
  AddConversation: {
    request: z.object({
      ChatPartnerId: z.number().optional(),
      ChatPartnerName: z.string().min(1).max(15).optional(),
    }),
    response: z.object({}),
  },
  MessageState: {
    request: z
      .object({
        ChatPartnerId: z.number(),
        SendTime: z.number(),
        MessageState: Message.shape.MessageState,
      })
      .or(
        z.object({
          MessageState: Message.shape.MessageState,
        }),
      ),
    response: z.object({
      ChatPartnerId: z.number(),
      MessageState: Message.shape.MessageState,
      SendTime: z.number(),
    }),
  },

  LoadTxtRecord: {
    request: z.object({
      Path: z.string(),
    }),
    response: z.object({
      Content: z.string(),
    }),
  },
  AuthenticateApp: {
    request: z.object({
      AppIdentifier: z.string(),
    }),
    response: z.object({
      Challenge: z.base64(),
    }),
  },
  CreateApp: {
    request: z.object({
      AppPublicKey: z.base64(),
      AppIdentifier: z.string(),
    }),
    response: z.object({}),
  },

  // Calls
  CallToken: {
    request: z.object({
      CallId: z.string(),
    }),
    response: z.object({
      CallToken: z.string(),
    }),
  },
  CallData: {
    request: z.object({
      CallId: z.string(),
    }),
    response: z.object({
      UserIds: z.array(z.number()),
    }),
  },
  CallInvite: {
    request: z.object({
      CallId: z.string(),
      CallSecret: callSecretEnvelopeRequest,
      ReceiverId: z.number(),
    }),
    response: z.object({
      CallId: z.string().optional(),
      CallSecret: callSecretEnvelopeResponse.optional(),
      SenderId: z.number().optional(),
    }),
  },
  SetChatSecret: {
    request: z.object({
      ChatId: z.string(),
      SecretId: z.string(),
      VersionNumber: z.number(),
      WrappingScheme: z.string(),
      CreatedAt: z.number(),
      Recipients: z.array(chatSecretRecipient).min(1),
    }),
    response: z.object({}),
  },
  GetChatSecret: {
    request: z.object({
      UserId: z.string(),
      ChatId: z.string(),
      SecretId: z.string().optional(),
    }),
    response: chatSecretResponse,
  },
  ChatSecretResponse: {
    request: z.object({}).optional(),
    response: chatSecretResponse,
  },
  ChatSecretForward: {
    request: z.object({
      ChatId: z.string(),
      SenderUserId: z.string(),
      RecipientUserId: z.string(),
      SecretId: z.string(),
      VersionNumber: z.number(),
      EncryptedSecret: protocolBytes,
      KemCiphertext: protocolBytes,
      WrappingScheme: z.string(),
      CreatedAt: z.number(),
    }),
    response: z.object({}),
  },
  ErrorNoIota: {
    request: z.object({}).optional(),
    response: z.object({}),
  },
  ErrorNotSet: {
    request: z.object({}).optional(),
    response: z.object({}),
  },
} satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export type MTP = typeof mtp;

// Storage
export interface Storage extends SettingsStorageDefaults {
  session_id: number;
  user_id: number;
  mtp_keyring: string;
  onboarding_done: boolean;
  onboarding_started: boolean;
  tauri_permissions_done: boolean;
  ppandtos_done: boolean;
  accepted_terms_of_service: boolean;
  accepted_privacy_policy: boolean;
  analytics_crash_reports: boolean;
  analytics_usage_data: boolean;
  analytics_done: boolean;
  legal_docs: z.infer<typeof legalDocsSchema>;
  cached_contacts: Contacts;
  cached_communities: Communities;
  cache_contacts: number;
  cache_messages_per_chat: number;
  omega_url: string;
  forced_omikron_url: string | undefined;
  forced_omikron_public_key: string | undefined;
  call_mute_range_start: number;
  call_mute_range_end: number;
  theme_color: string;
  theme_palette: Record<
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
  > | null;
  theme_primary_color: string;
  theme_polarity: "dark" | "light" | "system";
  theme_tint: "soft" | "hard" | "extreme";
  theme_border_radius: number;
  theme_custom_css: string;
  theme_parent: string;
  theme_design: ThemeDesign;
  chat_trusted_domains: string[];
  chat_picker_saved_media: string[];
  chat_picker_last_tab: "gif" | "meme" | "saved";
  chat_picker_size: {
    width: number;
    height: number;
  } | null;
  reactions: Record<string, number>;
  hotkey_overrides: Record<string, string | null>;
}

export const storageDefaults: Storage = {
  session_id: 0,
  user_id: 0,
  mtp_keyring: "",
  onboarding_done: false,
  onboarding_started: false,
  tauri_permissions_done: false,
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
  cache_contacts: 5,
  cache_messages_per_chat: 20,
  omega_url: "https://omega.tensamin.net",
  forced_omikron_url: undefined,
  forced_omikron_public_key: undefined,
  call_mute_range_start: -55,
  call_mute_range_end: -45,
  theme_color: "",
  theme_palette: null,
  theme_primary_color: "",
  theme_polarity: "system",
  theme_tint: "soft",
  theme_border_radius: 0.5,
  theme_custom_css: "",
  theme_parent: "tensamin",
  theme_design: {
    density: 1,
    borderWidth: 1,
    shadowStrength: 0,
    fontScale: 1,
    headingWeight: 600,
    motion: 1,
    fontFamily: "public-sans",
  },
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
  reactions: {
    ":thumbsup:": 3,
    ":fire:": 2,
    ":white_check_mark:": 1,
  },
  hotkey_overrides: {},
};

// User Status
export function getStatusColor(
  status:
    | z.infer<typeof publicUserSchema.shape.OnlineStatus>
    | z.infer<typeof userPresencePreferenceSchema>,
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
