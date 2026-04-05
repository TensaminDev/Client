import type { ElectrobunConfig } from "electrobun";

import { version } from "../../package.json";

export default {
  app: {
    name: "tensamin",
    identifier: "client.tensamin.net",
    version: version,
  },
  build: {
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "../web/dist/": "views/mainview/",
    },
    mac: {
      defaultRenderer: "cef",
      bundleCEF: true,
    },
    linux: {
      defaultRenderer: "cef",
      bundleCEF: true,
      chromiumFlags: {
        "enable-features": "UseOzonePlatform",
        "ozone-platform": "wayland",
      },
    },
    win: {
      defaultRenderer: "cef",
      bundleCEF: true,
    },
  },
} satisfies ElectrobunConfig;
