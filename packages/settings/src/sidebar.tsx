import { Button, ClearStorageButton, cn, useIsMobile } from "@methanium/ui";
import { useNavigate } from "@tanstack/react-router";

import { settingsNavigation } from "./navigation";

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

  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        mobile
          ? "w-full p-1"
          : "h-full min-h-0 w-auto shrink-0 overflow-y-auto rounded-tl-2xl border-r border-(--border)/40 bg-input/15 p-3",
        "flex flex-col gap-6",
        className,
      )}
    >
      {categories.map((category) => (
        <div key={category} className="flex flex-col gap-2">
          <h2 className="font-medium text-sm">
            {category.at(0)?.toUpperCase() + category.slice(1)}
          </h2>
          {settingsNavigation
            .filter((page) => page.category === category)
            .map((page) => (
              <Button
                key={page.path}
                className="w-full px-4!"
                variant="outline"
                onClick={() => navigate({ to: `/settings/${page.path}` })}
              >
                {page.label}
              </Button>
            ))}
        </div>
      ))}
      <div hidden={!isMobile}>
        <ClearStorageButton className="w-full" />
      </div>
    </div>
  );
}
