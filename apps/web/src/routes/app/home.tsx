import Communications, {
  AddConversationButton,
} from "@/components/communications";
import { Button, useIsMobile } from "@methanium/ui";

export default function Page() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-3 pt-3">
        <Communications />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col gap-3 px-3 pt-3">
      <div className="flex gap-2">
        <AddConversationButton />
        <Button disabled>Add Community</Button>
      </div>
    </div>
  );
}
