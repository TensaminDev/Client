import { storageDefaults } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import { Button, Kbd } from "@methanium/ui";
import { List, Switch } from "../components";

export default function Page() {
  const { save } = useStorage();
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label={
          <p>
            Change <Kbd>Enter</Kbd> behavior to <Kbd>Shift</Kbd> +{" "}
            <Kbd>Enter</Kbd>
          </p>
        }
        id="settings.reverse_enter_behavior"
      />
      <Switch
        label="Enable read confirmations"
        id="settings.read_confirmations"
      />
      <Switch
        label="Enable receive confirmations"
        id="settings.receive_confirmations"
      />
      <Switch
        label="Sidebar message preview"
        id="settings.show_start_of_last_message_in_sidebar"
      />
      <div className="pt-3">
        <Button
          variant="outline"
          onClick={() => void save("reactions", storageDefaults.reactions)}
        >
          Reset Emoji Ranks
        </Button>
      </div>
      <p className="text-destructive pt-4">
        Trusted embed domains can get your IP-Address! Only add domains if you
        really trust them!
      </p>
      <List label="Trusted embed domains" id="chat_trusted_domains" />
    </div>
  );
}
