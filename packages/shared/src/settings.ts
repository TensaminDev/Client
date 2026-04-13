type StringKeyOf<T> = Extract<keyof T, string>;

type SettingDefinition = {
  display: string;
  type: string;
  default?: unknown;
};

export type SettingsSchema = Record<
  string,
  Record<string, Record<string, SettingDefinition>>
>;

const settings = {
  account: {
    security: {
      login_qr_code: {
        display: "Login QR Code",
        type: "custom",
      },
    },
  },
  accessability: {
    chat: {
      reverse_enter_behavior: {
        display: "Reverse Enter Behavior",
        type: "boolean",
        default: false,
      },
    },
  },
} as const satisfies SettingsSchema;

export default settings;

type BooleanSettingNames<T extends SettingsSchema> = {
  [C in StringKeyOf<T>]: {
    [P in StringKeyOf<T[C]>]: {
      [S in StringKeyOf<T[C][P]>]: T[C][P][S] extends {
        type: "boolean";
        default: boolean;
      }
        ? S
        : never;
    }[StringKeyOf<T[C][P]>];
  }[StringKeyOf<T[C]>];
}[StringKeyOf<T>];

export type SettingsStorageKey<T extends SettingsSchema = typeof settings> =
  `settings.${BooleanSettingNames<T>}`;

export type SettingsStorageDefaults<
  T extends SettingsSchema = typeof settings,
> = {
  [K in SettingsStorageKey<T>]: boolean;
};

function buildSettingsStorageDefaults<T extends SettingsSchema>(
  schema: T,
): SettingsStorageDefaults<T> {
  const defaults: Partial<SettingsStorageDefaults<T>> = {};

  for (const category of Object.values(schema)) {
    for (const page of Object.values(category)) {
      for (const [settingName, setting] of Object.entries(page)) {
        if (
          setting.type === "boolean" &&
          typeof setting.default === "boolean"
        ) {
          const key = `settings.${settingName}` as SettingsStorageKey<T>;
          defaults[key] = setting.default;
        }
      }
    }
  }

  return defaults as SettingsStorageDefaults<T>;
}

export const settingsStorageDefaults = buildSettingsStorageDefaults(settings);
