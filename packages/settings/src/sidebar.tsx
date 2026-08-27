import { Button, ClearStorageButton, cn } from "@methanium/ui";
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

  return (
    <div
      className={cn(
        mobile ? "w-full p-1" : "p-3 rounded-tl-2xl border-r bg-input/15 w-50",
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
