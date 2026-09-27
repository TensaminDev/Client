import Communications, {
  AddConversationButton,
} from "@/components/communications";
import { Button, useIsMobile } from "@methanium/ui";
import { useNavbar } from "@tensamin/shared/navbar";

export default function Page() {
  const isMobile = useIsMobile();
  const { render } = useNavbar();

  if (isMobile) {
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-3 pt-3">
        <Communications />
      </div>
    );
  }

  return (
    <>
      {render(
        <div className="flex translate-y-[3.5px] gap-2 [&>div]:w-auto">
          <AddConversationButton />
          <Button disabled>Add Community</Button>
        </div>,
      )}
      <div className="relative flex h-full flex-col gap-3 px-3 pt-3" />
    </>
  );
}
