import type { ElectrobunConfig } from "electrobun";

import { version } from "../../package.json";

export default {
  app: {
    name: "tensamin",
    identifier: "client.tensamin.net",
    version,
    urlSchemes: ["tensamin"],
  },
  build: {
    useAsar: true,
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "../web/dist/": "views/mainview/",
      "../mobile/src-tauri/icons": "views/mainview/icons/",
    },
    mac: {
      icons: "",
      bundleWGPU: false,
      defaultRenderer: "cef",
      bundleCEF: true,
    },
    linux: {
      icon: "../mobile/src-tauri/icons/icon.png",
      bundleWGPU: false,
      defaultRenderer: "cef",
      bundleCEF: true,
      chromiumFlags: {
        "enable-features": "UseOzonePlatform",
        "ozone-platform": "wayland",
      },
    },
    win: {
      icon: "../mobile/src-tauri/icons/icon.ico",
      bundleWGPU: false,
      defaultRenderer: "cef",
      bundleCEF: true,
    },
  },
} satisfies ElectrobunConfig;
