import { List, Switch } from "@/features/settings/components";
import { Kbd } from "@tensamin/ui";

export default function Page() {
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
      <p className="text-destructive pt-6">
        Trusted embed domains can get your IP-Address! Only add domains if you
        really trust them!
      </p>
      <List label="Trusted embed domains" id="chat_trusted_domains" />
    </div>
  );
}
