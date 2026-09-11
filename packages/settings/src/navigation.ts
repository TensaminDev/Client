export const settingsNavigation = [
  {
    category: "account",
    path: "profile",
    label: "Profile",
  },
  {
    category: "account",
    path: "security",
    label: "Security",
  },
  { category: "general", path: "chat", label: "Chat" },
  { category: "general", path: "call", label: "Call" },
  { category: "application", path: "cache", label: "Cache" },
  { category: "application", path: "theme", label: "Theme" },
  {
    category: "application",
    path: "accessibility",
    label: "Accessibility",
  },
  {
    category: "application",
    path: "hotkeys",
    label: "Hotkeys",
  },
  ...(Number(localStorage.getItem("log_level")) >= 1000
    ? ([
        {
          category: "application",
          path: "developer",
          label: "Developer",
        },
      ] as const)
    : []),
  {
    category: "application",
    path: "legal",
    label: "Legal",
  },
] as const;
