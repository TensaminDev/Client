import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Button, useIsMobile } from "@methanium/ui";
import { ArrowLeft } from "lucide-react";

import { SettingsSidebar } from "./sidebar";
import { useSettingsProfiles } from "./profiles";

export default function SettingsLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProfile } = useSettingsProfiles();
  const isSettingsRoot = /^\/settings\/?$/.test(location.pathname);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <SettingsSidebar className="hidden md:flex" />
        <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button
                className="h-8 w-8 shrink-0 p-0"
                variant="ghost"
                onClick={() =>
                  void navigate({ to: isSettingsRoot ? "/" : "/settings" })
                }
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
            className="flex flex-col h-full"
            key={activeProfile?.id ?? "local"}
          >
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
