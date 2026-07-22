// Focus: Forge — standalone desktop shell (Electron).
// Loads the deployed web app directly. Does NOT depend on Safari, so it can
// never trigger the "You can't open Safari because it is not responding" dialog
// that the old Safari Web App produced.
const { app, BrowserWindow, shell } = require("electron");

const APP_URL = process.env.FOCUSFORGE_URL || "https://focusforge.theportlandcompany.com/today";
const APP_HOST = new URL(APP_URL).host;

// Present as plain Chrome. The default Electron user agent carries
// "focus-forge-desktop-shell/1.0.0" and "Electron/<ver>" tokens, and 1Password
// treats a window whose UA contains "Electron" as a non-browser: it never
// offers inline autofill on the login form. Stripping those tokens down to a
// standard Chrome UA (same Chromium version the shell already runs) makes
// 1Password recognise the embedded browser and prompt as it does in Chrome.
const CHROME_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0f172a",
    title: "Focus: Forge",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Apply the Chrome UA to the whole session, so sub-resources and any
  // navigation report it too, not just the top document.
  mainWindow.webContents.setUserAgent(CHROME_UA);
  mainWindow.loadURL(APP_URL, { userAgent: CHROME_UA });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Off-domain links open in the user's default browser; app links stay in-window.
  const externalize = (url) => {
    try {
      if (new URL(url).host !== APP_HOST) {
        shell.openExternal(url);
        return true;
      }
    } catch {
      /* ignore malformed URLs */
    }
    return false;
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    externalize(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (externalize(url)) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
