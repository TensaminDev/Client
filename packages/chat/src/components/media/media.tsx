import { Text } from "@methanium/ui/markdown";
import { useStorage } from "@tensamin/storage/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@methanium/ui";
import { toast } from "@tensamin/shared/log";
import {
  Check,
  Copy,
  ExternalLink,
  TriangleAlert,
  X,
  ZoomIn,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef, type WheelEvent } from "react";
import MediaSaveButton from "./mediaSaveButton";
import { useUserFields } from "@tensamin/identity/context";

const zoomLevels = [1, 1.5, 2, 3];

export default function Media({
  link,
  senderId,
  time,
}: {
  link: string;
  senderId: number;
  time: string;
}) {
  const { load } = useStorage();

  const [trustedDomains, setTrustedDomains] = useState<string[]>([]);
  const [hidden, setHidden] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const wheelDelta = useRef(0);
  const hostname = useMemo(() => new URL(link).hostname, [link]);

  const { data: user } = useUserFields(senderId, ["Avatar", "Display"]);
  const avatar = user?.Avatar
    ? `data:image/webp;base64,${user.Avatar}`
    : undefined;

  useEffect(() => {
    load("chat_trusted_domains").then(setTrustedDomains);
  }, [load]);

  const changeZoom = (change: number) => {
    setZoomLevel((level) =>
      Math.max(0, Math.min(zoomLevels.length - 1, level + change)),
    );
  };

  const handleWheel = (event: WheelEvent) => {
    wheelDelta.current += event.deltaY;

    if (Math.abs(wheelDelta.current) < 50) return;

    changeZoom(wheelDelta.current < 0 ? 1 : -1);
    wheelDelta.current = 0;
  };

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;

    if (copied) {
      setTimeout(() => {
        if (cancelled) return;
        setCopied(false);
      }, 1000);
    }

    return () => {
      cancelled = true;
    };
  }, [copied]);
  const copyImage = async () => {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard access is not supported.");
      }

      const image = (async () => {
        const response = await fetch(link);
        if (!response.ok) {
          throw new Error(`Failed to download image (${response.status}).`);
        }

        const blob = await response.blob();
        if (blob.type === "image/png") return blob;

        const bitmap = await createImageBitmap(blob);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Failed to prepare the image for copying.");
          }

          context.drawImage(bitmap, 0, 0);
          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (convertedBlob) =>
                convertedBlob
                  ? resolve(convertedBlob)
                  : reject(new Error("Failed to convert the image to PNG.")),
              "image/png",
            );
          });
        } finally {
          bitmap.close();
        }
      })();

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": image }),
      ]);
      setCopied(true);
    } catch (error) {
      toast("error", "Failed to copy image", String(error));
    }
  };

  return trustedDomains.includes(hostname) ? (
    <div className="group relative inline-block">
      {hidden ? (
        <Text value={link} />
      ) : (
        <MediaSaveButton className="top-2" url={link} />
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setZoomLevel(0);
            wheelDelta.current = 0;
          }
        }}
      >
        <DialogTrigger
          render={({ onClick }) => (
            <img
              onClick={onClick}
              src={link}
              hidden={hidden}
              onLoad={() => setHidden(false)}
              className="max-h-70 max-w-70 py-1 rounded-lg cursor-pointer"
            />
          )}
        />
        <DialogContent
          showCloseButton={false}
          onWheel={handleWheel}
          className="inset-0! h-dvh! w-screen! max-h-none! max-w-none! translate-none! overflow-hidden! rounded-none! border-0! bg-black/50 p-0!"
        >
          <div className="pointer-events-none relative z-10 flex h-full w-full items-start justify-between pt-[max(1.75rem,var(--ui-safe-area-top))] pr-[max(1.75rem,var(--ui-safe-area-right))] pb-[max(1.75rem,var(--ui-safe-area-bottom))] pl-[max(1.75rem,var(--ui-safe-area-left))]">
            <div
              className={`flex gap-2 items-center transition-opacity duration-200 ${zoomLevel === 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}
              inert={zoomLevel !== 0}
            >
              <Avatar className="size-10">
                <AvatarImage src={avatar} />
                <AvatarFallback className="text-lg">
                  {user?.Display.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <p className="text-lg font-semibold">{user?.Display}</p>
                <p className="text-sm text-muted-foreground">{time}</p>
              </div>
            </div>
            <div className="flex gap-3 pointer-events-auto">
              <div
                className={`flex ${zoomLevel === 0 ? "gap-1" : ""} bg-card rounded-lg p-1`}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={({ ref }) => (
                      <Button
                        ref={ref}
                        onClick={() =>
                          setZoomLevel(
                            (level) => (level + 1) % zoomLevels.length,
                          )
                        }
                        aria-label={`Zoom ${zoomLevel + 1}/4`}
                        className="w-9! h-9!"
                        variant="ghost"
                      >
                        <ZoomIn />
                      </Button>
                    )}
                  />
                  <TooltipContent>Zoom {zoomLevel + 1}/4</TooltipContent>
                </Tooltip>
                <div
                  className={`flex overflow-hidden transition-[width,opacity] duration-200 ${zoomLevel === 0 ? "w-18 opacity-100" : "pointer-events-none w-0 opacity-0"}`}
                  inert={zoomLevel !== 0}
                >
                  <Tooltip>
                    <TooltipTrigger
                      render={({ ref }) => (
                        <Button
                          ref={ref}
                          onClick={copyImage}
                          aria-label="Copy image"
                          className="w-9! h-9!"
                          variant="ghost"
                        >
                          {copied ? <Check /> : <Copy />}
                        </Button>
                      )}
                    />
                    <TooltipContent>
                      {copied ? "Copied!" : "Copy image"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={({ ref }) => (
                        <a
                          ref={ref}
                          href={link}
                          target="_blank"
                          className="w-9! h-9!"
                        >
                          <Button className="w-9! h-9!" variant="ghost">
                            <ExternalLink />
                          </Button>
                        </a>
                      )}
                    />
                    <TooltipContent>Open in browser</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="flex bg-card rounded-lg p-1">
                <DialogClose
                  render={({ onClick }) => (
                    <Tooltip>
                      <TooltipTrigger
                        render={({ ref }) => (
                          <Button
                            ref={ref}
                            onClick={onClick}
                            className="w-9! h-9!"
                            variant="ghost"
                          >
                            <X />
                          </Button>
                        )}
                      />
                      <TooltipContent>Close</TooltipContent>
                    </Tooltip>
                  )}
                />
              </div>
            </div>
          </div>
          <img
            src={link}
            hidden={hidden}
            onLoad={() => setHidden(false)}
            style={{
              transform: `translate(-50%, -50%) scale(${zoomLevels[zoomLevel]})`,
            }}
            className="h-[80vh] rounded-lg object-cover absolute top-1/2 left-1/2 transition-transform duration-200"
          />
        </DialogContent>
      </Dialog>
    </div>
  ) : (
    <div className="flex gap-1 items-center">
      <Tooltip>
        <TooltipTrigger
          render={<TriangleAlert className="size-4 stroke-yellow-400" />}
        />
        <TooltipContent>
          Link embeds can get your IP-Address! You can configure trusted domains
          in the settings.
        </TooltipContent>
      </Tooltip>
      <Text value={link} />
    </div>
  );
}
