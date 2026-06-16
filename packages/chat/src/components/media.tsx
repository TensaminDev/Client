import Text from "@tensamin/markdown/text";
import { useStorage } from "@tensamin/storage/context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tensamin/ui";
import { TriangleAlert } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import MediaSaveButton from "./mediaSaveButton";

export default function Media({ link }: { link: string }) {
  const { load } = useStorage();

  const [trustedDomains, setTrustedDomains] = useState<string[]>([]);
  const [hidden, setHidden] = useState(true);
  const hostname = useMemo(() => new URL(link).hostname, [link]);

  useEffect(() => {
    load("chat_trusted_domains").then(setTrustedDomains);
  }, [load]);

  return trustedDomains.includes(hostname) ? (
    <div className="group relative inline-block">
      {hidden ? (
        <Text value={link} />
      ) : (
        <MediaSaveButton className="top-2" url={link} />
      )}
      <img
        src={link}
        hidden={hidden}
        onLoad={() => setHidden(false)}
        className="max-h-70 max-w-70 py-1 rounded-lg"
      />
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
