import { Outlet, useLocation } from "@tanstack/react-router";
import { Button, useIsMobile } from "@methanium/ui";
import { ArrowLeft } from "lucide-react";

import { SettingsSidebar } from "./sidebar";

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
