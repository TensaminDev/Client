import { toast as sonnerToast } from "sonner";
import { Ban, Check, Info, TriangleAlert } from "lucide-react";

/**
 * Log Levels
 * - 0: Always logged
 * - 1: Errors and warnings
 * - 2: Useful information
 * - 3: Debug messages
 */
export function log(
  logLevel: number,
  logger: string,
  color:
    | "red"
    | "green"
    | "yellow"
    | "purple"
    | "blue"
    | "cyan"
    | "white"
    | "black"
    | "gray",
  ...args: unknown[]
) {
  const currentLogLevel = Number(localStorage.getItem("log_level") || 0);

  if (logLevel > currentLogLevel) return;

  const resetCode = "\x1b[0m";
  const colorCodes: Record<typeof color, string> = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    purple: "\x1b[35m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    black: "\x1b[30m",
    gray: "\x1b[90m",
  };

  if (args.length === 1) {
    console.log(`${colorCodes[color]}${logger}${resetCode} ${args[0]}`);
    return;
  }

  console.groupCollapsed(`${colorCodes[color]}${logger}${resetCode} ${args[0]}`);
  try {
    for (const arg of args.slice(1)) {
      console.log(arg);
    }
  } finally {
    console.groupEnd();
  }
}

const size = 20;
/**
 * Executes toast.
 * @param type Parameter type.
 * @param message Parameter message.
 * @returns unknown.
 */
export function toast(
  type: "error" | "info" | "warn" | "success",
  message: string,
) {
  switch (type) {
    case "error":
      sonnerToast(message, {
        icon: <Ban size={size} />,
      });
      break;
    case "info":
      sonnerToast(message, {
        icon: <Info size={size} />,
      });
      break;
    case "warn":
      sonnerToast(message, {
        icon: <TriangleAlert size={size} />,
      });
      break;
    case "success":
      sonnerToast(message, {
        icon: <Check size={size} />,
      });
      break;
  }
}
