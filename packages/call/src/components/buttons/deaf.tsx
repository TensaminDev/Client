import { Button } from "@tensamin/ui";
import { toggleDeaf, useCall } from "../../store";
import { HeadphoneOff, Headphones } from "lucide-react";

export default function DeafButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const deaf = useCall((state) => state.deaf);

  return (
    <Button
      variant={deaf ? "destructive" : "default"}
      onClick={toggleDeaf}
      className={className}
    >
      {deaf ? (
        <HeadphoneOff
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
      ) : (
        <Headphones
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
      )}
    </Button>
  );
}
