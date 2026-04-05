import { BrowserWindow, Tray } from "electrobun/bun";

const tray = new Tray({
  title: "Tensamin",
  image: "views://mainview/icons/64x64.png",
  height: 64,
  width: 64,
});

const mainWindow = new BrowserWindow({
  title: "Tensamin",
  url: "views://mainview/index.html",
  renderer: "cef",
  frame: {
    width: 800,
    height: 800,
    x: 200,
    y: 200,
  },
});

mainWindow.url = "views://mainview/index.html";

tray.on("tray-clicked", () => {
  console.log("Tray clicked");
});

console.log("Started desktop app");