const APPLICATION_TO_WIRE_FIELDS = {
  Content: "AppContent",
  CreatedAt: "AppCreatedAt",
  MessageId: "AppMessageId",
} as const;

const WIRE_TO_APPLICATION_FIELDS = {
  AppContent: "Content",
  AppCreatedAt: "CreatedAt",
  AppMessageId: "MessageId",
} as const;

function mapProtocolFields(
  value: unknown,
  fieldMap: Readonly<Record<string, string>>,
): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapProtocolFields(item, fieldMap));
  }

  const source = value as Record<string, unknown>;
  const target: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(source)) {
    const mappedKey = fieldMap[key] ?? key;

    if (mappedKey in target) {
      throw new Error(`MTP field translation collision for ${mappedKey}`);
    }

    target[mappedKey] = mapProtocolFields(child, fieldMap);
  }

  return target;
}

export function toWireData(value: unknown): unknown {
  return mapProtocolFields(value, APPLICATION_TO_WIRE_FIELDS);
}

export function fromWireData(value: unknown): unknown {
  return mapProtocolFields(value, WIRE_TO_APPLICATION_FIELDS);
}

export function fromWireMessage<T extends { data: unknown }>(message: T): T {
  return {
    ...message,
    data: fromWireData(message.data),
  };
}
