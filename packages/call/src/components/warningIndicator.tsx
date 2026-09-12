import { Tooltip, TooltipContent, TooltipTrigger } from "@methanium/ui";
import { AlertTriangle } from "lucide-react";

export default function WarningIndicator({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={<AlertTriangle fill="orange" stroke="var(--background)" />}
      />
      <TooltipContent>
        {warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
