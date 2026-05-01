import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const appDir = dirname(fileURLToPath(import.meta.url));
const markdownPackageDir = resolve(appDir, "../../packages/markdown");

function resolveMarkdownDependency(packageName: string): string {
  return realpathSync(resolve(markdownPackageDir, "node_modules", packageName));
}

function deepFilterAssetHeaders(rootDir: string): Plugin {
  const serveModel = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const url = req.url ? new URL(req.url, "http://localhost") : null;
    if (url?.pathname !== "/assets/v2/models/DeepFilterNet3_onnx.tar.gz") {
      next();
      return;
    }

    const modelPath = resolve(
      rootDir,
      "assets/v2/models/DeepFilterNet3_onnx.tar.gz",
    );
    const stat = statSync(modelPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Length", stat.size.toString());
    res.setHeader("Cache-Control", "no-cache");
    createReadStream(modelPath).pipe(res);
  };

  return {
    name: "deepfilter-asset-headers",
    configureServer(server) {
      server.middlewares.use(serveModel);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveModel);
    },
  };
}

export default defineConfig({
  clearScreen: false,
  resolve: {
    tsconfigPaths: true,
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
  plugins: [
    deepFilterAssetHeaders(resolve(appDir, "public")),
    react(),
    tailwindcss(),
  ],
  worker: {
    format: "es",
  },
});
