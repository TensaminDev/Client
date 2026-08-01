import { defineHotkey } from "@tensamin/hotkeys";

export const editLastMessageHotkey = defineHotkey({
  id: "chat.edit-last-message",
  name: "Edit last message",
  description: "Edit your most recent message when the composer is empty.",
  category: "Chat",
  defaultBinding: "ArrowUp",
});

export const cancelMessageEditHotkey = defineHotkey({
  id: "chat.cancel-message-edit",
  name: "Cancel message edit",
  description: "Close the message editor without saving changes.",
  category: "Chat",
  defaultBinding: "Escape",
});
