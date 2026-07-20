import {app, BrowserWindow, ipcMain, session, shell} from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env.VITE_DEV_SERVER_URL;
const allowedExternalHosts = new Set(["drive.google.com", "docs.google.com"]);

ipcMain.handle("vivero:open-external-url", async (_event, value: unknown): Promise<boolean> => {
  if (typeof value !== "string") return false;
  try {
    const target = new URL(value);
    if (
      target.protocol !== "https:" ||
      !allowedExternalHosts.has(target.hostname) ||
      target.port !== "" ||
      target.username !== "" ||
      target.password !== ""
    ) return false;
    await shell.openExternal(target.toString());
    return true;
  } catch {
    return false;
  }
});

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: "Vivero Maestro",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => window.show());

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(join(currentDirectory, "../dist/index.html"));
  }

  return window;
}

app.enableSandbox();

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
