const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");

const PORT = 3888;
const BASE_DIR = path.resolve(__dirname, "..");
const PROFILES_FILE = path.join(__dirname, "profiles.json");
const SESSIONS_DIR = path.join(BASE_DIR, "sessions");
const PUBLIC_DIR = path.join(__dirname, "public");

const GAME_EXE = "C:\\Users\\golf\\AppData\\Local\\Programs\\Aetheria Online\\Aetheria Online.exe";

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Track running processes in memory: { [profileId]: { pid, startTime } }
const runningProcesses = {};

function loadProfiles() {
  if (!fs.existsSync(PROFILES_FILE)) {
    const defaultProfiles = [
      {
        id: "profile_1",
        name: "Hunter Main",
        account: "Main Account",
        charClass: "Hunter",
        targetMap: "ซากโบราณสถาน Lv.45–55",
        debugPort: 49876,
        autoStart: true,
        notes: "ฟาร์มหลัก ธนูเพลิง / Arrow Crafting",
        createdAt: Date.now()
      },
      {
        id: "profile_2",
        name: "Farmer Alt",
        account: "Second Account",
        charClass: "Archer / Rogue",
        targetMap: "ถนนต้นหลิว",
        debugPort: 49877,
        autoStart: true,
        notes: "ฟาร์มหาขยะและวัตถุดิบทำยา",
        createdAt: Date.now()
      }
    ];
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(defaultProfiles, null, 2), "utf8");
    return defaultProfiles;
  }
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf8");
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function queryClientState(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/state`, { timeout: 700 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // JSON helper
  const sendJSON = (data, code = 200) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  };

  // ==========================================
  // API ROUTING
  // ==========================================

  // 1. GET /api/profiles
  if (req.method === "GET" && pathname === "/api/profiles") {
    const profiles = loadProfiles();
    const enriched = await Promise.all(
      profiles.map(async (p) => {
        const proc = runningProcesses[p.id];
        const alive = proc && isProcessAlive(proc.pid);
        let liveState = null;

        if (alive) {
          liveState = await queryClientState(p.debugPort);
        } else if (proc) {
          delete runningProcesses[p.id];
        }

        return {
          ...p,
          isRunning: alive,
          pid: alive ? proc.pid : null,
          uptime: alive ? Math.round((Date.now() - proc.startTime) / 1000) : 0,
          liveState
        };
      })
    );
    return sendJSON({ success: true, profiles: enriched, gameExe: GAME_EXE });
  }

  // 2. POST /api/profiles (Create)
  if (req.method === "POST" && pathname === "/api/profiles") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const profiles = loadProfiles();
        const nextPort = Math.max(49875, ...profiles.map(p => p.debugPort || 49876)) + 1;
        const newProfile = {
          id: "profile_" + Date.now(),
          name: (data.name || "New Client").trim(),
          account: (data.account || "").trim(),
          charClass: data.charClass || "Archer",
          targetMap: data.targetMap || "ถนนต้นหลิว",
          debugPort: data.debugPort || nextPort,
          autoStart: data.autoStart !== false,
          notes: data.notes || "",
          createdAt: Date.now()
        };
        profiles.push(newProfile);
        saveProfiles(profiles);

        // Pre-create session folder
        const sessionFolder = path.join(SESSIONS_DIR, newProfile.id);
        if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

        sendJSON({ success: true, profile: newProfile });
      } catch (err) {
        sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // 3. PUT /api/profiles/:id (Update)
  if (req.method === "PUT" && pathname.startsWith("/api/profiles/")) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const profiles = loadProfiles();
        const idx = profiles.findIndex(p => p.id === id);
        if (idx === -1) return sendJSON({ success: false, error: "Profile not found" }, 404);

        profiles[idx] = {
          ...profiles[idx],
          name: data.name !== undefined ? data.name.trim() : profiles[idx].name,
          account: data.account !== undefined ? data.account.trim() : profiles[idx].account,
          charClass: data.charClass || profiles[idx].charClass,
          targetMap: data.targetMap || profiles[idx].targetMap,
          debugPort: data.debugPort || profiles[idx].debugPort,
          autoStart: data.autoStart !== undefined ? data.autoStart : profiles[idx].autoStart,
          notes: data.notes !== undefined ? data.notes : profiles[idx].notes
        };
        saveProfiles(profiles);
        sendJSON({ success: true, profile: profiles[idx] });
      } catch (err) {
        sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // 4. DELETE /api/profiles/:id
  if (req.method === "DELETE" && pathname.startsWith("/api/profiles/")) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return sendJSON({ success: false, error: "Profile not found" }, 404);

    // Stop process if running
    if (runningProcesses[id] && isProcessAlive(runningProcesses[id].pid)) {
      try { process.kill(runningProcesses[id].pid, "SIGTERM"); } catch (e) {}
      delete runningProcesses[id];
    }

    profiles.splice(idx, 1);
    saveProfiles(profiles);
    return sendJSON({ success: true });
  }

  // 5. POST /api/profiles/:id/launch
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/launch$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);

    if (runningProcesses[id] && isProcessAlive(runningProcesses[id].pid)) {
      return sendJSON({ success: true, message: "Client is already running", pid: runningProcesses[id].pid });
    }

    const sessionDir = path.join(SESSIONS_DIR, profile.id);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    if (!fs.existsSync(GAME_EXE)) {
      return sendJSON({ success: false, error: "Aetheria Online.exe not found at: " + GAME_EXE }, 500);
    }

    const args = [
      `--user-data-dir=${sessionDir}`,
      `--profile-name=${encodeURIComponent(profile.name)}`,
      `--debug-port=${profile.debugPort || 49876}`,
      "--multi-instance"
    ];

    try {
      const child = spawn(GAME_EXE, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
      child.unref();

      runningProcesses[id] = {
        pid: child.pid,
        startTime: Date.now()
      };

      console.log(`[Pelican Manager] 🚀 Launched client "${profile.name}" (PID: ${child.pid}, Port: ${profile.debugPort})`);
      return sendJSON({ success: true, pid: child.pid, port: profile.debugPort });
    } catch (err) {
      return sendJSON({ success: false, error: err.message }, 500);
    }
  }

  // 6. POST /api/profiles/:id/stop
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/stop$/)) {
    const id = pathname.split("/")[3];
    const proc = runningProcesses[id];
    if (proc && proc.pid) {
      exec(`taskkill /pid ${proc.pid} /f /t`, (err) => {
        delete runningProcesses[id];
        return sendJSON({ success: true });
      });
    } else {
      delete runningProcesses[id];
      return sendJSON({ success: true, message: "Not running" });
    }
    return;
  }

  // 7. POST /api/launch-all
  if (req.method === "POST" && pathname === "/api/launch-all") {
    const profiles = loadProfiles();
    const launched = [];
    for (const p of profiles) {
      if (!runningProcesses[p.id] || !isProcessAlive(runningProcesses[p.id].pid)) {
        const sessionDir = path.join(SESSIONS_DIR, p.id);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        const args = [
          `--user-data-dir=${sessionDir}`,
          `--profile-name=${encodeURIComponent(p.name)}`,
          `--debug-port=${p.debugPort || 49876}`,
          "--multi-instance"
        ];
        try {
          const child = spawn(GAME_EXE, args, { detached: true, stdio: "ignore" });
          child.unref();
          runningProcesses[p.id] = { pid: child.pid, startTime: Date.now() };
          launched.push({ id: p.id, name: p.name, pid: child.pid });
        } catch (e) {}
      }
    }
    return sendJSON({ success: true, launched });
  }

  // 8. POST /api/stop-all
  if (req.method === "POST" && pathname === "/api/stop-all") {
    for (const id in runningProcesses) {
      const proc = runningProcesses[id];
      if (proc && proc.pid) {
        try { exec(`taskkill /pid ${proc.pid} /f /t`); } catch (e) {}
      }
      delete runningProcesses[id];
    }
    return sendJSON({ success: true });
  }

  // 9. POST /api/tile-windows (Arrange Windows side-by-side or grid)
  if (req.method === "POST" && pathname === "/api/tile-windows") {
    const layout = parsedUrl.searchParams.get("layout") || "grid"; // 'side' or 'grid'
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinPos {
          [DllImport("user32.dll")]
          public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);
        }
"@
      $procs = Get-Process -Name "Aetheria Online" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
      $count = $procs.Count
      if ($count -gt 0) {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
        $sw = $screen.Width
        $sh = $screen.Height
        for ($i = 0; $i -lt $count; $i++) {
          $h = $procs[$i].MainWindowHandle
          [WinPos]::ShowWindow($h, 9)
          if ('${layout}' -eq 'side' -or $count -le 2) {
            $w = [int]($sw / $count)
            $x = $i * $w
            [WinPos]::MoveWindow($h, $x, 0, $w, $sh, $true)
          } else {
            # 2x2 Grid
            $w = [int]($sw / 2)
            $h_h = [int]($sh / 2)
            $col = $i % 2
            $row = [int]($i / 2)
            $x = $col * $w
            $y = $row * $h_h
            [WinPos]::MoveWindow($h, $x, $y, $w, $h_h, $true)
          }
        }
      }
    `;

    exec(`powershell -Command "${psScript.replace(/\r?\n/g, ' ')}"`, (err) => {
      sendJSON({ success: !err });
    });
    return;
  }

  // ==========================================
  // STATIC FILE SERVING
  // ==========================================
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }
    const finalExt = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[finalExt] || "application/octet-stream";

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`========================================================`);
  console.log(`🚀 [Pelican Multi-Client Hub] Running on http://127.0.0.1:${PORT}`);
  console.log(`📁 Sessions directory: ${SESSIONS_DIR}`);
  console.log(`🎮 Game executable: ${GAME_EXE}`);
  console.log(`========================================================`);
});
