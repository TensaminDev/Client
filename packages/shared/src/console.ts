const entries: string[] = [];

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(
        value,
        (_, item: unknown) => {
          if (typeof item === "bigint") return `${item}n`;
          if (item instanceof Error) return item.stack ?? item.message;
          if (typeof item === "object" && item !== null) {
            if (seen.has(item)) return "[Circular]";
            seen.add(item);
          }
          return item;
        },
        2,
      ) ?? String(value)
    );
  } catch {
    return "[Unable to serialize console value]";
  }
}

function record(level: string, args: unknown[]) {
  entries.push(
    `${new Date().toISOString()} [${level}] ${args.map(format).join(" ")}`,
  );
}

// Install before application modules run, while preserving the browser console.
for (const method of [
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "trace",
  "dir",
  "dirxml",
  "table",
  "group",
  "groupCollapsed",
  "groupEnd",
  "assert",
  "clear",
] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (method !== "assert" || !args[0]) {
      record(method, method === "assert" ? args.slice(1) : args);
    }
    Reflect.apply(original, console, args);
  };
}

window.addEventListener("error", (event) => {
  record("uncaught error", [
    event.error ??
      `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
  ]);
});
window.addEventListener("unhandledrejection", (event) => {
  record("unhandled rejection", [event.reason]);
});

export function getConsoleOutput() {
  return entries.join("\n");
}
