// Aetheria Online for Windows + Pelican Auto-Injector & GitHub Auto-Update
const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");

const GAME = "https://www.aetheria-online.in.th/play";
const SITE = new URL(GAME).host;

// URL สำหรับ Remote Auto-Update (เปลี่ยนเป็น URL ของคุณเมื่อสร้าง GitHub Repo เสร็จ)
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/thegopza/aetheria-pelican-bot/main/bot.js";

// One window: a second launch brings the first one forward
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function open() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#0e1424",
    title: "Aetheria Online",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  // Inject Pelican Bot automatically upon game page load
  win.webContents.on("did-finish-load", async () => {
    const currentUrl = win.webContents.getURL();
    if (!currentUrl.includes("aetheria-online.in.th/play")) return;

    console.log("[Pelican Loader] 🎮 Detected game window! Preparing Pelican Bot injection...");

    // 1. Ensure msgpack-lite is available in the page window
    await win.webContents.executeJavaScript(`
      (function() {
        if (!window.msgpack) {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js';
          document.head.appendChild(s);
          console.log("[Pelican Loader] Injected msgpack-lite CDN");
        }
      })();
    `).catch(() => {});

    // 2. Load bot payload (Remote Auto-Update with local fallback)
    const localBotPath = path.join(process.resourcesPath, "bot.js");

    function injectScript(code) {
      win.webContents.executeJavaScript(code)
        .then(() => console.log("[Pelican Loader] 🚀 Pelican Bot injected and active!"))
        .catch(err => console.error("[Pelican Loader] ❌ Injection error:", err));
    }

    let fetched = false;
    // Check if remote URL is configured
    if (GITHUB_RAW_URL && true) {
      try {
        const req = https.get(GITHUB_RAW_URL + "?t=" + Date.now(), (res) => {
          if (res.statusCode === 200) {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
              if (data.length > 1000) {
                fetched = true;
                console.log("[Pelican Loader] 🌐 Successfully updated latest bot from GitHub (" + data.length + " bytes)!");
                try { fs.writeFileSync(localBotPath, data, "utf8"); } catch(e) {}
                injectScript(data);
              }
            });
          }
        });
        req.on("error", () => {});
        req.setTimeout(2500, () => req.destroy());
      } catch(e) {}
    }

    // Local fallback after 1.5s
    setTimeout(() => {
      if (!fetched) {
        if (fs.existsSync(localBotPath)) {
          console.log("[Pelican Loader] 📂 Loading local bot.js from " + localBotPath);
          const code = fs.readFileSync(localBotPath, "utf8");
          injectScript(code);
        } else {
          console.warn("[Pelican Loader] ⚠️ Local bot.js not found at " + localBotPath);
        }
      }
    }, 1500);
  });

  // Links to other sites open in the player's browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).host !== SITE) shell.openExternal(url);
    else win.loadURL(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (e, url) => {
    const host = new URL(url).host;
    if (host !== SITE && !host.endsWith(".aetheria-online.in.th") && host !== "aetheria-online.in.th") {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // F11 full screen, F5 reload, Ctrl+Shift+I developer tools
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") win.setFullScreen(!win.isFullScreen());
    else if (input.key === "F5") win.webContents.reload();
    else if (input.key === "I" && input.control && input.shift) win.webContents.toggleDevTools();
    else return;
    e.preventDefault();
  });

  // No connection: a short note and a retry
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="background:#0e1424;color:#e5e7eb;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>เชื่อมต่อเกมไม่ได้</h2><p>ตรวจสอบอินเทอร์เน็ต แล้วลองใหม่ (${desc})</p><button onclick="location.href='${GAME}'" style="padding:10px 24px;font-size:16px;border-radius:8px;border:0;background:#fcd34d;cursor:pointer">ลองใหม่</button></div></body>`));
  });

  win.loadURL(GAME);
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

Menu.setApplicationMenu(null);
app.whenReady().then(open);
app.on("window-all-closed", () => app.quit());
