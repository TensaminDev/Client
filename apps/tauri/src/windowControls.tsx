import { Maximize, Minus, X } from "lucide-react";
import { Button, buttonVariants } from "@tensamin/ui/cmp/button";

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn, useIsMobile } from "@tensamin/ui/utils";
import { Card } from "@tensamin/ui/cmp/card";

export default function Controls({
  className,
  notPresentClassName,
}: {
  className?: string;
  notPresentClassName?: string;
}) {
  const isMobile = useIsMobile();
  if (!isTauri() || isMobile) return <div className={notPresentClassName} />;

  const currentWindow = getCurrentWindow();

  return (
    <Card
      className={cn(
        "flex flex-row py-0 px-0 p-0.5 gap-0 rounded-lg",
        className,
      )}
    >
      <>
        <Button
          variant="ghost"
          className="w-9 h-9 aspect-square rounded-lg"
          onClick={() => currentWindow.minimize()}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          className="w-9 h-9 aspect-square rounded-lg"
          onClick={() => currentWindow.toggleMaximize()}
        >
          <Maximize />
        </Button>
        <Button
          variant="ghost"
          className="w-9 h-9 aspect-square rounded-lg"
          onClick={() => currentWindow.close()}
        >
          <X />
        </Button>
      </>
    </Card>
  );
}
