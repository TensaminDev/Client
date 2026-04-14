import { Label } from "@tensamin/ui";
import { Switch as UISwitch, Input as UIInput } from "@tensamin/ui";
import { useEffect, useState } from "react";

import type { Storage } from "@tensamin/shared/data";
import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { useStorage } from "@tensamin/storage/context";

type BooleanStorageKey = {
  [K in keyof Storage]: Storage[K] extends boolean ? K : never;
}[keyof Storage];

type StringStorageKey = {
  [K in keyof Storage]: Storage[K] extends string ? K : never;
}[keyof Storage];

type NumberStorageKey = {
  [K in keyof Storage]: Storage[K] extends number ? K : never;
}[keyof Storage];

type InputProps =
  | {
      label: string;
      id: StringStorageKey;
      placeholder?: string;
      type?: "text";
    }
  | {
      label: string;
      id: NumberStorageKey;
      placeholder?: string;
      type: "number";
    };

export function Switch({
  label,
  id,
}: {
  label: string;
  id: keyof typeof settingsStorageDefaults & BooleanStorageKey;
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

export function Input({ label, id, placeholder, type }: InputProps) {
  const { save, load } = useStorage();
  const [value, setValue] = useState<string | number>(
    type === "number" ? 0 : "",
  );

  useEffect(() => {
    load(id).then((loadedValue) => {
      if (type === "number") {
        if (typeof loadedValue === "number") {
          setValue(loadedValue);
        }
        return;
      }

      if (typeof loadedValue === "string") {
        setValue(loadedValue);
      }
    });
  }, [id, load, type]);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <UIInput
        id={id}
        type={type || "text"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          if (type === "number") {
            const nextValue = Number(e.target.value);
            setValue(nextValue);
            save(id, nextValue);
            return;
          }

          const nextValue = e.target.value;
          setValue(nextValue);
          save(id, nextValue);
        }}
      />
    </div>
  );
}
