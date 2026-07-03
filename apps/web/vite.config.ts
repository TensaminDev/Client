import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mtp } from "mtp/vite";

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

function restartOnMtpSourceChange(srcDir: string): Plugin {
  const watchedDir = normalizePath(realpathSync(srcDir));

  return {
    name: "restart-on-mtp-source-change",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(watchedDir);
      let restartTimer: ReturnType<typeof setTimeout> | null = null;

      const restart = (file: string) => {
        if (!normalizePath(file).startsWith(`${watchedDir}/`)) {
          return;
        }

        if (restartTimer) {
          clearTimeout(restartTimer);
        }

        restartTimer = setTimeout(() => {
          restartTimer = null;
          void server.restart();
        }, 50);
      };

      server.watcher.on("add", restart);
      server.watcher.on("change", restart);
      server.watcher.on("unlink", restart);
    },
  };
}

export default defineConfig({
  base: "./",
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
      "react",
      "react-dom",
      "react-redux",
      "use-sync-external-store",
      "@tensamin/crypto",
      "@tensamin/storage",
      "@tensamin/mtp",
      "@tensamin/user",
      "@tensamin/tauri",
      "@tensamin/chat",
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
  optimizeDeps: {
    include: [
      "react-redux",
      "use-sync-external-store/shim/with-selector",
      "use-sync-external-store/with-selector",
      "decimal.js-light",
      "eventemitter3",
      "react-is",
    ],
    exclude: [
      "mtp",
      "mtp/raw",
      "mtp/type-map",
      "@tensamin/call",
      "@tensamin/call/utils",
      "@tensamin/chat",
      "@tensamin/crypto",
      "@tensamin/crypto/context",
      "@tensamin/crypto/worker",
      "@tensamin/markdown",
      "@tensamin/mtp",
      "@tensamin/notifications",
      "@tensamin/shared",
      "@tensamin/shared/data",
      "@tensamin/shared/log",
      "@tensamin/storage",
      "@tensamin/storage/context",
      "@tensamin/tauri",
      "@tensamin/tauth",
      "@tensamin/user",
    ],
  },
  build: {
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  plugins: [
    deepFilterAssetHeaders(resolve(appDir, "public")),
    restartOnMtpSourceChange(resolve(appDir, "../../packages/mtp/src")),
    mtp({ typeMaps: resolve(appDir, "../../type-maps.yaml") }),
    react(),
    tailwindcss(),
  ],
  worker: {
    format: "es",
  },
});
