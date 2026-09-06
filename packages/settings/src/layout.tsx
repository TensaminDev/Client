import { Outlet, useLocation } from "@tanstack/react-router";
import { Button, useIsMobile } from "@methanium/ui";
import { ArrowLeft } from "lucide-react";

import { SettingsSidebar } from "./sidebar";
import { SettingsProfileMenu } from "./profileMenu";
import { useSettingsProfiles } from "./profiles";

export default function SettingsLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { activeProfile } = useSettingsProfiles();

  return (
    <div className="flex h-full w-full flex-col">
      <div className="w-full p-2">
        <SettingsProfileMenu />
      </div>
      <div className="flex h-full w-full border-t">
        <SettingsSidebar className="hidden md:flex" />
        <div className="bg-background flex h-full w-full flex-col gap-3 overflow-y-auto p-3">
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
          <div
            className="flex min-h-0 flex-1 flex-col"
            key={activeProfile?.id ?? "local"}
          >
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
