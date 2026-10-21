import { invoke, isTauri } from "@tauri-apps/api/core";
import { TENSAMIN_DB_NAME } from "./indexedDb";

/** Reset browser data and native credentials, including data outside known app stores. */
export async function clearSiteData() {
  const operations: Promise<unknown>[] = [];
  if (isTauri()) {
    operations.push(
      invoke("plugin:mtp|mtp_clear_credentials", { name: "mtp:credentials" }),
    );
    operations.push(invoke("mtp_clear_credentials"));
  }
  operations.push(
    Promise.resolve(window.tensaminDesktop?.secureStorage?.clear?.()),
  );

  if ("serviceWorker" in navigator) {
    operations.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        ),
    );
  }
  if ("caches" in window) {
    operations.push(
      caches
        .keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name)))),
    );
  }
  if (navigator.storage?.getDirectory) {
    operations.push(
      navigator.storage.getDirectory().then(async (root) => {
        // Directory iteration is supported alongside OPFS but missing from TypeScript's DOM declarations.
        const directory = root as FileSystemDirectoryHandle & {
          keys(): AsyncIterableIterator<string>;
        };
        for await (const name of directory.keys())
          await root.removeEntry(name, { recursive: true });
      }),
    );
  }
  if (typeof indexedDB !== "undefined") {
    operations.push(
      (async () => {
        const databases = indexedDB.databases
          ? await indexedDB.databases()
          : [{ name: TENSAMIN_DB_NAME }];
        await Promise.all(
          databases
            .filter((database) => database.name)
            .map(
              (database) =>
                new Promise<void>((resolve, reject) => {
                  const request = indexedDB.deleteDatabase(database.name!);
                  request.onsuccess = () => resolve();
                  request.onerror = () => reject(request.error);
                  request.onblocked = () =>
                    reject(
                      new Error(
                        "Database reset is blocked. Close other Tensamin tabs and try again.",
                      ),
                    );
                }),
            ),
        );
      })(),
    );
  }

  // Finish every reset operation even if one storage API is unavailable or fails.
  const results = await Promise.allSettled(operations);
  localStorage.clear();
  sessionStorage.clear();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name) continue;
    const paths = location.pathname.split("/");
    while (paths.length) {
      const path = paths.join("/") || "/";
      document.cookie = `${name}=; Max-Age=0; path=${path}`;
      document.cookie = `${name}=; Max-Age=0; path=${path}; domain=${location.hostname}`;
      paths.pop();
    }
  }
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Some site data could not be cleared. Close other Tensamin tabs and try again.",
    );

  location.replace(
    new URL(
      location.protocol === "file:" ? location.pathname : "/",
      location.href,
    ),
  );
}
