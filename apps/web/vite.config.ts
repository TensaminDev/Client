import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const appDir = dirname(fileURLToPath(import.meta.url));
const markdownPackageDir = resolve(appDir, "../../packages/markdown");

function resolveMarkdownDependency(packageName: string): string {
  return realpathSync(resolve(markdownPackageDir, "node_modules", packageName));
}

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: "@codemirror/commands",
        replacement: resolveMarkdownDependency("@codemirror/commands"),
      },
      {
        find: "@codemirror/lang-markdown",
        replacement: resolveMarkdownDependency("@codemirror/lang-markdown"),
      },
      {
        find: "@codemirror/state",
        replacement: resolveMarkdownDependency("@codemirror/state"),
      },
      {
        find: "@codemirror/view",
        replacement: resolveMarkdownDependency("@codemirror/view"),
      },
    ],
    dedupe: [
      "@codemirror/commands",
      "@codemirror/lang-markdown",
      "@codemirror/state",
      "@codemirror/view",
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  worker: {
    format: "es",
  },
});
