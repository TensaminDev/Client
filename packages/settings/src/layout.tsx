import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Button, ClearStorageButton, cn, useIsMobile } from "@methanium/ui";
import { ArrowLeft } from "lucide-react";

import { settingsNavigation } from "./manifest";

export default function SettingsLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();

  return (
    <div className="flex h-full min-h-0 w-full">
      <SettingsSidebar className="hidden md:flex" />
      <div className="bg-background flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          {isMobile && !/^\/settings\/?$/.test(location.pathname) && (
            <Button
              aria-label="Go back"
              className="h-8 w-8 shrink-0 p-0"
              variant="ghost"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-xl font-semibold">
            {location.pathname
              .split("/")
              .pop()
              ?.replace(/-/g, " ")
              .replace(/\b\w/g, (letter) => letter.toUpperCase())}
          </h1>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

export function SettingsSidebar({
  mobile = false,
  className,
}: {
  mobile?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const categories = [
    ...new Set(settingsNavigation.map((page) => page.category)),
  ];

  return (
    <div
      className={cn(
        mobile
          ? "w-full p-1"
          : "p-3 rounded-tl-2xl border-r bg-input/15 w-50",
        "flex flex-col gap-6",
        className,
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
