import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  useIsMobile,
} from "@tensamin/ui";
import { Pin, Clipboard, Pen, Reply, Forward, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

type MenuComponents = {
  Content: (props: { className?: string; children: ReactNode }) => ReactElement;
  Group: (props: { children: ReactNode }) => ReactElement;
  Item: (props: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void | Promise<void>;
    variant?: "default" | "destructive";
  }) => ReactElement;
  Separator: (props: { className?: string }) => ReactElement;
  Sub: (props: { children: ReactNode }) => ReactElement;
  SubTrigger: (props: {
    children: ReactNode;
    onClick?: () => void | Promise<void>;
  }) => ReactElement;
  SubContent: (props: { children: ReactNode }) => ReactElement;
};

const desktopMenuComponents: MenuComponents = {
  Content: ContextMenuContent,
  Group: ContextMenuGroup,
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

function getMobileMenuComponents(onClose: () => void): MenuComponents {
  return {
    Content: ({ className, children }) => (
      <DrawerContent>
        <div className={cn("p-3!", className)}>{children}</div>
      </DrawerContent>
    ),
    Group: ({ children }) => <div>{children}</div>,
    Item: ({ children, className, disabled, onClick, variant = "default" }) => {
      async function handleClick() {
        await onClick?.();
        onClose();
      }

      return (
        <button
          type="button"
          disabled={disabled}
          data-variant={variant}
          className={cn(
            "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-2 text-left text-sm outline-hidden select-none data-[variant=destructive]:text-destructive disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
            className,
          )}
          onClick={handleClick}
        >
          {children}
        </button>
      );
    },
    Separator: ({ className }) => (
      <div className={cn("-mx-1 my-1 h-px bg-border", className)} />
    ),
    Sub: ({ children }) => <div>{children}</div>,
    SubTrigger: ({ children, onClick }) => {
      async function handleClick() {
        await onClick?.();
        onClose();
      }

      return (
        <button
          type="button"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-2 text-left text-sm outline-hidden select-none"
          onClick={handleClick}
        >
          {children}
        </button>
      );
    },
    SubContent: ({ children }) => <div className="pl-3">{children}</div>,
  };
}

function ReactionItems({ Item }: { Item: MenuComponents["Item"] }) {
  return <Item>Cool item</Item>;
}

function MessageMenuContent({
  components,
  content,
  devEnabled,
  messageId,
  onAddReaction,
  showReactionItems = true,
}: {
  components: MenuComponents;
  content: string;
  devEnabled: boolean;
  messageId: number;
  onAddReaction?: () => void | Promise<void>;
  showReactionItems?: boolean;
}) {
  const { Content, Group, Item, Separator, Sub, SubContent, SubTrigger } =
    components;

  return (
    <Content>
      <Group>
        <Sub>
          <SubTrigger onClick={onAddReaction}>Add Reaction</SubTrigger>
          {showReactionItems && (
            <SubContent>
              <ReactionItems Item={Item} />
            </SubContent>
          )}
        </Sub>
        <Item disabled className="flex justify-between">
          <p>Pin Message</p> <Pin />
        </Item>
        <Item
          className="flex justify-between"
          onClick={() => copyText(content)}
        >
          <p>Copy Raw</p> <Clipboard />
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item disabled className="flex justify-between">
          <p>Edit Message</p> <Pen />
        </Item>
        <Item disabled className="flex justify-between">
          <p>Reply</p> <Reply />
        </Item>
        <Item disabled className="flex justify-between">
          <p>Forward</p> <Forward />
        </Item>
      </Group>
      <Separator />
      <Group>
        <Item disabled variant="destructive" className="flex justify-between">
          <p>Delete Message</p> <Trash />
        </Item>
      </Group>
      {devEnabled && (
        <>
          <Separator />
          <Group>
            <Item
              className="flex justify-between"
              onClick={() => copyText(String(messageId))}
            >
              <p>Copy ID</p> <Clipboard />
            </Item>
          </Group>
        </>
      )}
    </Content>
  );
}

export default function MessageContextMenu({
  children,
  content,
  messageId,
}: {
  children: ReactElement;
  content: string;
  messageId: number;
}) {
  const isMobile = useIsMobile();
  const devEnabled = useMemo(
    () => Number(localStorage.getItem("log_level")) >= 3,
    [],
  );
  const [mainDrawerOpen, setMainDrawerOpen] = useState(false);
  const [reactionDrawerOpen, setReactionDrawerOpen] = useState(false);
  const mainDrawerComponents = getMobileMenuComponents(() =>
    setMainDrawerOpen(false),
  );
  const reactionDrawerComponents = getMobileMenuComponents(() =>
    setReactionDrawerOpen(false),
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={mainDrawerOpen} onOpenChange={setMainDrawerOpen}>
          <DrawerTrigger asChild>{children}</DrawerTrigger>
          <MessageMenuContent
            components={mainDrawerComponents}
            content={content}
            devEnabled={devEnabled}
            messageId={messageId}
            onAddReaction={() => setReactionDrawerOpen(true)}
            showReactionItems={false}
          />
        </Drawer>
        <Drawer open={reactionDrawerOpen} onOpenChange={setReactionDrawerOpen}>
          <DrawerContent>
            <ReactionItems Item={reactionDrawerComponents.Item} />
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <MessageMenuContent
        components={desktopMenuComponents}
        content={content}
        devEnabled={devEnabled}
        messageId={messageId}
      />
    </ContextMenu>
  );
}
