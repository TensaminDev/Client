import { useCrypto } from "@tensamin/crypto/context";
import * as React from "react";
import { useChat } from "../context";
import type { RawMessage } from "../values";
import { log } from "@tensamin/shared/log";
import Text from "@tensamin/markdown/text";
import { AlertTriangle, Clock } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import { useIsMobile } from "@tensamin/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@tensamin/ui";

function generateFixedLoadingSize(size: number, height: number) {
  return size * 3 - (height / 20) * 11;
}

function getSafeMessageHeight(height: number | undefined) {
  if (typeof height === "number" && Number.isFinite(height) && height > 0) {
    return Math.ceil(height);
  }

  return 40;
}

/**
 * Executes Message.
 * @param props Parameter props.
 * @returns unknown.
 */
function MessageComponent({ message, notEncrypted, measureRef }: {
  message: RawMessage & {
    failed?: boolean;
  };
  notEncrypted?: boolean;
  measureRef?: React.Ref<HTMLDivElement>;
}) {
  const { sharedSecret } = useChat();
  const { decrypt } = useCrypto();

  const isMobile = useIsMobile();

  const [decodedContent, setDecodedContent] = React.useState("");
  const [isReady, setIsReady] = React.useState(false);
  const safeMessageHeight = getSafeMessageHeight(message.height);

  React.useEffect(() => {
    if (notEncrypted) {
      setDecodedContent(message.content);
      setIsReady(true);
      return;
    }

    const content = message.content;
    const secret = sharedSecret;
    let active = true;

    if (!secret) {
      setIsReady(false);
      return;
    }

    decrypt(secret, content)
      .then((value) => {
        if (!active) {
          return;
        }

        setDecodedContent(value);
        setIsReady(true);
      })
      .catch((e) => {
        if (!active) {
          return;
        }

        log(0, "Chat", "red", "Failed to decrypt message", e, {
          content,
          secret,
        });

        setDecodedContent("Failed to decrypt");
        setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, [decrypt, message.content, notEncrypted, sharedSecret]);

  return (
    <div
      ref={measureRef}
      className={`w-full flex justify-start transition-opacity duration-150 ${(message.failed || message.message_state === "awaiting") && "opacity-50"}`}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={`selection-foreground flex gap-1 items-center justify-center max-w-[80%] rounded-lg px-2 py-px whitespace-pre-wrap break-all ${
                message.sent_by_self
                  ? message.failed
                    ? "bg-destructive/75 text-destructive-foreground"
                    : "bg-primary text-primary-foreground"
                  : "bg-muted"
              } ${!isReady && "animate-pulse"} ${isMobile && "select-none"}`}
            >
              {message.failed &&
                message.message_state === "awaiting" && (
                  <Tooltip>
                    <TooltipContent>
                      <p>Failed to send message</p>
                    </TooltipContent>
                    <TooltipTrigger render={<AlertTriangle size={17} />} />
                  </Tooltip>
                )}
              {!message.failed &&
                message.message_state === "awaiting" && (
                  <Clock size={17} />
                )}
              {isReady ? (
                <Text value={decodedContent} />
              ) : (
                <div
                  className="block rounded-sm"
                  style={{
                    width: generateFixedLoadingSize(
                      message.content.length,
                      safeMessageHeight,
                    ),
                    minHeight: safeMessageHeight,
                  }}
                />
              )}
            </div>
          }
        />
        <ContextMenuContent>
          <ContextMenuItem>
            <Text value={decodedContent} />
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

export default React.memo(MessageComponent, (prev, next) => {
  return (
    prev.notEncrypted === next.notEncrypted &&
    prev.measureRef === next.measureRef &&
    prev.message.send_time === next.message.send_time &&
    prev.message.content === next.message.content &&
    prev.message.height === next.message.height &&
    prev.message.sent_by_self === next.message.sent_by_self &&
    prev.message.message_state === next.message.message_state &&
    prev.message.failed === next.message.failed
  );
});
