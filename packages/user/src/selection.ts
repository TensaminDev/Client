import type { User, UserField, UserFields, SelectedUser } from "./context";

const USER_FIELD_MAP = {
  About: true,
  Avatar: true,
  Display: true,
  IotaId: true,
  OmikronConnections: true,
  OmikronId: true,
  OnlineStatus: true,
  PublicKey: true,
  Status: true,
  SubEnd: true,
  SubLevel: true,
  UserId: true,
  Username: true,
} satisfies Record<UserField, true>;

const USER_FIELDS = Object.keys(USER_FIELD_MAP) as UserField[];

export function selectUserFields<const Fields extends UserFields>(
  user: User,
  fields: Fields,
): SelectedUser<Fields> {
  return Object.fromEntries(
    fields.map((field) => [field, user[field]]),
  ) as SelectedUser<Fields>;
}

export function getChangedUserFields(
  previous: User | undefined,
  next: User | undefined,
): UserField[] {
  if ((previous === undefined) !== (next === undefined)) {
    return [...USER_FIELDS];
  }
  return USER_FIELDS.filter(
    (field) => !Object.is(previous?.[field], next?.[field]),
  );
}
