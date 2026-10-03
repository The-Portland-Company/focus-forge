// Focus: Forge — standalone desktop shell (Electron).
// Loads the deployed web app directly. Does NOT depend on Safari, so it can
// never trigger the "You can't open Safari because it is not responding" dialog
// that the old Safari Web App produced.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const fs = require("fs");
const path = require("path");
const onepassword = require("./onepassword");

const APP_URL = process.env.FOCUSFORGE_URL || "https://app.focusforge.dev/today";
const APP_HOST = new URL(APP_URL).host;
// Hosts that stay in-window: the app itself plus TPC Auth, whose login and
// consent pages must share this window's cookie jar to finish sign-in.
const IN_APP_HOSTS = new Set([APP_HOST, "auth.theportlandcompany.com"]);

// Present as plain Chrome. The default Electron user agent carries
// "focus-forge-desktop-shell/1.0.0" and "Electron/<ver>" tokens, and 1Password
// treats a window whose UA contains "Electron" as a non-browser: it never
// offers inline autofill on the login form. Stripping those tokens down to a
// standard Chrome UA (same Chromium version the shell already runs) makes
// 1Password recognise the embedded browser and prompt as it does in Chrome.
const CHROME_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

// Cloudflare Turnstile cannot be passed from inside Electron -- it rejects the
// embedded browser even when a human ticks the box -- so every sign-in attempt
// from this shell fails with "complete the verification challenge". TPC Auth
// already lets trusted automation skip only the captcha when the request
// carries a key listed in its CAPTCHA_BYPASS_TOKENS. The shell sends that header
// to the auth host alone, with a key read from the user's profile (never from
// the bundle), so a copied app is still challenged. Rate limits, credentials,
// MFA and lockdown still apply. Missing file = no header = normal Turnstile.
const AUTH_HOST = "auth.theportlandcompany.com";
const BYPASS_HEADER = "x-swarm-tester-token";
const readBypassToken = () => {
  try {
    return fs.readFileSync(path.join(app.getPath("userData"), "captcha-bypass.token"), "utf8").trim() || null;
  } catch {
    return null;
  }
};
const installCaptchaBypass = (ses) => {
  const token = readBypassToken();
  if (!token) return;
  ses.webRequest.onBeforeSendHeaders({ urls: [`https://${AUTH_HOST}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, [BYPASS_HEADER]: token } });
  });
};

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
      if (!IN_APP_HOSTS.has(new URL(url).host)) {
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

// The app menu is the stock macOS set plus "1Password…" (⇧⌘X) under Edit, which
// opens the extension popup -- Electron has no toolbar for its icon to live in.
const buildMenu = () => {
  const template = [
    { role: "appMenu" },
    { role: "fileMenu" },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        onepassword.menuItem(),
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.whenReady().then(async () => {
  // Load the real 1Password browser extension (copied from an installed Chromium
  // browser) and bridge its native messaging to the 1Password desktop app, so it
  // unlocks and autofills here exactly as it does in Chrome. Skipped, with a
  // warning, when no browser on this Mac has the extension installed.
  try {
    await onepassword.enable(session.defaultSession);
  } catch (error) {
    console.error("1Password:", error);
  }
  installCaptchaBypass(session.defaultSession);
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
