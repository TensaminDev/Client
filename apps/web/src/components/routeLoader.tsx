import { Loader2 } from "lucide-react";

export default function RouteLoader() {
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Loading...</span>
      </div>
    </div>
  );
}
