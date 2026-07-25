import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Button, ClearStorageButton, cn, useIsMobile } from "@methanium/ui";

import { settingsNavigation } from "./manifest";

export default function SettingsLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();

  return (
    <div className="flex h-full w-full">
      {!isMobile && <SettingsSidebar />}
      <div className="bg-background w-full h-full p-3 flex flex-col gap-3">
        <h1 className="text-xl font-semibold">
          {location.pathname
            .split("/")
            .pop()
            ?.replace(/-/g, " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase())}
        </h1>
        <Outlet />
      </div>
    </div>
  );
}

export function SettingsSidebar() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const categories = [...new Set(settingsNavigation.map((page) => page.category))];

  return (
    <div
      className={cn(
        isMobile ? "w-full p-1" : "p-3 rounded-tl-2xl border-r bg-input/15 w-50",
        "flex flex-col gap-6",
      )}
    >
      {categories.map((category) => (
        <div key={category} className="flex flex-col gap-2">
          <h2 className="font-bold text-xs uppercase">{category}</h2>
          {settingsNavigation
            .filter((page) => page.category === category)
            .map((page) => (
              <Button
                key={page.path}
                className="w-full"
                variant="outline"
                onClick={() => navigate({ to: `/settings/${page.path}` })}
              >
                {page.label}
              </Button>
            ))}
        </div>
      ))}
      <div className="mt-auto">
        <ClearStorageButton className="w-full" />
      </div>
    </div>
  );
}
