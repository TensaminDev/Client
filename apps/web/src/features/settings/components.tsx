import { Label } from "@tensamin/ui";
import { Switch as UISwitch } from "@tensamin/ui";
import { useEffect, useState } from "react";

import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { useStorage } from "@tensamin/storage/context";

export function Switch({
  label,
  id,
}: {
  label: string;
  id: keyof typeof settingsStorageDefaults;
}) {
  const { save, load } = useStorage();
  const [value, setValue] = useState<boolean>(settingsStorageDefaults[id]);

  useEffect(() => {
    load(id).then((value) => setValue(value));
  }, [id, load]);

  return (
    <div className="flex gap-1">
      <UISwitch
        id={id}
        checked={value}
        onCheckedChange={(value) => {
          setValue(value);
          save(id, value);
        }}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
