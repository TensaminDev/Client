import { Button } from "@tensamin/ui";
import { useCall } from "../../context";
import { HeadphoneOff, Headphones } from "lucide-react";

export default function DeafButton({ className }: { className?: string }) {
  const { toggleDeaf, deaf } = useCall();

  return (
    <Button
      variant={deaf ? "destructive" : "default"}
      onClick={toggleDeaf}
      className={className}
    >
      {deaf ? <HeadphoneOff /> : <Headphones />}
    </Button>
  );
}
