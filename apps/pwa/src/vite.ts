import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pwaDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriIcons = resolve(pwaDirectory, "../tauri/src-tauri/icons");
const androidResources = resolve(
  pwaDirectory,
  "../tauri/src-tauri/gen/android/app/src/main/res",
);

function emitIcons(): Plugin {
  const icons = [
    {
      fileName: "icons/icon-180.png",
      source: resolve(tauriIcons, "ios/AppIcon-60x60@3x.png"),
    },
    {
      fileName: "icons/icon-192.png",
      source: resolve(androidResources, "mipmap-xxxhdpi/ic_launcher.png"),
    },
    {
      fileName: "icons/icon-96.png",
      source: resolve(androidResources, "mipmap-xhdpi/ic_launcher.png"),
    },
    {
      fileName: "icons/icon-512.png",
      source: resolve(tauriIcons, "icon.png"),
    },
    {
      fileName: "icons/icon-maskable-512.png",
      source: resolve(tauriIcons, "icon.png"),
    },
    {
      fileName: "icons/icon-monochrome-432.png",
      source: resolve(
        androidResources,
        "mipmap-xxxhdpi/ic_launcher_monochrome.png",
      ),
    },
    {
      fileName: "icons/notification-badge.png",
      source: resolve(androidResources, "drawable/ic_notification_small.png"),
    },
  ];

  return {
    name: "tensamin-pwa-icons",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url
          ? new URL(request.url, "http://localhost").pathname.slice(1)
          : "";
        const icon = icons.find(({ fileName }) => fileName === pathname);
        if (!icon) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Cache-Control", "no-cache");
        response.end(readFileSync(icon.source));
      });
    },
    generateBundle() {
      for (const icon of icons) {
        this.emitFile({
          type: "asset",
          fileName: icon.fileName,
          source: readFileSync(icon.source),
        });
      }
    },
    transformIndexHtml: {
      order: "post",
      handler() {
        return [
          {
            tag: "link",
            attrs: {
              rel: "apple-touch-icon",
              sizes: "180x180",
              href: "./icons/icon-180.png",
            },
            injectTo: "head",
          },
          {
            tag: "meta",
            attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
            injectTo: "head",
          },
          {
            tag: "meta",
            attrs: { name: "mobile-web-app-capable", content: "yes" },
            injectTo: "head",
          },
          {
            tag: "meta",
            attrs: {
              name: "apple-mobile-web-app-status-bar-style",
              content: "black-translucent",
            },
            injectTo: "head",
          },
          {
            tag: "meta",
            attrs: {
              name: "apple-mobile-web-app-title",
              content: "Tensamin",
            },
            injectTo: "head",
          },
          {
            tag: "meta",
            attrs: { name: "theme-color", content: "#006a67" },
            injectTo: "head",
          },
        ];
      },
    },
  };
}

export function tensaminPwa(): Plugin[] {
  return [
    emitIcons(),
    ...VitePWA({
      strategies: "injectManifest",
      srcDir: resolve(pwaDirectory, "src"),
      filename: "serviceWorker.ts",
      injectRegister: null,
      registerType: "prompt",
      buildBase: "/",
      manifestFilename: "manifest.json",
      useCredentials: true,
      includeAssets: ["favicon.ico", "icons/*.png"],
      manifest: {
        id: "/",
        name: "Tensamin",
        short_name: "Tensamin",
        description: "Private messaging and calls with Tensamin.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        background_color: "#001f1e",
        theme_color: "#006a67",
        categories: ["social", "communication"],
        orientation: "any",
        launch_handler: { client_mode: "focus-existing" },
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-monochrome-432.png",
            sizes: "432x432",
            type: "image/png",
            purpose: "monochrome",
          },
        ],
        shortcuts: [
          {
            name: "Chats",
            short_name: "Chats",
            url: "/",
            icons: [
              {
                src: "icons/icon-96.png",
                sizes: "96x96",
                type: "image/png",
              },
            ],
          },
          {
            name: "Settings",
            short_name: "Settings",
            url: "/settings",
            icons: [
              {
                src: "icons/icon-96.png",
                sizes: "96x96",
                type: "image/png",
              },
            ],
          },
        ],
        file_handlers: [
          {
            action: "/login",
            accept: { "application/x-tensamin-user": [".tu"] },
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm,mp3,wav}"],
        globIgnores: ["assets/v3/**"],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ];
}
