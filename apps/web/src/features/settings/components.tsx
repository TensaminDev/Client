import {
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Input,
  Label,
  Switch as UISwitch,
} from "@tensamin/ui";
import { useEffect, useState } from "react";

import { storageDefaults, type Storage } from "@tensamin/shared/data";
import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { useStorage } from "@tensamin/storage/context";

type BooleanStorageKey = {
  [K in keyof Storage]: Storage[K] extends boolean ? K : never;
}[keyof Storage];

type ListStorageKey = {
  [K in keyof Storage]: Storage[K] extends (string | number)[] ? K : never;
}[keyof Storage];

type ListStorageItem<K extends ListStorageKey> =
  Storage[K] extends Array<infer Item> ? Item : never;

export function Switch({
  label,
  id,
}: {
  label: React.ReactNode;
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

export function List<K extends ListStorageKey>({
  label,
  id,
}: {
  label: React.ReactNode;
  id: K;
}) {
  const { save, load } = useStorage();
  const [items, setItems] = useState<Storage[K]>(storageDefaults[id]);
  const [inputValue, setInputValue] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    load(id).then((value) => setItems(value));
  }, [id, load]);

  const persistItems = (nextItems: Storage[K]) => {
    setItems(nextItems);
    save(id, nextItems);
  };

  const toStorageItem = (value: string): ListStorageItem<K> => {
    const referenceItem = items[0] ?? storageDefaults[id][0];

    if (typeof referenceItem === "number") {
      return Number(value) as ListStorageItem<K>;
    }

    return value as ListStorageItem<K>;
  };

  const addItem = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) return;

    const nextItem = toStorageItem(trimmedValue);
    if (typeof nextItem === "number" && Number.isNaN(nextItem)) return;

    persistItems([...items, nextItem] as Storage[K]);
    setInputValue("");
  };

  const deleteItems = (indexes: Set<number>) => {
    const nextItems = items.filter((_, index) => !indexes.has(index)) as Storage[K];

    setItems(nextItems);
    setSelectedItems(new Set());
    save(id, nextItems);
  };

  return (
    <div className="flex flex-col gap-2 pt-4">
      <Label>{label}</Label>
      <div className="flex flex-col gap-0 overflow-hidden p-1 border-2 rounded-xl">
        <div className="flex gap-1">
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addItem();
            }}
          />
          <Button onClick={addItem}>Add item</Button>
        </div>
        <div className="flex flex-col gap-0">
          {items.map((item, index) => {
            const labelId = `${String(id)}-${index}`;
            const selected = selectedItems.has(index);
            const deletingSelectedItems = selectedItems.size > 1;

            return (
              <ContextMenu key={`${String(item)}-${index}`}>
                <ContextMenuTrigger
                  render={
                    <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2 border-b px-1 py-2 last:border-b-0">
                      <Checkbox
                        id={labelId}
                        checked={selected}
                        onCheckedChange={(checked) => {
                          setSelectedItems((previous) => {
                            const nextSelected = new Set(previous);

                            if (checked) {
                              nextSelected.add(index);
                            } else {
                              nextSelected.delete(index);
                            }

                            return nextSelected;
                          });
                        }}
                      />
                      <Label htmlFor={labelId}>{String(item)}</Label>
                      <div />
                    </div>
                  }
                />
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() =>
                      deleteItems(
                        deletingSelectedItems
                          ? selectedItems
                          : new Set([index]),
                      )
                    }
                  >
                    {deletingSelectedItems ? "Delete Selected" : "Delete"}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </div>
    </div>
  );
}
