/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */
const { build } = require("./package.json");
const { appId, channel, productName } = require("./build/icons/channel.json");

module.exports = {
  ...build,
  appId,
  productName,
  executableName: channel === "stable" ? "tensamin" : `tensamin-${channel}`,
  linux: {
    ...build.linux,
    executableName: channel === "stable" ? "tensamin" : `tensamin-${channel}`,
    desktop: { entry: { Name: productName, StartupWMClass: appId } },
  },
};
