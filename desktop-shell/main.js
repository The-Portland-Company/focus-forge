// Focus: Forge — standalone desktop shell (Electron).
// Loads the deployed web app directly. Does NOT depend on Safari, so it can
// never trigger the "You can't open Safari because it is not responding" dialog
// that the old Safari Web App produced.
const {
  app,
  BrowserWindow,
  shell,
  globalShortcut,
  Menu,
  ipcMain,
  session,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { startLogin, handleCallback, AUTH_HOST } = require("./auth-login");

// ---------------------------------------------------------------------------
// System-browser login: register focusforge:// and receive the callback.
// Listeners are attached at module load (before "ready") so a callback that
// launches the app is not missed; it is queued until the window exists.
// ---------------------------------------------------------------------------
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("focusforge", process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient("focusforge");
}

let queuedCallbackUrl = null;
const onSignedIn = () => {
  if (mainWindow) {
    mainWindow.loadURL(APP_URL, { userAgent: CHROME_UA });
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
};
const receiveCallback = (url) => {
  if (!app.isReady()) {
    queuedCallbackUrl = url;
    return;
  }
  handleCallback(url, onSignedIn);
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith("focusforge://"));
    if (url) receiveCallback(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveCallback(url);
  });
}

// Optional one-shot login bootstrap: set FF_SEED_COOKIES to a JSON file
// holding an array of cookie objects (name, value, domain, path, secure,
// httpOnly, sameSite, expires) and they are written into the app session
// before the first page loads. Used to transplant a signed-in session.
const SEED_COOKIES_FILE = process.env.FF_SEED_COOKIES || null;
// Names of the httpOnly session cookies, most-preferred first, that hold the
// bearer token Quick View needs. ff_at is the TPC Auth access-token JWT.
const TOKEN_COOKIE_NAMES = ["ff_at"];

async function seedCookies() {
  if (!SEED_COOKIES_FILE) return;
  let list;
  try {
    list = JSON.parse(fs.readFileSync(SEED_COOKIES_FILE, "utf8"));
  } catch (err) {
    console.error("Could not read FF_SEED_COOKIES:", err);
    return;
  }
  for (const c of list) {
    const sameSite =
      (c.sameSite || "lax").toLowerCase() === "none"
        ? "no_restriction"
        : (c.sameSite || "lax").toLowerCase() === "strict"
          ? "strict"
          : "unspecified";
    const cookie = {
      url: "https://" + (c.domain || "app.focusforge.dev").replace(/^\./, ""),
      name: c.name,
      value: c.value,
      path: c.path || "/",
      secure: c.secure !== false,
      httpOnly: !!c.httpOnly,
      sameSite,
    };
    if (typeof c.expires === "number" && c.expires > 0) {
      cookie.expirationDate = c.expires;
    }
    try {
      await session.defaultSession.cookies.set(cookie);
    } catch (err) {
      console.error("Cookie set failed for", c.name, err);
    }
  }
}

// Quick View asks the main process for the bearer token: page JS cannot read
// the httpOnly session cookie, but the main process can.
ipcMain.handle("ffqv-get-token", async () => {
  for (const name of TOKEN_COOKIE_NAMES) {
    try {
      const matches = await session.defaultSession.cookies.get({ name });
      const hit = matches.find((m) => /focusforge\.dev$/.test(m.domain || ""));
      if (hit && hit.value) return hit.value;
      if (matches[0] && matches[0].value) return matches[0].value;
    } catch (_) {
      /* keep trying */
    }
  }
  // Fall back to any Supabase auth-token cookie.
  try {
    const all = await session.defaultSession.cookies.get({});
    const sb = all.find((c) => /^sb-.*-auth-token/.test(c.name));
    if (sb) {
      let raw = sb.value;
      if (raw.startsWith("base64-")) raw = raw.slice(7);
      try {
        let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const session_ = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
        return session_.access_token || null;
      } catch (_) {
        /* not decodable */
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
});

const APP_URL = process.env.FOCUSFORGE_URL || "https://app.focusforge.dev/today";
const APP_HOST = new URL(APP_URL).host;
const APP_ORIGIN = new URL(APP_URL).origin;
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

const QUICKVIEW_ACCELERATOR = "CommandOrControl+Shift+Space";

let mainWindow = null;
let quickWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#09090b",
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

  // The TPC Auth login page is behind Cloudflare Turnstile, which cannot be
  // solved in this window. Cancel any navigation/redirect to it and run the
  // login in the system browser instead. preventDefault means the window never
  // reaches the auth host, so this cannot loop; startLogin() also debounces.
  const interceptLogin = (event, url) => {
    try {
      if (new URL(url).host === AUTH_HOST) {
        event.preventDefault();
        startLogin();
        return true;
      }
    } catch {
      /* ignore malformed URLs */
    }
    return false;
  };
  mainWindow.webContents.on("will-redirect", interceptLogin);
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (interceptLogin(event, url)) return;
    if (externalize(url)) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

// ---------------------------------------------------------------------------
// Quick View — a small frameless notepad window for rapid task brain-dumps.
// It loads the app origin (so it shares the signed-in session cookie and can
// call /api/mobile/*), then injects quickview.inject.js, which renders the
// notepad overlay and talks to the Forge mobile API with the user's token.
// ---------------------------------------------------------------------------
const injectQuickView = () => {
  try {
    const code = fs.readFileSync(
      path.join(__dirname, "quickview.inject.js"),
      "utf8",
    );
    quickWindow.webContents.executeJavaScript(code, true).catch(() => {});
  } catch (err) {
    console.error("Quick View injection failed:", err);
  }
};

const createQuickView = () => {
  quickWindow = new BrowserWindow({
    width: 460,
    height: 620,
    minWidth: 360,
    minHeight: 420,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    resizable: true,
    fullscreenable: false,
    backgroundColor: "#09090b",
    title: "Quick View",
    vibrancy: "under-window",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "quickview-preload.js"),
    },
  });

  quickWindow.webContents.setUserAgent(CHROME_UA);
  // Load the app origin so the window is same-origin with the session cookie.
  quickWindow.loadURL(APP_ORIGIN + "/today", { userAgent: CHROME_UA });
  quickWindow.webContents.on("did-finish-load", injectQuickView);

  // Keep Quick View self-contained: any off-origin navigation goes to the
  // default browser instead of taking over this little window.
  quickWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  quickWindow.on("close", (event) => {
    // Hide instead of destroy so drafts and the loaded session survive.
    if (!app.isQuitting) {
      event.preventDefault();
      quickWindow.hide();
    }
  });
};

const toggleQuickView = () => {
  if (!quickWindow) createQuickView();
  if (quickWindow.isVisible() && quickWindow.isFocused()) {
    quickWindow.hide();
  } else {
    quickWindow.show();
    quickWindow.focus();
  }
};

ipcMain.on("ffqv-close", () => {
  if (quickWindow) quickWindow.hide();
});

const buildMenu = () => {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Quick View",
          accelerator: QUICKVIEW_ACCELERATOR,
          click: toggleQuickView,
        },
        { label: "Sign In…", click: () => startLogin() },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.whenReady().then(async () => {
  await seedCookies();
  createWindow();
  buildMenu();
  globalShortcut.register(QUICKVIEW_ACCELERATOR, toggleQuickView);
  if (queuedCallbackUrl) {
    const url = queuedCallbackUrl;
    queuedCallbackUrl = null;
    receiveCallback(url);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
