import { Button, cn, useIsMobile } from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

export default function MediaSaveButton({
  ariaLabel,
  className,
  defaultSaved = false,
  onSavedMediaChange,
  url,
}: {
  ariaLabel?: string;
  className?: string;
  defaultSaved?: boolean;
  onSavedMediaChange?: (savedMedia: string[]) => void;
  url: string;
}) {
  const { load, save } = useStorage();
  const isMobile = useIsMobile();
  const [savedMedia, setSavedMedia] = useState<string[] | null>(null);
  const isSaved = savedMedia ? savedMedia.includes(url) : defaultSaved;

  useEffect(() => {
    void load("chat_picker_saved_media").then(setSavedMedia);
  }, [load]);

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    const currentSavedMedia =
      savedMedia ?? (await load("chat_picker_saved_media"));
    const nextSavedMedia = currentSavedMedia.includes(url)
      ? currentSavedMedia.filter((item) => item !== url)
      : [url, ...currentSavedMedia];

    setSavedMedia(nextSavedMedia);
    onSavedMediaChange?.(nextSavedMedia);
    void save("chat_picker_saved_media", nextSavedMedia);
  }

  return (
    <Button
      variant="secondary"
      aria-label={ariaLabel ?? (isSaved ? "Unsave media" : "Save media")}
      className={cn(
        "rounded-sm border-0! p-0 absolute right-1 top-1 z-10 h-9 w-9 transition-all",
        !isMobile &&
          "-translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
        className,
      )}
      onClick={handleClick}
    >
      <Star
        color="var(--primary-foreground-alt)"
        className={cn(
          "size-4.5 stroke-1.5!",
          isSaved ? "fill-(--primary)" : "",
        )}
      />
    </Button>
  );
}
