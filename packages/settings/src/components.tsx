import { EditableList, LabeledSwitch } from "@methanium/ui";
import { useEffect, useState } from "react";

import { storageDefaults, type Storage } from "@tensamin/shared/data";
import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { useStorage } from "@tensamin/storage/context";



type ListStorageKey = {
  [K in keyof Storage]: Storage[K] extends (string | number)[] ? K : never;
}[keyof Storage];

type ListStorageItem<K extends ListStorageKey> =
  Storage[K] extends Array<infer Item> ? Item & (string | number) : never;

export function Switch({
  label,
  id,
}: {
  label: React.ReactNode;
  id: keyof typeof settingsStorageDefaults & ({
  [K in keyof Storage]: Storage[K] extends boolean ? K : never;
}[keyof Storage]);
}) {
  const { save, load } = useStorage();
  const [value, setValue] = useState<boolean>(settingsStorageDefaults[id]);

  useEffect(() => {
    load(id).then((value) => setValue(value));
  }, [id, load]);

  return (
    <LabeledSwitch
      id={id}
      label={label}
      checked={value}
      onCheckedChange={(nextValue) => {
        setValue(nextValue);
        save(id, nextValue);
      }}
    />
  );
}

export function List<K extends ListStorageKey>({
  label,
  id,
}: {
  label: React.ReactNode;
  id: K;
}) {
  const { save, load } = useStorage();
  const [items, setItems] = useState<Storage[K]>(storageDefaults[id]);

  useEffect(() => {
    load(id).then((value) => setItems(value));
  }, [id, load]);

  const persistItems = (nextItems: ListStorageItem<K>[]) => {
    setItems(nextItems as Storage[K]);
    save(id, nextItems as Storage[K]);
  };

  const toStorageItem = (value: string): ListStorageItem<K> => {
    const referenceItem = items[0] ?? storageDefaults[id][0];
    return (
      typeof referenceItem === "number" ? Number(value) : value
    ) as ListStorageItem<K>;
  };

  return (
    <EditableList<ListStorageItem<K>>
      label={label}
      items={items as ListStorageItem<K>[]}
      parseItem={(value) => {
        const item = toStorageItem(value);
        return typeof item === "number" && Number.isNaN(item)
          ? undefined
          : item;
      }}
      onItemsChange={persistItems}
    />
  );
}
