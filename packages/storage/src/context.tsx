import * as React from "react";
import {
  type Storage as StorageSchema,
  storageDefaults as defaults,
} from "@tensamin/shared/data";
import { getEntry, setEntry, deleteEntry } from "./indexed-db";
import { ErrorScreen } from "@tensamin/ui";
import { log } from "@tensamin/shared/log";

interface StorageContextValue {
  load<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K]>;
  save<K extends keyof StorageSchema>(
    key: K,
    value: StorageSchema[K],
  ): Promise<void>;
  clear: () => Promise<void>;
}

const StorageContext = React.createContext<StorageContextValue | undefined>(
  undefined,
);

const isIndexedDBSupported = typeof indexedDB !== "undefined";

/**
 * Executes StorageProvider.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function StorageProvider(props: { children: React.ReactNode }) {
  const [storage, setStorage] = React.useState<StorageSchema>(defaults);
  const storageRef = React.useRef(storage);

  const [error, setError] = React.useState("");
  const [errorDescription, setErrorDescription] = React.useState("");

  React.useEffect(() => {
    storageRef.current = storage;
  }, [storage]);

  const loadIO = React.useCallback(
    async <K extends keyof StorageSchema>(
      key: K,
    ): Promise<StorageSchema[K]> => {
      let stored: StorageSchema[K] | undefined;

      try {
        stored = await getEntry(key);
      } catch (err) {
        setError("Failed to load data");
        setErrorDescription(
          "An error occurred while loading data from IndexedDB. Please try again.",
        );
        log(0, "Storage", "red", err);
      }

      if (stored !== undefined) {
        setStorage((prev) => ({ ...prev, [key]: stored }));
        return stored;
      }

      return defaults[key];
    },
    [],
  );

  const saveIO = React.useCallback(
    async <K extends keyof StorageSchema>(
      key: K,
      value: StorageSchema[K],
    ): Promise<void> => {
      if (JSON.stringify(value) === JSON.stringify(defaults[key])) {
        await deleteEntry(key);
        setStorage((prev) => ({ ...prev, [key]: defaults[key] }));
      } else {
        await setEntry(key, value);
        setStorage((prev) => ({ ...prev, [key]: value }));
      }
    },
    [],
  );

  const value = React.useMemo<StorageContextValue>(
    () => ({
      async load<K extends keyof StorageSchema>(
        key: K,
      ): Promise<StorageSchema[K]> {
        const current = storageRef.current[key];

        if (
          current === undefined ||
          JSON.stringify(current) === JSON.stringify(defaults[key])
        ) {
          const loadedValue = await loadIO(key);
          setStorage((prev) => ({ ...prev, [key]: loadedValue }));
          return loadedValue;
        }

        return current;
      },

      async save<K extends keyof StorageSchema>(
        key: K,
        nextValue: StorageSchema[K],
      ): Promise<void> {
        await saveIO(key, nextValue);
      },

      async clear() {
        const keys = Object.keys(defaults) as (keyof StorageSchema)[];
        await Promise.all(keys.map((key) => deleteEntry(key)));
        setStorage(defaults);
      },
    }),
    [loadIO, saveIO],
  );

  React.useEffect(() => {
    // @ts-expect-error development utility
    window.save = value.save;
  }, [value]);

  if (error !== "" && errorDescription !== "") {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (!isIndexedDBSupported) {
    return (
      <ErrorScreen
        error="Unsupported Browser"
        description="Your browser does not support IndexedDB, which is required for this application to function."
      />
    );
  }

  return (
    <StorageContext.Provider value={value}>
      {props.children}
    </StorageContext.Provider>
  );
}

/**
 * Executes useStorage.
 * @param none This function has no parameters.
 * @returns StorageContextValue.
 */
export function useStorage(): StorageContextValue {
  const context = React.useContext(StorageContext);
  if (!context) {
    throw new Error("useStorage must be used within a StorageProvider");
  }
  return context;
}
