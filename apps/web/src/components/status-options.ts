export const onlineStatusOptions = [
  { label: "Online", value: "user_online" },
  { label: "Idle", value: "user_idle" },
  { label: "Do not disturb", value: "user_dnd" },
  { label: "On the toilet", value: "user_wc" },
  { label: "Offline", value: "user_invisible" },
] as const;

export type OnlineStatus = (typeof onlineStatusOptions)[number]["value"];

export const onlineStatusLabels = Object.fromEntries(
  onlineStatusOptions.map((option) => [option.value, option.label]),
) as Record<OnlineStatus, string>;
