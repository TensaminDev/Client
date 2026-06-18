import { Button, cn } from "@tensamin/ui";
import { useStorage } from "@tensamin/storage/context";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

export default function MediaSaveButton({
  ariaLabel,
  defaultSaved = false,
  onSavedMediaChange,
  url,
}: {
  ariaLabel?: string;
  defaultSaved?: boolean;
  onSavedMediaChange?: (savedMedia: string[]) => void;
  url: string;
}) {
  const { load, save } = useStorage();
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
      aria-label={ariaLabel ?? (isSaved ? "Unsave media" : "Save media")}
      className="h-full w-full rounded-sm border-0! p-0 absolute right-1 top-1 z-10 h-9 w-9 -translate-y-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 bg-card"
      onClick={handleClick}
    >
      <Save
        className={cn(
          "size-4.5 stroke-1.5!",
          isSaved && "fill-(--primary) stroke-(--primary-foreground-alt)",
        )}
      />
    </Button>
  );
}
