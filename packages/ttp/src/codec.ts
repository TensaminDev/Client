const DATA_VALUE_KIND_BOOL_TRUE = 0x01;
const DATA_VALUE_KIND_BOOL_FALSE = 0x02;
const DATA_VALUE_KIND_NUMBER = 0x03;
const DATA_VALUE_KIND_STRING = 0x04;
const DATA_VALUE_KIND_ARRAY = 0x05;
const DATA_VALUE_KIND_CONTAINER = 0x06;
const DATA_VALUE_KIND_NULL = 0x07;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type PrimitiveDataKind = "bool" | "number" | "string" | "container" | "null";
type DataKind =
  | PrimitiveDataKind
  | { array: PrimitiveDataKind | "container" | "null" };

const COMMUNICATION_TYPES = [
  "error", // 0
  "error_protocol", // 1
  "error_anonymous", // 2
  "error_internal", // 3
  "error_invalid_data", // 4
  "error_invalid_user_id", // 5
  "error_invalid_omikron_id", // 6
  "error_not_found", // 7
  "error_not_authenticated", // 8
  "error_no_iota", // 9
  "error_invalid_challenge", // 10
  "error_invalid_secret", // 11
  "error_invalid_private_key", // 12
  "error_invalid_public_key", // 13
  "error_no_user_id", // 14
  "error_no_call_id", // 15
  "error_invalid_call_id", // 16
  "success", // 17
  "shorten_link", // 18
  "settings_save", // 19
  "settings_load", // 20
  "settings_list", // 21
  "message", // 22
  "message_state", // 23
  "message_send", // 24
  "message_live", // 25
  "message_other_iota", // 26
  "message_chunk", // 27
  "messages_get", // 28
  "push_notification", // 29
  "read_notification", // 30
  "get_notifications", // 31
  "change_confirm", // 32
  "confirm_receive", // 33
  "confirm_read", // 34
  "get_conversations", // 35
  "get_states", // 36
  "add_community", // 37
  "remove_community", // 38
  "get_communities", // 39
  "challenge", // 40
  "challenge_response", // 41
  "register", // 42
  "register_response", // 43
  "identification", // 44
  "identification_response", // 45
  "register_iota", // 46
  "register_iota_success", // 47
  "ping", // 48
  "pong", // 49
  "add_conversation", // 50
  "send_chat", // 51
  "client_changed", // 52
  "client_connected", // 53
  "client_disconnected", // 54
  "client_closed", // 55
  "public_key", // 56
  "private_key", // 57
  "webrtc_sdp", // 58
  "webrtc_ice", // 59
  "start_stream", // 60
  "end_stream", // 61
  "watch_stream", // 62
  "call_token", // 63
  "call_invite", // 64
  "call_disconnect_user", // 65
  "call_timeout_user", // 66
  "call_set_anonymous_joining", // 67
  "end_call", // 68
  "function", // 69
  "update", // 70
  "create_user", // 71
  "rho_update", // 72
  "user_connected", // 73
  "user_disconnected", // 74
  "iota_connected", // 75
  "iota_disconnected", // 76
  "sync_client_iota_status", // 77
  "get_user_data", // 78
  "get_iota_data", // 79
  "iota_user_data", // 80
  "change_user_data", // 81
  "change_iota_data", // 82
  "get_register", // 83
  "complete_register_user", // 84
  "complete_register_iota", // 85
  "delete_user", // 86
  "delete_iota", // 87
  "start_register", // 88
  "complete_register", // 89
] as const;

const DATA_TYPES = [
  "error_type", // 0
  "error_protocol", // 1
  "accepted_ids", // 2
  "uuid", // 3
  "register_id", // 4
  "link", // 5
  "settings", // 6
  "settings_name", // 7
  "chat_partner_id", // 8
  "chat_partner_name", // 9
  "iota_id", // 10
  "user_id", // 11
  "user_ids", // 12
  "iota_ids", // 13
  "user_state", // 14
  "user_states", // 15
  "user_pings", // 16
  "call_state", // 17
  "screen_share", // 18
  "private_key_hash", // 19
  "accepted", // 20
  "accepted_profiles", // 21
  "denied_profiles", // 22
  "content", // 23
  "messages", // 24
  "notifications", // 25
  "timestamp", // 26
  "get_time", // 27
  "get_variant", // 28
  "shared_secret_own", // 29
  "shared_secret_other", // 30
  "shared_secret_sign", // 31
  "shared_secret", // 32
  "call_id", // 33
  "call_token", // 34
  "untill", // 35
  "enabled", // 36
  "start_date", // 37
  "end_date", // 38
  "receiver_id", // 39
  "sender_id", // 40
  "signature", // 41
  "signed", // 42
  "message", // 43
  "message_state", // 44
  "last_ping", // 45
  "ping_iota", // 46
  "ping_clients", // 47
  "matches", // 48
  "omikron", // 49
  "offset", // 50
  "amount", // 51
  "position", // 52
  "name", // 53
  "path", // 54
  "codec", // 55
  "function", // 56
  "payload", // 57
  "result", // 58
  "interactables", // 59
  "want_to_watch", // 60
  "watcher", // 61
  "created_at", // 62
  "username", // 63
  "display", // 64
  "avatar", // 65
  "about", // 66
  "status", // 67
  "public_key", // 68
  "sub_level", // 69
  "sub_end", // 70
  "community_address", // 71
  "challenge", // 72
  "community_title", // 73
  "communities", // 74
  "rho_connections", // 75
  "user", // 76
  "online_status", // 77
  "omikron_id", // 78
  "omikron_connections", // 79
  "reset_token", // 80
  "new_token", // 81
  "call_invited", // 82
  "call_members", // 83
  "calls", // 84
  "timeout", // 85
  "has_admin", // 86
  "last_message_at", // 87
  "height", // 88
  "sent_by_self", // 89
  "session_id", // 90
  "contacts", // 91
  "last_message", // 92
  "version", // 93
] as const;

const COMMUNICATION_TYPE_BY_NAME = createIndexMap(COMMUNICATION_TYPES);
const DATA_TYPE_BY_NAME = createIndexMap(DATA_TYPES);
const SCALAR_NUMBER_ARRAY_DATA_TYPES = new Set(["last_ping", "ping_iota"]);

const dataKindByType = new Map<string, DataKind>();

registerDataKinds("number", [
  "user_id",
  "sender_id",
  "register_id",
  "receiver_id",
  "call_id",
  "amount",
  "position",
  "offset",
  "timeout",
  "iota_id",
  "chat_partner_id",
  "untill",
  "start_date",
  "end_date",
  "omikron_id",
  "timestamp",
  "sub_level",
  "sub_end",
  "last_message_at",
  "height",
  "session_id",
]);

registerDataKinds("string", [
  "error_type",
  "username",
  "display",
  "avatar",
  "about",
  "public_key",
  "message",
  "content",
  "path",
  "codec",
  "function",
  "uuid",
  "link",
  "settings_name",
  "chat_partner_name",
  "user_state",
  "call_state",
  "private_key_hash",
  "name",
  "shared_secret_own",
  "shared_secret_other",
  "shared_secret_sign",
  "shared_secret",
  "message_state",
  "signature",
  "reset_token",
  "new_token",
  "call_token",
  "challenge",
  "online_status",
  "version",
]);

registerDataKinds({ array: "container" }, [
  "messages",
  "communities",
  "rho_connections",
  "matches",
  "get_conversations",
  "get_communities",
  "contacts",
]);

registerDataKinds({ array: "number" }, [
  "notifications",
  "iota_ids",
  "user_ids",
  "accepted_ids",
  "last_ping",
  "ping_iota",
  "get_time",
  "omikron_connections",
]);

registerDataKinds("container", [
  "settings",
  "user",
  "payload",
  "result",
  "ping_clients",
  "user_pings",
  "last_message",
]);

registerDataKinds("bool", [
  "enabled",
  "signed",
  "accepted",
  "has_admin",
  "screen_share",
  "sent_by_self",
]);

registerDataKinds({ array: "string" }, ["user_states"]);

registerDataKinds("null", [
  "error_protocol",
  "accepted_profiles",
  "denied_profiles",
  "get_variant",
  "omikron",
  "interactables",
  "want_to_watch",
  "watcher",
  "created_at",
  "status",
  "community_address",
  "community_title",
  "call_invited",
  "call_members",
  "calls",
]);

for (const dataType of DATA_TYPES) {
  if (!dataKindByType.has(dataType)) {
    throw new Error(`Missing data kind mapping for "${dataType}"`);
  }
}

export type TypedMessage<TData = Record<string, unknown>> = {
  id: number;
  type: string;
  data: TData;
};

/**
 * Represents non-fatal payload decoding failures for individual protocol messages.
 */
export class RecoverableMessageDecodeError extends Error {
  readonly messageId: number;

  readonly messageType: string;

  readonly cause: unknown;

  /**
   * Creates a recoverable decode error associated with a specific message.
   * @param messageId Protocol message id that failed to decode.
   * @param messageType Protocol message type that failed to decode.
   * @param cause Original decode failure cause.
   */
  constructor(messageId: number, messageType: string, cause: unknown) {
    super(
      `Failed to decode message payload for "${messageType}" (id=${messageId}): ${formatUnknownError(cause)}`,
    );
    this.name = "RecoverableMessageDecodeError";
    this.messageId = messageId;
    this.messageType = messageType;
    this.cause = cause;
  }
}

/**
 * Formats unknown errors into a stable log string.
 * @param error Unknown error value.
 * @returns Human-readable error description.
 */
function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Checks whether a value is a non-null, non-array object.
 * @param value Candidate value.
 * @returns True when the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Encodes a typed protocol message into the wire communication format.
 * @param message Typed message with id, type, and payload data.
 * @returns Encoded communication frame bytes.
 */
export function encodeCommunicationMessage(
  message: TypedMessage<Record<string, unknown>>,
) {
  const typeIndex = parseCommunicationType(message.type);
  const hasId = message.id !== 0;
  const dataBuffer = encodeContainerPayload(message.data, "payload");
  const payloadLength = 2 + (hasId ? 4 : 0) + dataBuffer.byteLength;
  const buffer = new Uint8Array(4 + payloadLength);

  writeU32(buffer, 0, payloadLength);
  buffer[4] = typeIndex;
  buffer[5] = hasId ? 0b0000_0100 : 0;

  let offset = 6;
  if (hasId) {
    writeU32(buffer, offset, message.id);
    offset += 4;
  }

  buffer.set(dataBuffer, offset);

  return buffer;
}

/**
 * Decodes communication frame bytes into a typed protocol message.
 * @param frame Encoded communication frame bytes.
 * @returns Decoded typed protocol message.
 */
export function decodeCommunicationMessage(frame: Uint8Array): TypedMessage {
  const reader = new ByteReader(frame);
  const frameLength = reader.readU32();
  if (frameLength !== frame.byteLength - 4) {
    throw new Error(
      `Communication frame length mismatch: expected ${frameLength}, received ${frame.byteLength - 4}`,
    );
  }

  const payloadLength = reader.readU32();
  if (payloadLength !== frameLength - 4) {
    throw new Error(
      `Communication payload length mismatch: expected ${payloadLength}, received ${frameLength - 4}`,
    );
  }

  const typeIndex = reader.readU8();
  const flags = reader.readU8();
  const hasSender = (flags & 0b0000_0001) !== 0;
  const hasReceiver = (flags & 0b0000_0010) !== 0;
  const hasId = (flags & 0b0000_0100) !== 0;

  const id = hasId ? reader.readU32() : 0;
  if (hasSender) {
    reader.readU48();
  }
  if (hasReceiver) {
    reader.readU48();
  }

  const consumedHeaderBytes =
    2 + (hasId ? 4 : 0) + (hasSender ? 6 : 0) + (hasReceiver ? 6 : 0);
  if (consumedHeaderBytes > payloadLength) {
    throw new Error("Communication header exceeds payload length");
  }

  const messageType = COMMUNICATION_TYPES[typeIndex] ?? "error_protocol";

  const dataLength = payloadLength - consumedHeaderBytes;
  let decodedData: Record<string, unknown>;

  if (dataLength === 0) {
    decodedData = {};
  } else {
    const dataReader = new ByteReader(reader.readBytes(dataLength));

    try {
      decodedData = decodeContainerPayload(dataReader);
    } catch (error) {
      if (messageType.startsWith("error")) {
        return {
          id,
          type: messageType,
          data: {},
        };
      } else {
        throw new RecoverableMessageDecodeError(id, messageType, error);
      }
    }

    if (!dataReader.isAtEnd()) {
      throw new RecoverableMessageDecodeError(
        id,
        messageType,
        new Error("Trailing bytes found after communication data payload"),
      );
    }
  }

  if (!reader.isAtEnd()) {
    throw new Error("Trailing bytes found after communication payload");
  }

  return {
    id,
    type: messageType,
    data: decodedData,
  };
}

/**
 * Builds a normalized lookup map for protocol names by index.
 * @param values Ordered protocol names.
 * @returns Map from normalized name to array index.
 */
function createIndexMap(values: readonly string[]) {
  const map = new Map<string, number>();

  values.forEach((value, index) => {
    map.set(normalizeName(value), index);
  });

  return map;
}

/**
 * Registers expected data kinds for protocol data type names.
 * @param kind Expected scalar or array kind for the provided names.
 * @param names Data type names to register.
 * @returns Void.
 */
function registerDataKinds(kind: DataKind, names: readonly string[]) {
  for (const name of names) {
    if (dataKindByType.has(name)) {
      throw new Error(`Duplicate data kind registration for "${name}"`);
    }

    dataKindByType.set(name, kind);
  }
}

/**
 * Normalizes protocol names by lowercasing and removing underscores.
 * @param value Raw protocol name.
 * @returns Normalized protocol key.
 */
function normalizeName(value: string) {
  return value.toLowerCase().replaceAll("_", "");
}

/**
 * Parses a protocol data key into its index and canonical name.
 * @param type Raw protocol data key.
 * @returns Canonical data key metadata with index and normalized name.
 */
function parseDataType(type: string) {
  const index = DATA_TYPE_BY_NAME.get(normalizeName(type));
  if (index === undefined) {
    throw new Error(`Unknown data type "${type}"`);
  }

  return {
    index,
    name: DATA_TYPES[index],
  };
}

/**
 * Resolves a communication type string to its protocol index.
 * @param type Protocol message type string.
 * @returns Numeric protocol type index.
 */
function parseCommunicationType(type: string) {
  const index = COMMUNICATION_TYPE_BY_NAME.get(normalizeName(type));
  if (index === undefined) {
    throw new Error(`Unknown communication type "${type}"`);
  }

  return index;
}

/**
 * Returns the expected value kind for a protocol data key.
 * @param type Canonical data key name.
 * @returns Expected data kind definition.
 */
function getExpectedKind(type: string) {
  const kind = dataKindByType.get(type);
  if (!kind) {
    throw new Error(`No data kind registered for "${type}"`);
  }

  return kind;
}

type EncodedDataValue = {
  kind: number;
  payload: Uint8Array;
};

/**
 * Encodes a value according to the expected protocol kind.
 * @param kind Expected protocol kind.
 * @param value Candidate value to encode.
 * @param path Payload path used in validation errors.
 * @returns Encoded value marker and payload bytes.
 */
function encodeDataValueForKind(
  kind: DataKind,
  value: unknown,
  path: string,
): EncodedDataValue {
  if (typeof kind === "object") {
    return {
      kind: DATA_VALUE_KIND_ARRAY,
      payload: encodeArrayPayload(kind.array, value, path),
    };
  }

  switch (kind) {
    case "bool":
      if (typeof value !== "boolean") {
        throw new Error(`Expected boolean at "${path}"`);
      }

      return {
        kind: value ? DATA_VALUE_KIND_BOOL_TRUE : DATA_VALUE_KIND_BOOL_FALSE,
        payload: new Uint8Array(0),
      };

    case "number":
      return {
        kind: DATA_VALUE_KIND_NUMBER,
        payload: encodeNumberPayload(value, path),
      };

    case "string":
      if (typeof value !== "string") {
        throw new Error(`Expected string at "${path}"`);
      }

      return {
        kind: DATA_VALUE_KIND_STRING,
        payload: textEncoder.encode(value),
      };

    case "container":
      if (!isPlainObject(value)) {
        throw new Error(`Expected object at "${path}"`);
      }

      return {
        kind: DATA_VALUE_KIND_CONTAINER,
        payload: encodeContainerPayload(value, path),
      };

    case "null":
      if (value !== null && value !== undefined) {
        throw new Error(`Expected null at "${path}"`);
      }

      return {
        kind: DATA_VALUE_KIND_NULL,
        payload: new Uint8Array(0),
      };
  }
}

/**
 * Encodes a numeric payload as signed 64-bit big-endian bytes.
 * @param value Value expected to be a safe integer number.
 * @param path Payload path used in validation errors.
 * @returns Encoded i64 byte array.
 */
function encodeNumberPayload(value: unknown, path: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(`Expected safe integer at "${path}"`);
  }

  const buffer = new Uint8Array(8);
  writeI64(buffer, 0, value);
  return buffer;
}

/**
 * Encodes an array payload where each item is tagged with a data marker.
 * @param innerKind Expected kind for array entries.
 * @param value Candidate array payload.
 * @param path Payload path used in validation errors.
 * @returns Encoded array payload bytes.
 */
function encodeArrayPayload(
  innerKind: PrimitiveDataKind | "container" | "null",
  value: unknown,
  path: string,
) {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at "${path}"`);
  }

  if (value.length > 0xffff) {
    throw new Error(`Array at "${path}" is too large for protocol encoding`);
  }

  const encodedItems = value.map((entry, index) =>
    encodeDataValueForKind(innerKind, entry, `${path}[${index}]`),
  );

  let totalLength = 2;
  for (const encodedItem of encodedItems) {
    totalLength += 1;

    if (!isBoolKindMarker(encodedItem.kind)) {
      if (encodedItem.payload.byteLength > 0xffff) {
        throw new Error(
          `Array item at "${path}" is too large for protocol encoding`,
        );
      }

      totalLength += 2 + encodedItem.payload.byteLength;
    }
  }

  const buffer = new Uint8Array(totalLength);
  writeU16(buffer, 0, value.length);

  let offset = 2;
  for (const item of encodedItems) {
    buffer[offset] = item.kind;
    offset += 1;

    if (isBoolKindMarker(item.kind)) {
      continue;
    }

    writeU16(buffer, offset, item.payload.byteLength);
    offset += 2;
    buffer.set(item.payload, offset);
    offset += item.payload.byteLength;
  }

  return buffer;
}

/**
 * Encodes a keyed container payload into protocol key-index/value entries.
 * @param value Object payload to encode.
 * @param path Payload path used in validation errors.
 * @returns Encoded container payload bytes.
 */
function encodeContainerPayload(value: Record<string, unknown>, path: string) {
  const normalizedEntries = new Map<
    string,
    { index: number; value: unknown }
  >();

  for (const [rawKey, rawValue] of Object.entries(value)) {
    const parsedType = parseDataType(rawKey);
    normalizedEntries.set(parsedType.name, {
      index: parsedType.index,
      value: normalizeOutgoingValue(parsedType.name, rawValue),
    });
  }

  const entries = [...normalizedEntries.entries()].sort(
    ([, left], [, right]) => left.index - right.index,
  );

  if (entries.length > 0xffff) {
    throw new Error(
      `Container at "${path}" has too many entries for protocol encoding`,
    );
  }

  const encodedEntries: Array<{ keyIndex: number; value: EncodedDataValue }> =
    [];
  let totalLength = 2;

  for (const [name, entry] of entries) {
    const expectedKind = getExpectedKind(name);
    const pathForEntry = `${path}.${name}`;

    const encodedValue = encodeDataValueForKind(
      expectedKind,
      entry.value,
      pathForEntry,
    );

    if (isBoolKindMarker(encodedValue.kind)) {
      totalLength += 2;
    } else {
      if (encodedValue.payload.byteLength > 0xffff) {
        throw new Error(
          `Container entry "${pathForEntry}" is too large for protocol encoding`,
        );
      }

      totalLength += 4 + encodedValue.payload.byteLength;
    }

    encodedEntries.push({
      keyIndex: entry.index,
      value: encodedValue,
    });
  }

  const buffer = new Uint8Array(totalLength);
  writeU16(buffer, 0, entries.length);

  let offset = 2;
  for (const entry of encodedEntries) {
    buffer[offset] = entry.value.kind;
    offset += 1;

    if (isBoolKindMarker(entry.value.kind)) {
      buffer[offset] = entry.keyIndex;
      offset += 1;
      continue;
    }

    writeU16(buffer, offset, entry.value.payload.byteLength);
    offset += 2;
    buffer[offset] = entry.keyIndex;
    offset += 1;
    buffer.set(entry.value.payload, offset);
    offset += entry.value.payload.byteLength;
  }

  return buffer;
}

/**
 * Decodes a value marker and payload bytes into a JavaScript value.
 * @param marker Protocol value marker.
 * @param payload Encoded payload bytes for the marker.
 * @returns Decoded JavaScript value.
 */
function decodeValuePayload(marker: number, payload: Uint8Array): unknown {
  const reader = new ByteReader(payload);

  switch (marker) {
    case DATA_VALUE_KIND_BOOL_TRUE:
      if (!reader.isAtEnd()) {
        throw new Error("Unexpected payload for boolean true value");
      }

      return true;

    case DATA_VALUE_KIND_BOOL_FALSE:
      if (!reader.isAtEnd()) {
        throw new Error("Unexpected payload for boolean false value");
      }

      return false;

    case DATA_VALUE_KIND_NUMBER:
      if (payload.byteLength !== 8) {
        throw new Error(`Invalid number payload length ${payload.byteLength}`);
      }

      return reader.readI64();

    case DATA_VALUE_KIND_STRING:
      return textDecoder.decode(payload);

    case DATA_VALUE_KIND_ARRAY:
      return decodeArrayPayload(reader);

    case DATA_VALUE_KIND_CONTAINER:
      return decodeContainerPayload(reader);

    case DATA_VALUE_KIND_NULL:
      if (!reader.isAtEnd()) {
        throw new Error("Unexpected payload for null value");
      }

      return null;

    default:
      throw new Error(`Unknown data value marker 0x${marker.toString(16)}`);
  }
}

/**
 * Decodes an encoded array payload from a byte reader.
 * @param reader Byte reader positioned at array payload start.
 * @returns Decoded array values.
 */
function decodeArrayPayload(reader: ByteReader) {
  const itemCount = reader.readU16();
  const values: unknown[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const marker = reader.readU8();

    if (isBoolKindMarker(marker)) {
      values.push(marker === DATA_VALUE_KIND_BOOL_TRUE);
      continue;
    }

    const payloadLength = reader.readU16();
    const payload = reader.readBytes(payloadLength);
    values.push(decodeValuePayload(marker, payload));
  }

  return values;
}

/**
 * Decodes an encoded keyed container payload from a byte reader.
 * @param reader Byte reader positioned at container payload start.
 * @returns Decoded object payload.
 */
function decodeContainerPayload(reader: ByteReader) {
  const entryCount = reader.readU16();
  const value: Record<string, unknown> = {};

  for (let index = 0; index < entryCount; index += 1) {
    const marker = reader.readU8();
    const payloadLength = isBoolKindMarker(marker) ? 0 : reader.readU16();
    const keyIndex = reader.readU8();
    const payload = isBoolKindMarker(marker)
      ? new Uint8Array(0)
      : reader.readBytes(payloadLength);

    const key = getDataTypeNameByIndex(keyIndex);
    if (!key) {
      continue;
    }

    const expectedKind = getExpectedKind(key);
    if (!isMarkerCompatibleWithKey(marker, expectedKind, key)) {
      throw new Error(
        `Unexpected marker 0x${marker.toString(16)} for data type "${key}"`,
      );
    }

    value[key] = normalizeIncomingValue(
      key,
      decodeValuePayload(marker, payload),
    );
  }

  return value;
}

/**
 * Resolves a canonical data key by protocol index.
 * @param index Protocol key index.
 * @returns Canonical protocol data key name.
 */
function getDataTypeNameByIndex(index: number) {
  return DATA_TYPES[index];
}

/**
 * Checks whether a marker represents a boolean payload.
 * @param marker Protocol value marker.
 * @returns True when marker is boolean true or false.
 */
function isBoolKindMarker(marker: number) {
  return (
    marker === DATA_VALUE_KIND_BOOL_TRUE ||
    marker === DATA_VALUE_KIND_BOOL_FALSE
  );
}

/**
 * Validates that a marker is compatible with an expected data kind.
 * @param marker Protocol value marker.
 * @param kind Expected protocol data kind.
 * @returns True when marker matches the expected kind.
 */
function isMarkerCompatibleWithKind(marker: number, kind: DataKind) {
  if (typeof kind === "object") {
    return marker === DATA_VALUE_KIND_ARRAY;
  }

  switch (kind) {
    case "bool":
      return isBoolKindMarker(marker);
    case "number":
      return marker === DATA_VALUE_KIND_NUMBER;
    case "string":
      return marker === DATA_VALUE_KIND_STRING;
    case "container":
      return marker === DATA_VALUE_KIND_CONTAINER;
    case "null":
      return marker === DATA_VALUE_KIND_NULL;
  }
}

/**
 * Validates marker compatibility for a specific key with scalar-array fallback support.
 * @param marker Protocol value marker.
 * @param kind Expected protocol data kind.
 * @param key Canonical protocol key name.
 * @returns True when marker is compatible for the key.
 */
function isMarkerCompatibleWithKey(
  marker: number,
  kind: DataKind,
  key: string,
) {
  if (
    SCALAR_NUMBER_ARRAY_DATA_TYPES.has(key) &&
    marker === DATA_VALUE_KIND_NUMBER
  ) {
    return true;
  }

  return isMarkerCompatibleWithKind(marker, kind);
}

/**
 * Normalizes outbound values for special scalar-array compatibility keys.
 * @param type Canonical protocol key name.
 * @param value Outbound value.
 * @returns Normalized outbound value.
 */
function normalizeOutgoingValue(type: string, value: unknown) {
  if (SCALAR_NUMBER_ARRAY_DATA_TYPES.has(type) && typeof value === "number") {
    return [value];
  }

  return value;
}

/**
 * Normalizes inbound values for scalar-array compatibility keys.
 * @param type Canonical protocol key name.
 * @param value Inbound decoded value.
 * @returns Normalized inbound value.
 */
function normalizeIncomingValue(type: string, value: unknown) {
  if (
    SCALAR_NUMBER_ARRAY_DATA_TYPES.has(type) &&
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "number"
  ) {
    return value[0];
  }

  return value;
}

/**
 * Writes a big-endian unsigned 16-bit integer to a byte buffer.
 * @param buffer Destination byte buffer.
 * @param offset Byte offset to write at.
 * @param value Unsigned 16-bit integer value.
 * @returns Void.
 */
function writeU16(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint16(
    offset,
    value,
    false,
  );
}

/**
 * Writes a big-endian unsigned 32-bit integer to a byte buffer.
 * @param buffer Destination byte buffer.
 * @param offset Byte offset to write at.
 * @param value Unsigned 32-bit integer value.
 * @returns Void.
 */
function writeU32(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setUint32(
    offset,
    value,
    false,
  );
}

/**
 * Writes a big-endian signed 64-bit integer to a byte buffer.
 * @param buffer Destination byte buffer.
 * @param offset Byte offset to write at.
 * @param value Signed integer value.
 * @returns Void.
 */
function writeI64(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setBigInt64(
    offset,
    BigInt(value),
    false,
  );
}

/**
 * Provides sequential big-endian reads over protocol byte buffers.
 */
class ByteReader {
  private readonly view: DataView;

  private offset = 0;

  private readonly bytes: Uint8Array;

  /**
   * Creates a byte reader over an immutable Uint8Array view.
   * @param bytes Source bytes to read from.
   */
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  /**
   * Reads one unsigned byte.
   * @returns Unsigned 8-bit integer.
   */
  readU8() {
    this.ensureAvailable(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Reads two bytes as big-endian unsigned 16-bit integer.
   * @returns Unsigned 16-bit integer.
   */
  readU16() {
    this.ensureAvailable(2);
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  /**
   * Reads four bytes as big-endian unsigned 32-bit integer.
   * @returns Unsigned 32-bit integer.
   */
  readU32() {
    this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  /**
   * Reads eight bytes as big-endian signed 64-bit integer.
   * @returns Safe integer representation of the decoded value.
   */
  readI64() {
    this.ensureAvailable(8);
    const value = this.view.getBigInt64(this.offset, false);
    this.offset += 8;

    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) {
      throw new Error(
        `Decoded number ${value.toString()} exceeds JS safe integer range`,
      );
    }

    return numberValue;
  }

  /**
   * Reads six bytes as a big-endian unsigned 48-bit integer.
   * @returns Unsigned 48-bit integer represented as number.
   */
  readU48() {
    this.ensureAvailable(6);
    const upper = this.view.getUint16(this.offset, false);
    const lower = this.view.getUint32(this.offset + 2, false);
    this.offset += 6;
    return upper * 2 ** 32 + lower;
  }

  /**
   * Reads a byte slice of the requested length.
   * @param length Number of bytes to read.
   * @returns View over the requested bytes.
   */
  readBytes(length: number) {
    this.ensureAvailable(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  /**
   * Indicates whether all bytes have been consumed.
   * @returns True when reader offset is at buffer end.
   */
  isAtEnd() {
    return this.offset === this.bytes.byteLength;
  }

  /**
   * Ensures that at least a specific number of bytes can still be read.
   * @param length Required available byte count.
   * @returns Void.
   */
  private ensureAvailable(length: number) {
    if (this.offset + length > this.bytes.byteLength) {
      throw new Error("Unexpected end of protocol buffer");
    }
  }
}
