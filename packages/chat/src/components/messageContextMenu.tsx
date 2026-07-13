import {
  Button,
  Card,
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
  DrawerDescription,
  DrawerTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "@tensamin/ui";
import {
  Clipboard,
  Ellipsis,
  Forward,
  Laugh,
  Plus,
  Pen,
  Pin,
  Reply,
  Trash,
} from "lucide-react";
import { cloneElement, useMemo, useState, useSyncExternalStore } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from "react";
import { useChat } from "../context";
import Emoji from "@tensamin/markdown/emoji";
import EmojiPicker from "./emojiPicker";
import { getRecentEmojis, useEmojiRanks } from "./emojiRanks";

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

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

const desktopMenuComponents: MenuComponents = {
  Content: ContextMenuContent,
  Group: ContextMenuGroup,
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

function getMobileMenuComponents({
  description,
  onClose,
  title,
}: {
  description: string;
  onClose: () => void;
  title: string;
}): MenuComponents {
  return {
    Content: ({ className, children }) => (
      <DrawerContent>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">{description}</DrawerDescription>
        <div className={cn("p-3!", className)}>{children}</div>
      </DrawerContent>
    ),
    Group: ({ children }) => <div>{children}</div>,
    Item: ({ children, className, disabled, onClick, variant = "default" }) => {
      async function handleClick() {
        await onClick?.();
        blurActiveElement();
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
        blurActiveElement();
        onClose();
        await onClick?.();
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

function ReactionItems({
  Item,
  emojis,
  onMore,
  onSelect,
}: {
  Item: MenuComponents["Item"];
  emojis: string[];
  onMore: () => void;
  onSelect: (emoji: string) => void;
}) {
  return (
    <>
      {emojis.map((emoji) => (
        <Item key={emoji} onClick={() => onSelect(emoji)}>
          <Emoji className="w-4.5 h-4.5" shortcode={emoji} />
          <span>{emoji}</span>
        </Item>
      ))}
      <Item onClick={onMore}>
        <Plus className="size-4.5" />
        <span>More reactions</span>
      </Item>
    </>
  );
}

let shiftPressed = false;
const shiftListeners = new Set<() => void>();

function setShiftPressed(value: boolean) {
  if (shiftPressed === value) return;

  shiftPressed = value;
  shiftListeners.forEach((listener) => listener());
}

function subscribeToShift(listener: () => void) {
  shiftListeners.add(listener);

  if (shiftListeners.size === 1) {
    window.addEventListener("keydown", handleShiftKey);
    window.addEventListener("keyup", handleShiftKey);
    window.addEventListener("blur", handleWindowBlur);
  }

  return () => {
    shiftListeners.delete(listener);
    if (shiftListeners.size === 0) {
      window.removeEventListener("keydown", handleShiftKey);
      window.removeEventListener("keyup", handleShiftKey);
      window.removeEventListener("blur", handleWindowBlur);
      shiftPressed = false;
    }
  };
}

function handleShiftKey(event: KeyboardEvent) {
  setShiftPressed(event.shiftKey);
}

function handleWindowBlur() {
  setShiftPressed(false);
}

function useShiftPressed() {
  return useSyncExternalStore(
    subscribeToShift,
    () => shiftPressed,
    () => false,
  );
}

let activeMiniMenuId: number | null = null;
let clearMiniMenuTimeout: ReturnType<typeof setTimeout> | undefined;
const miniMenuListeners = new Set<() => void>();

function setActiveMiniMenu(messageId: number | null) {
  if (clearMiniMenuTimeout !== undefined) {
    clearTimeout(clearMiniMenuTimeout);
    clearMiniMenuTimeout = undefined;
  }
  if (activeMiniMenuId === messageId) return;

  activeMiniMenuId = messageId;
  miniMenuListeners.forEach((listener) => listener());
}

function scheduleMiniMenuClose() {
  clearMiniMenuTimeout = setTimeout(() => {
    clearMiniMenuTimeout = undefined;
    setActiveMiniMenu(null);
  }, 80);
}

function useActiveMiniMenuId() {
  return useSyncExternalStore(
    (listener) => {
      miniMenuListeners.add(listener);
      return () => miniMenuListeners.delete(listener);
    },
    () => activeMiniMenuId,
    () => null,
  );
}

function MiniMenuTooltip({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MiniMessageMenu({
  isOwnMessage,
  onDelete,
  onEdit,
  onOpenMenu,
  onOpenPicker,
  usePickerTrigger,
  onReact,
  quickReactions,
  onReply,
  shiftIsPressed,
}: {
  isOwnMessage: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onOpenMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenPicker: () => void;
  usePickerTrigger: boolean;
  onReact: (emoji: string) => void;
  quickReactions: string[];
  onReply: () => void;
  shiftIsPressed: boolean;
}) {
  return (
    <div className="absolute right-4 -top-3 z-10">
      <Card className="flex flex-row justify-end gap-0! rounded-lg! p-0! shadow-lg">
        {quickReactions.map((emoji) => (
          <MiniMenuTooltip
            key={emoji}
            label={emoji}
            children={
              <Button
                aria-label={`React with ${emoji}`}
                variant="ghost"
                className="h-8 w-8 p-0!"
                onClick={() => onReact(emoji)}
              >
                <Emoji className="h-5 w-5" shortcode={emoji} tooltip={false} />
              </Button>
            }
          />
        ))}
        <Separator orientation="vertical" className="my-1" />
        <MiniMenuTooltip
          label="Add reaction"
          children={
            usePickerTrigger ? (
              <PopoverTrigger
                render={
                  <Button
                    aria-label="Add reaction"
                    variant="ghost"
                    className="h-8 w-8"
                  >
                    <Laugh />
                  </Button>
                }
              />
            ) : (
              <Button
                aria-label="Add reaction"
                variant="ghost"
                className="h-8 w-8"
                onClick={onOpenPicker}
              >
                <Laugh />
              </Button>
            )
          }
        />
        <MiniMenuTooltip
          label={isOwnMessage ? "Edit message" : "Reply to message"}
          children={
            <Button
              variant="ghost"
              className="h-8 w-8"
              aria-label={isOwnMessage ? "Edit message" : "Reply to message"}
              onClick={isOwnMessage ? onEdit : onReply}
            >
              {isOwnMessage ? <Pen /> : <Reply />}
            </Button>
          }
        />
        <MiniMenuTooltip
          label="Forward message"
          children={
            <Button
              variant="ghost"
              className="h-8 w-8"
              aria-label="Forward message"
            >
              <Forward />
            </Button>
          }
        />
        <Separator orientation="vertical" className="my-1" />
        {isOwnMessage && shiftIsPressed ? (
          <MiniMenuTooltip
            label="Delete message"
            children={
              <Button
                variant="ghost"
                className="h-8 w-8 text-destructive"
                aria-label="Delete message"
                onClick={onDelete}
              >
                <Trash />
              </Button>
            }
          />
        ) : (
          <MiniMenuTooltip
            label="Open message menu"
            children={
              <Button
                variant="ghost"
                className="h-8 w-8"
                aria-label="Open message menu"
                onClick={onOpenMenu}
              >
                <Ellipsis />
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}

function MessageMenuContent({
  components,
  content,
  devEnabled,
  isOwnMessage,
  messageId,
  onAddReaction,
  reactionEmojis,
  onReact,
  showReactionItems = true,
  onSetEditing,
}: {
  components: MenuComponents;
  content: string;
  devEnabled: boolean;
  isOwnMessage: boolean;
  messageId: number;
  onAddReaction?: () => void | Promise<void>;
  reactionEmojis: string[];
  onReact: (emoji: string) => void;
  showReactionItems?: boolean;
  onSetEditing: (value: boolean) => void;
}) {
  const { Content, Group, Item, Separator, Sub, SubContent, SubTrigger } =
    components;

  const { deleteMessage, setReplyTo } = useChat();

  return (
    <Content>
      <Group>
        <Sub>
          <SubTrigger onClick={showReactionItems ? undefined : onAddReaction}>
            Add Reaction
          </SubTrigger>
          {showReactionItems && (
            <SubContent>
              <ReactionItems
                Item={Item}
                emojis={reactionEmojis}
                onMore={() => void onAddReaction?.()}
                onSelect={onReact}
              />
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
        {isOwnMessage && (
          <Item
            className="flex justify-between"
            onClick={() => {
              onSetEditing(true);
            }}
          >
            <p>Edit Message</p> <Pen />
          </Item>
        )}
        <Item
          className="flex justify-between"
          onClick={() => {
            setReplyTo(messageId);
          }}
        >
          <p>Reply</p> <Reply />
        </Item>
        <Item disabled className="flex justify-between">
          <p>Forward</p> <Forward />
        </Item>
      </Group>
      {isOwnMessage && (
        <>
          <Separator />
          <Group>
            <Item
              variant="destructive"
              className="flex justify-between"
              onClick={() => deleteMessage(messageId)}
            >
              <p>Delete Message</p> <Trash />
            </Item>
          </Group>
        </>
      )}
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
  hideMiniMenu = false,
  isOwnMessage,
  messageId,
  onReact,
  onSetEditing,
}: {
  children: ReactElement;
  content: string;
  hideMiniMenu?: boolean;
  isOwnMessage: boolean;
  messageId: number;
  onReact: (emoji: string) => void | Promise<void>;
  onSetEditing: (value: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const shiftIsPressed = useShiftPressed();
  const activeMenuId = useActiveMiniMenuId();
  const { deleteMessage, setReplyTo } = useChat();
  const devEnabled = useMemo(
    () => Number(localStorage.getItem("log_level")) >= 3,
    [],
  );
  const [mainDrawerOpen, setMainDrawerOpen] = useState(false);
  const [reactionDrawerOpen, setReactionDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { ranks } = useEmojiRanks();
  const quickReactions = getRecentEmojis(ranks, 3);
  const menuReactions = getRecentEmojis(ranks, 5);

  function selectReaction(emoji: string) {
    void onReact(emoji);
    setReactionDrawerOpen(false);
    setPickerOpen(false);
  }
  const mainDrawerComponents = useMemo(
    () =>
      getMobileMenuComponents({
        description: "Actions available for this message.",
        onClose: () => setMainDrawerOpen(false),
        title: "Message actions",
      }),
    [],
  );
  const reactionDrawerComponents = useMemo(
    () =>
      getMobileMenuComponents({
        description: "Choose a reaction to add to this message.",
        onClose: () => setReactionDrawerOpen(false),
        title: "Add reaction",
      }),
    [],
  );

  function renderMessage(
    openMenu: (event: ReactMouseEvent<HTMLElement>) => void,
  ) {
    return (
      <div
        className="group/message-menu relative w-full"
        onPointerEnter={() => setActiveMiniMenu(messageId)}
        onPointerLeave={scheduleMiniMenuClose}
      >
        {children}
        {!isMobile && !hideMiniMenu && activeMenuId === messageId && (
          <MiniMessageMenu
            isOwnMessage={isOwnMessage}
            onDelete={() => deleteMessage(messageId)}
            onEdit={() => onSetEditing(true)}
            onOpenMenu={openMenu}
            onOpenPicker={() => setPickerOpen(true)}
            usePickerTrigger={!isMobile}
            onReact={selectReaction}
            quickReactions={quickReactions}
            onReply={() => setReplyTo(messageId)}
            shiftIsPressed={shiftIsPressed}
          />
        )}
      </div>
    );
  }

  if (isMobile) {
    const child = renderMessage(() => setMainDrawerOpen(true));

    return (
      <>
        <Drawer open={mainDrawerOpen} onOpenChange={setMainDrawerOpen}>
          {cloneElement(child, {
            onContextMenu: (event: ReactMouseEvent) => {
              child.props.onContextMenu?.(event);
              if (event.defaultPrevented) return;

              event.preventDefault();
              setMainDrawerOpen(true);
            },
          })}
          <MessageMenuContent
            components={mainDrawerComponents}
            content={content}
            devEnabled={devEnabled}
            isOwnMessage={isOwnMessage}
            messageId={messageId}
            onAddReaction={() => setReactionDrawerOpen(true)}
            onReact={selectReaction}
            reactionEmojis={menuReactions}
            showReactionItems={false}
            onSetEditing={onSetEditing}
          />
        </Drawer>
        <Drawer open={reactionDrawerOpen} onOpenChange={setReactionDrawerOpen}>
          <DrawerContent>
            <DrawerTitle className="sr-only">Add reaction</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose a reaction to add to this message.
            </DrawerDescription>
            <div className="p-3!">
              <ReactionItems
                Item={reactionDrawerComponents.Item}
                emojis={menuReactions}
                onMore={() => {
                  setReactionDrawerOpen(false);
                  setPickerOpen(true);
                }}
                onSelect={selectReaction}
              />
            </div>
          </DrawerContent>
        </Drawer>
        <Drawer open={pickerOpen} onOpenChange={setPickerOpen}>
          <DrawerContent>
            <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose an emoji to react with.
            </DrawerDescription>
            <div className="p-3">
              <EmojiPicker onSelect={selectReaction} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  const child = renderMessage((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: event.clientX,
        clientY: event.clientY,
      }),
    );
  });

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <ContextMenu>
        <ContextMenuTrigger render={child} />
        <MessageMenuContent
          components={desktopMenuComponents}
          content={content}
          devEnabled={devEnabled}
          isOwnMessage={isOwnMessage}
          messageId={messageId}
          onAddReaction={() => setPickerOpen(true)}
          onReact={selectReaction}
          reactionEmojis={menuReactions}
          onSetEditing={onSetEditing}
        />
      </ContextMenu>
      <PopoverContent className="w-auto p-0">
        <EmojiPicker onSelect={selectReaction} />
      </PopoverContent>
    </Popover>
  );
}
