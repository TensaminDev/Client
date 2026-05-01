import * as React from "react";
import type { RawMessage } from "../values";
import Text from "@tensamin/markdown/text";
import { AlertTriangle, Clock } from "lucide-react";

import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";
import { useIsMobile } from "@tensamin/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tensamin/ui";

function MessageComponent({
  message,
}: {
  message: RawMessage & {
    failed?: boolean;
  };
}) {
  const isMobile = useIsMobile();
  const actuallyFailed = message.failed && message.message_state === "awaiting";

  return (
    <div
      className={`w-full flex justify-start transition-opacity duration-150 ${actuallyFailed || message.message_state === "awaiting" ? "opacity-50" : ""}`}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                "selection-foreground flex gap-1 items-center justify-center max-w-[80%] rounded-lg px-2 py-px whitespace-pre-wrap break-all",
                {
                  "bg-(--destructive)/75 text-destructive-foreground":
                    actuallyFailed,
                  "bg-primary text-primary-foreground":
                    !actuallyFailed && message.sent_by_self,
                  "bg-muted": !message.sent_by_self,
                  "select-none": isMobile,
                },
              )}
            >
              {message.failed && message.message_state === "awaiting" && (
                <Tooltip>
                  <TooltipContent>
                    <p>Failed to send message</p>
                  </TooltipContent>
                  <TooltipTrigger render={<AlertTriangle size={17} />} />
                </Tooltip>
              )}
              {!message.failed && message.message_state === "awaiting" && (
                <Clock size={17} />
              )}
              <Text value={message.content} />
            </div>
          }
        />
        <ContextMenuContent>
          <ContextMenuItem>
            <Text value={message.content} />
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

export default React.memo(MessageComponent, (prev, next) => {
  return (
    prev.message.send_time === next.message.send_time &&
    prev.message.content === next.message.content &&
    prev.message.height === next.message.height &&
    prev.message.sent_by_self === next.message.sent_by_self &&
    prev.message.message_state === next.message.message_state &&
    prev.message.failed === next.message.failed
  );
});
