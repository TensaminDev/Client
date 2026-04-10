import { Switch } from "@/features/settings/components";

export default function Page() {
  return (
    <div>
      <Switch
        label="Reverse Enter Key Behavior"
        id="settings.reverse_enter_behavior"
      />
    </div>
  );
}
