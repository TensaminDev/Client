import { Button } from "@tensamin/ui";

import options from "@tensamin/shared/settings";
import { cn, useIsMobile } from "@tensamin/ui";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";

export default function Screen() {
  const isMobile = useIsMobile();
  const location = useLocation();

  return (
    <div className="flex h-full w-full">
      {!isMobile && <SettingsSidebar />}

      {/* Page */}
      <div className="bg-background w-full h-full p-3 flex flex-col gap-3">
        <h1 className="text-xl font-semibold">
          {location.pathname
            .split("/")
            .pop()
            ?.replace(/-/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase())}
        </h1>
        <Outlet />
      </div>
    </div>
  );
}

export function SettingsSidebar() {
  const settingsOptions = options as Record<
    string,
    Record<string, Record<string, unknown>>
  >;

  const isMobile = useIsMobile();
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        isMobile
          ? "w-full p-1"
          : "p-3 rounded-tl-2xl border-r bg-input/15 w-50",
        "flex flex-col gap-6",
      )}
    >
      {/* Settings */}
      {Object.keys(settingsOptions).map((category) => (
        // Category
        <div key={category} className="flex flex-col gap-2">
          <h2 className="font-bold text-xs uppercase">{category}</h2>
          {Object.keys(settingsOptions[category]).map((page) => (
            // Page
            <div key={page}>
              <Button
                className="w-full"
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/settings/" + page.toLowerCase(),
                  })
                }
              >
                {(page as string).charAt(0).toUpperCase() +
                  (page as string).slice(1)}
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
