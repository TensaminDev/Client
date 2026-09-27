import { createCache } from "@tensamin/cache";
import { storageDefaults } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import { secureValueCodec } from "@tensamin/storage/secure";
import { Button, Input, Label } from "@methanium/ui";
import { useEffect, useState } from "react";

const validLimit = (value: number) => Number.isSafeInteger(value) && value >= 0;

export default function Page() {
  const { load, save } = useStorage();
  const [contacts, setContacts] = useState(storageDefaults.cache_contacts);
  const [messagesPerChat, setMessagesPerChat] = useState(
    storageDefaults.cache_messages_per_chat,
  );
  const [savedContacts, setSavedContacts] = useState(contacts);
  const [savedMessagesPerChat, setSavedMessagesPerChat] =
    useState(messagesPerChat);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void Promise.all([
      load("cache_contacts"),
      load("cache_messages_per_chat"),
    ]).then(([nextContacts, nextMessages]) => {
      setContacts(nextContacts);
      setSavedContacts(nextContacts);
      setMessagesPerChat(nextMessages);
      setSavedMessagesPerChat(nextMessages);
      setLoaded(true);
    });
  }, [load]);
  const valid = validLimit(contacts) && validLimit(messagesPerChat);
  const changed =
    contacts !== savedContacts || messagesPerChat !== savedMessagesPerChat;
  async function persist() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        save("cache_contacts", contacts),
        save("cache_messages_per_chat", messagesPerChat),
      ]);
      const accountId = await load("user_id");
      if (accountId)
        await createCache(String(accountId), {
          codec: secureValueCodec,
        }).conversations.prune();
      setSavedContacts(contacts);
      setSavedMessagesPerChat(messagesPerChat);
    } finally {
      setSaving(false);
    }
  }
  if (!loaded) return null;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cache-contacts">Contacts</Label>
        <Input
          id="cache-contacts"
          type="number"
          min={0}
          step={1}
          value={Number.isNaN(contacts) ? "" : contacts}
          onChange={(event) => setContacts(event.currentTarget.valueAsNumber)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cache-messages">Messages per chat</Label>
        <Input
          id="cache-messages"
          type="number"
          min={0}
          step={1}
          value={Number.isNaN(messagesPerChat) ? "" : messagesPerChat}
          onChange={(event) =>
            setMessagesPerChat(event.currentTarget.valueAsNumber)
          }
        />
      </div>
      {!valid && (
        <p className="text-sm text-destructive">
          Cache limits must be whole numbers greater than or equal to 0.
        </p>
      )}
      <div className="flex gap-2">
        <Button disabled={!valid || !changed || saving} onClick={persist}>
          Save
        </Button>
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => {
            setContacts(storageDefaults.cache_contacts);
            setMessagesPerChat(storageDefaults.cache_messages_per_chat);
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
