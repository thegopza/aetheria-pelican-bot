const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");

const PORT = 3888;
const BASE_DIR = path.resolve(__dirname, "..");
const PROFILES_FILE = path.join(__dirname, "profiles.json");
const PLANS_FILE = path.join(__dirname, "plans.json");
const PRESETS_FILE = path.join(__dirname, "presets.json");
function loadPresets() {
  if (!fs.existsSync(PRESETS_FILE)) {
    const defaultPresets = [
      {
        id: "preset_archer_ruins",
        name: "Archer ฟาร์มซากโบราณสถาน (ลูป 24 ชม.)",
        description: "ลูกธนู 200 ดอก, ขยะขายหมด, ล็อคของตีบวกและออฟชั่น, ลูป 24 ชม.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: {
          targetMap: "ซากโบราณสถาน Lv.45–55",
          autoLoop: true,
          sellConfig: {
            enabled: true,
            weightCheckEnabled: true,
            weightThreshold: 80,
            sellMaterials: true,
            weaponRarity: "normal",
            armorRarity: "normal",
            accRarity: "none",
            sellWeapons: true,
            sellArmors: true,
            keepRefined: true,
            keepSpecial: true,
            keepSockets: true,
            whitelist: "Phracon, Rough Elunium, Enchant Rune, Composite Bow, Crossbow, Gakkung, Hunter Bow"
          },
          archerConfig: {
            requireArrow: true,
            arrowType: 90030,
            arrowBuyQty: 200,
            useBwing: true,
            bwingBuyQty: 5,
            bwingItemId: 90311,
            ammoThreshold: 50,
            autoEquipArrow: false,
            arrowHotbarSlot: -1
          },
          shopConfig: {
            enabled: true,
            npcKey: "n2"
          },
          autoMarketSellConfig: {
            enabled: false,
            rules: []
          },
          authConfig: {
            enabled: true,
            autoResumeBot: true,
            charName: ""
          }
        }
      }
    ];
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(defaultPresets, null, 2), "utf8");
    return defaultPresets;
  }
  try { return JSON.parse(fs.readFileSync(PRESETS_FILE, "utf8")); } catch(e) { return []; }
}
function savePresets(presets) {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), "utf8");
}


function normalizePlansData(raw) {
  if (raw && Array.isArray(raw.profiles)) {
    return {
      profiles: raw.profiles,
      assignments: raw.assignments || {}
    };
  }

  // Initial starter plan matching user specifications:
  // Level 8: Equip Gakkung bow, Angelic Protection, Change map to ซากโบราณสถาน
  // Job Level 10: Change class to Archer
  const defaultProfiles = [
    {
      id: "plan_starter_archer",
      name: "Archer Speedrun Lv.1-50 (ตัวอย่างเริ่มต้น)",
      description: "Lv.8 สวมใส่ Gakkung Bow + Angelic Protection, ย้ายแมพ, Job 10 เปลี่ยนอาชีพ Archer",
      triggers: [
        {
          id: "trig_1",
          type: "base_level",
          targetLevel: 8,
          actions: [
            {
              id: "act_1",
              type: "equip_item",
              itemName: "Gakkung Bow",
              optionFilter: "dex",
              buyFromMarket: true,
              maxPrice: 100000
            },
            {
              id: "act_2",
              type: "equip_item",
              itemName: "Angelic Protection",
              optionFilter: "",
              buyFromMarket: true,
              maxPrice: 50000
            },
            {
              id: "act_3",
              type: "change_map",
              targetMap: "ซากโบราณสถาน"
            }
          ]
        },
        {
          id: "trig_2",
          type: "job_level",
          targetLevel: 10,
          actions: [
            {
              id: "act_4",
              type: "change_class",
              targetClass: "Archer"
            }
          ]
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];

  const assignments = {};
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach(k => {
      if (k !== 'profiles' && k !== 'assignments') {
        assignments[k] = "plan_starter_archer";
      }
    });
  }

  return { profiles: defaultProfiles, assignments };
}

function loadPlans() {
  if (!fs.existsSync(PLANS_FILE)) return normalizePlansData({});
  try { 
    const raw = JSON.parse(fs.readFileSync(PLANS_FILE, "utf8"));
    return normalizePlansData(raw);
  } catch(e) { 
    return normalizePlansData({}); 
  }
}
function savePlans(plans) {
  fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), "utf8");
}

const SESSIONS_DIR = path.join(BASE_DIR, "sessions");
const PUBLIC_DIR = path.join(__dirname, "public");

const GAME_EXE = "C:\\Users\\golf\\AppData\\Local\\Programs\\Aetheria Online\\Aetheria Online.exe";

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Track running processes in memory: { [profileId]: { pid, startTime } }
const runningProcesses = {};
const windowStates = {}; // profileId -> { isHidden: boolean }
let allWindowsHidden = false;

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
    // 1. Try rich state via /api/eval if bot script has __getClientLiveState
    const evalUrl = `http://127.0.0.1:${port}/api/eval?code=` + encodeURIComponent(`(typeof window.__getClientLiveState === 'function' ? window.__getClientLiveState() : null)`);
    const req = http.get(evalUrl, { timeout: 800 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.success && parsed.result) {
            return resolve(parsed.result);
          }
        } catch (e) {}
        queryStandardState(port).then(resolve);
      });
    });
    req.on("error", () => queryStandardState(port).then(resolve));
    req.on("timeout", () => {
      req.destroy();
      queryStandardState(port).then(resolve);
    });
  });
}

function queryStandardState(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/state`, { timeout: 700 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
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


function runPowerShell(script) {
  return new Promise((resolve) => {
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -EncodedCommand ${b64}`, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr, success: !err });
    });
  });
}

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
        let alive = proc && isProcessAlive(proc.pid);
        let liveState = null;

        // Auto-detect online state if debugPort is responding
        if (p.debugPort) {
          liveState = await queryClientState(p.debugPort);
          if (liveState && !liveState.error) {
            alive = true;
          }
        }

        if (!alive && proc) {
          delete runningProcesses[p.id];
        }

        return {
          ...p,
          isRunning: alive,
          pid: alive ? (proc ? proc.pid : null) : null,
          uptime: alive ? (proc ? Math.round((Date.now() - proc.startTime) / 1000) : 0) : 0,
          liveState,
          windowState: windowStates[p.id] || { isHidden: false }
        };
      })
    );
    return sendJSON({ success: true, profiles: enriched, gameExe: GAME_EXE, allWindowsHidden });
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
          whitelist: data.whitelist || "Phracon, Rough Elunium, Enchant Rune, Composite Bow, Crossbow, Gakkung, Hunter Bow",
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
  if (req.method === "PUT" && pathname.match(/^\/api\/profiles\/[^/]+$/)) {
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
          notes: data.notes !== undefined ? data.notes : profiles[idx].notes,
          whitelist: data.whitelist !== undefined ? data.whitelist : profiles[idx].whitelist
        };
        saveProfiles(profiles);
        sendJSON({ success: true, profile: profiles[idx] });
      } catch (err) {
        sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

    // GET /api/profiles/:id/whitelist (Fetch live from game client or fallback to saved profile)
  if (req.method === "GET" && pathname.match(/^\/api\/profiles\/[^/]+\/whitelist$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);

    const defaultWL = "Phracon, Rough Elunium, Enchant Rune, Composite Bow, Crossbow, Gakkung, Hunter Bow";
    const profileWL = profile.whitelist || (profile.sellConfig && profile.sellConfig.whitelist) || defaultWL;

    if (profile.debugPort) {
      const evalCode = `(window.__sellConfig && window.__sellConfig.whitelist !== undefined) ? window.__sellConfig.whitelist : null`;
      const evalUrl = `http://127.0.0.1:${profile.debugPort}/api/eval?code=` + encodeURIComponent(evalCode);
      let responded = false;
      const reqTimer = setTimeout(() => {
        if (responded) return;
        responded = true;
        sendJSON({
          success: true,
          profileId: id,
          profileName: profile.name,
          whitelist: profileWL,
          items: profileWL.split(",").map(s => s.trim()).filter(Boolean),
          isOnline: false
        });
      }, 700);

      http.get(evalUrl, (cRes) => {
        let d = "";
        cRes.on("data", c => d += c);
        cRes.on("end", () => {
          if (responded) return;
          responded = true;
          clearTimeout(reqTimer);
          try {
            const parsed = JSON.parse(d);
            const liveWL = (parsed.result !== null && parsed.result !== undefined) ? String(parsed.result) : profileWL;
            profile.whitelist = liveWL;
            saveProfiles(profiles);
            sendJSON({
              success: true,
              profileId: id,
              profileName: profile.name,
              whitelist: liveWL,
              items: liveWL.split(",").map(s => s.trim()).filter(Boolean),
              isOnline: true
            });
          } catch(e) {
            sendJSON({
              success: true,
              profileId: id,
              profileName: profile.name,
              whitelist: profileWL,
              items: profileWL.split(",").map(s => s.trim()).filter(Boolean),
              isOnline: false
            });
          }
        });
      }).on("error", () => {
        if (responded) return;
        responded = true;
        clearTimeout(reqTimer);
        sendJSON({
          success: true,
          profileId: id,
          profileName: profile.name,
          whitelist: profileWL,
          items: profileWL.split(",").map(s => s.trim()).filter(Boolean),
          isOnline: false
        });
      });
      return;
    }

    return sendJSON({
      success: true,
      profileId: id,
      profileName: profile.name,
      whitelist: profileWL,
      items: profileWL.split(",").map(s => s.trim()).filter(Boolean),
      isOnline: false
    });
  }

  // PUT /api/profiles/:id/whitelist (Update whitelist & sync live to clients)
  if (req.method === "PUT" && pathname.match(/^\/api\/profiles\/[^/]+\/whitelist$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const profiles = loadProfiles();
        const profile = profiles.find(p => p.id === id);
        if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);

        const newWhitelist = typeof payload.whitelist === "string" ? payload.whitelist : "";
        profile.whitelist = newWhitelist;
        if (!profile.sellConfig) profile.sellConfig = {};
        profile.sellConfig.whitelist = newWhitelist;

        const syncToLiveClient = (p) => {
          if (!p.debugPort) return;
          const code = `(() => {
            if (!window.__sellConfig) window.__sellConfig = {};
            window.__sellConfig.whitelist = ${JSON.stringify(newWhitelist)};
            try { localStorage.setItem("pelican_sell_cfg", JSON.stringify(window.__sellConfig)); } catch(e){}
            const wlEl = document.getElementById("p-sell-whitelist");
            if (wlEl) wlEl.value = ${JSON.stringify(newWhitelist)};
            return { success: true };
          })()`;
          const evalUrl = `http://127.0.0.1:${p.debugPort}/api/eval?code=` + encodeURIComponent(code);
          http.get(evalUrl, () => {}).on("error", () => {});
        };

        // Sync live to current profile's game client
        syncToLiveClient(profile);

        let copiedTargetsCount = 0;
        if (Array.isArray(payload.targets) && payload.targets.length > 0) {
          payload.targets.forEach(targetId => {
            const targetProfile = profiles.find(p => p.id === targetId);
            if (targetProfile) {
              targetProfile.whitelist = newWhitelist;
              if (!targetProfile.sellConfig) targetProfile.sellConfig = {};
              targetProfile.sellConfig.whitelist = newWhitelist;
              syncToLiveClient(targetProfile);
              if (targetProfile.id !== profile.id) copiedTargetsCount++;
            }
          });
        }

        saveProfiles(profiles);
        sendJSON({
          success: true,
          whitelist: newWhitelist,
          items: newWhitelist.split(",").map(s => s.trim()).filter(Boolean),
          copiedTargetsCount,
          message: copiedTargetsCount > 0
            ? `คัดลอก Whitelist ไปยัง ${copiedTargetsCount} จอเรียบร้อยแล้ว!`
            : "บันทึกและซิงค์ Whitelist สำหรับจอนี้เรียบร้อยแล้ว!"
        });
      } catch (err) {
        sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // 4. DELETE /api/profiles/:id
  if (req.method === "DELETE" && pathname.match(/^\/api\/profiles\/[^/]+$/)) {
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
        cwd: path.dirname(GAME_EXE),
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
          const child = spawn(GAME_EXE, args, { cwd: path.dirname(GAME_EXE), detached: true, stdio: "ignore", windowsHide: false });
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

  // 9. POST /api/tile-windows (Arrange Windows side-by-side, grid, or shrink)
  if (req.method === "POST" && pathname === "/api/tile-windows") {
    const layout = parsedUrl.searchParams.get("layout") || "grid"; // 'side', 'grid', 'shrink'
    
    // Also send set-bounds to responsive debug ports
    const profiles = loadProfiles();
    const screenWidth = 1920; // Default fallback
    const screenHeight = 1080;
    
    let activeIdx = 0;
    for (const p of profiles) {
      if (p.debugPort) {
        if (layout === "shrink" || layout === "compact") {
          const cw = 640;
          const ch = 380;
          const col = activeIdx % 2;
          const row = Math.floor(activeIdx / 2);
          const x = col * cw;
          const y = row * ch;
          http.get(`http://127.0.0.1:${p.debugPort}/api/window?action=restore`, () => {
            http.get(`http://127.0.0.1:${p.debugPort}/api/window?action=set-bounds&x=${x}&y=${y}&w=${cw}&h=${ch}`, () => {}).on('error', () => {});
          }).on('error', () => {});
        }
        activeIdx++;
      }
    }

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
          if ('${layout}' -eq 'shrink' -or '${layout}' -eq 'compact') {
            $w = 640
            $h_h = 380
            $col = $i % 2
            $row = [int]($i / 2)
            $x = $col * $w
            $y = $row * $h_h
            [WinPos]::MoveWindow($h, $x, $y, $w, $h_h, $true)
          } elseif ('${layout}' -eq 'side' -or $count -le 2) {
            $w = [int]($sw / $count)
            $x = $i * $w
            [WinPos]::MoveWindow($h, $x, 0, $w, $sh, $true)
          } else {
            
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

    runPowerShell(psScript).then(r => sendJSON({ success: r.success }));
    return;
  }

  // POST /api/toggle-all-windows (Hide/Show All Game Windows Headless)
  if (req.method === "POST" && pathname === "/api/toggle-all-windows") {
    allWindowsHidden = !allWindowsHidden;
    const profiles = loadProfiles();
    for (const p of profiles) {
      windowStates[p.id] = { isHidden: allWindowsHidden };
      if (p.debugPort) {
        http.get(`http://127.0.0.1:${p.debugPort}/api/window?action=${allWindowsHidden ? 'hide' : 'show'}`, () => {}).on('error', () => {});
      }
    }
    const cmd = allWindowsHidden ? 0 : 9;
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinPosHideAll {
          [DllImport("user32.dll")]
          public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
      Get-Process -Name "Aetheria Online" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
        [WinPosHideAll]::ShowWindow($_.MainWindowHandle, ${cmd})
      }
    `;
    runPowerShell(psScript);
    return sendJSON({ success: true, allWindowsHidden });
  }

  // POST /api/profiles/:id/toggle-window (Hide/Show single game window)
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/toggle-window$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);

    if (!windowStates[id]) windowStates[id] = { isHidden: false };
    windowStates[id].isHidden = !windowStates[id].isHidden;
    const isHidden = windowStates[id].isHidden;

    if (profile.debugPort) {
      http.get(`http://127.0.0.1:${profile.debugPort}/api/window?action=${isHidden ? 'hide' : 'show'}`, () => {}).on('error', () => {});
    }

    const proc = runningProcesses[id];
    if (proc && proc.pid) {
      const cmd = isHidden ? 0 : 9;
      const psScript = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class WinPosSingle {
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          }
"@
        Get-Process -Id ${proc.pid} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
          [WinPosSingle]::ShowWindow($_.MainWindowHandle, ${cmd})
        }
      `;
      runPowerShell(psScript);
    }

    return sendJSON({ success: true, isHidden });
  }

  // POST /api/profiles/:id/toggle-bot (Start / Stop Bot loop on specific card)
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/toggle-bot$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);
    if (!profile.debugPort) return sendJSON({ success: false, error: "Client debug port not set" }, 400);

    const action = parsedUrl.searchParams.get("action"); // 'start', 'stop', or toggle
    const live = await queryClientState(profile.debugPort);
    const isRunning = Boolean(live && (live.autoLoop || live.isBotRunning));
    const targetRunning = action === "start" ? true : (action === "stop" ? false : !isRunning);

    const code = targetRunning ? `(() => {
      window.__autoLoopEnabled = true;
      window.__isBotRunning = true;
      try { localStorage.setItem('pelican_auto_loop', true); } catch(e){}
      if (typeof window.startMasterBot === 'function') window.startMasterBot();
      if (typeof window.startAutoLoop === 'function') window.startAutoLoop();
      if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
      return { success: true, running: true };
    })()` : `(() => {
      window.__autoLoopEnabled = false;
      window.__isBotRunning = false;
      try { localStorage.setItem('pelican_auto_loop', false); } catch(e){}
      if (typeof window.stopMasterBot === 'function') window.stopMasterBot();
      if (typeof window.stopAutoLoop === 'function') window.stopAutoLoop();
      if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
      return { success: true, running: false };
    })()`;

    const evalUrl = `http://127.0.0.1:${profile.debugPort}/api/eval?code=` + encodeURIComponent(code);
    http.get(evalUrl, (cRes) => {
      let d = "";
      cRes.on("data", c => d += c);
      cRes.on("end", () => {
        sendJSON({ success: true, isBotRunning: targetRunning });
      });
    }).on('error', (err) => {
      sendJSON({ success: false, error: err.message }, 502);
    });
    return;
  }

  // GET /api/profiles/:id/client-data (Live Bot Configs & State for Floating Web HUD)
  if (req.method === "GET" && pathname.match(/^\/api\/profiles\/[^/]+\/client-data$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile || !profile.debugPort) return sendJSON({ success: false, error: "Profile offline" }, 400);

    const code = `(() => {
      const auth = window.__authConfig || {};
      const archer = window.__archerConfig || {};
      const sell = window.__sellConfig || {};
      const autosell = window.__autoMarketSellConfig || {};
      const marketFilter = window.__marketFilterConfig || {};
      const state = typeof window.__getClientLiveState === 'function' ? window.__getClientLiveState() : null;
      return {
        state: state,
        targetFarmMap: window.__targetFarmMap || (document.getElementById('p-target-map-select')?.value) || (state ? state.targetMap : null),
        autoLoopEnabled: !!window.__autoLoopEnabled,
        isBotRunning: !!window.__isBotRunning,
        autoJumpEnabled: !!window.__autoJumpEnabled,
        archerConfig: archer,
        sellConfig: sell,
        autoMarketSellConfig: autosell,
        marketFilterConfig: marketFilter,
        authConfig: {
          enabled: !!auth.enabled,
          username: auth.username || (document.getElementById('p-auth-user')?.value) || '',
          password: auth.password || (document.getElementById('p-auth-pass')?.value) || '',
          autoResumeBot: !!auth.autoResumeBot
        },
        serverWeight: window.__serverWeight || null,
        currentAmmo: (typeof window.__currentAmmo === 'number') ? window.__currentAmmo : (state ? state.ammo : 0),
        myMarketActiveCount: window.__myMarketActiveCount || 0
      };
    })()`;

    const evalUrl = `http://127.0.0.1:${profile.debugPort}/api/eval?code=` + encodeURIComponent(code);
    http.get(evalUrl, (cRes) => {
      let d = "";
      cRes.on("data", c => d += c);
      cRes.on("end", () => {
        try {
          const parsed = JSON.parse(d);
          sendJSON({ success: true, data: parsed.result || {} });
        } catch(e) {
          sendJSON({ success: false, error: e.message }, 500);
        }
      });
    }).on('error', err => sendJSON({ success: false, error: err.message }, 502));
    return;
  }

  // POST /api/profiles/:id/client-action (Proxy config changes & actions from Web HUD)
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/client-action$/)) {
    const id = pathname.split("/")[3];
    const profiles = loadProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile || !profile.debugPort) return sendJSON({ success: false, error: "Profile offline" }, 400);

    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        let codeToRun = "";
        if (payload.type === 'set-farm-map') {
          codeToRun = `(() => {
            const map = ${JSON.stringify(payload.map)};
            window.__targetFarmMap = map;
            try { localStorage.setItem('pelican_farm_map', map); } catch(e){}
            const mapSelect = document.getElementById('p-target-map-select');
            if (mapSelect) mapSelect.value = map;
            if (typeof window.setTargetFarmMap === 'function') window.setTargetFarmMap(map);
            return { success: true };
          })()`;
        } else if (payload.type === 'toggle-auto-loop') {
          codeToRun = `(() => {
            const en = ${Boolean(payload.enabled)};
            window.__autoLoopEnabled = en;
            window.__isBotRunning = en;
            try { localStorage.setItem('pelican_auto_loop', String(en)); } catch(e){}
            try { localStorage.setItem('pelican_bot_running', String(en)); } catch(e){}
            const loopCb = document.getElementById('p-auto-loop');
            if (loopCb) loopCb.checked = en;
            if (en) {
              if (typeof window.startMasterBot === 'function') window.startMasterBot();
            } else {
              if (typeof window.stopMasterBot === 'function') window.stopMasterBot();
            }
            if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
            return { success: true, running: en };
          })()`;
        } else if (payload.type === 'toggle-auto-jump') {
          codeToRun = `(() => {
            const en = ${Boolean(payload.enabled)};
            window.__autoJumpEnabled = en;
            try { localStorage.setItem('pelican_auto_jump', String(en)); } catch(e){}
            const jumpCb = document.getElementById('p-auto-jump');
            if (jumpCb) jumpCb.checked = en;
            return { success: true };
          })()`;
        } else if (payload.type === 'walk-to-map') {
          codeToRun = `if (typeof window.startWalkToTargetMap === 'function') window.startWalkToTargetMap();`;
        } else if (payload.type === 'open-world-map') {
          codeToRun = `if (typeof window.toggleWorldMapModal === 'function') window.toggleWorldMapModal();`;
        } else if (payload.type === 'test-jump') {
          codeToRun = `if (typeof window.executeBackflipJump === 'function') window.executeBackflipJump();`;
        } else if (payload.type === 'update-archer') {
          codeToRun = `(() => {
            if (!window.__archerConfig) window.__archerConfig = {};
            Object.assign(window.__archerConfig, ${JSON.stringify(payload.config)});
            try { localStorage.setItem('pelican_archer_cfg', JSON.stringify(window.__archerConfig)); } catch(e){}
            const reqEl = document.getElementById('p-archer-req');
            if (reqEl && ${JSON.stringify(payload.config.requireArrow)} !== undefined) reqEl.checked = !!window.__archerConfig.requireArrow;
            const typeEl = document.getElementById('p-archer-type');
            if (typeEl && ${JSON.stringify(payload.config.arrowType)} !== undefined) typeEl.value = String(window.__archerConfig.arrowType);
            const qtyEl = document.getElementById('p-archer-qty');
            if (qtyEl && ${JSON.stringify(payload.config.arrowBuyQty)} !== undefined) qtyEl.value = String(window.__archerConfig.arrowBuyQty);
            const threshEl = document.getElementById('p-archer-threshold');
            if (threshEl && ${JSON.stringify(payload.config.ammoThreshold)} !== undefined) threshEl.value = String(window.__archerConfig.ammoThreshold);
            const bwingEl = document.getElementById('p-archer-bwing');
            if (bwingEl && ${JSON.stringify(payload.config.useBwing)} !== undefined) bwingEl.checked = !!window.__archerConfig.useBwing;
            const bwingQtyEl = document.getElementById('p-archer-bwing-qty');
            if (bwingQtyEl && ${JSON.stringify(payload.config.bwingBuyQty)} !== undefined) bwingQtyEl.value = String(window.__archerConfig.bwingBuyQty);
            if (typeof updateMasterBotUI === 'function') updateMasterBotUI();
            if (typeof updateAmmoHUD === 'function') updateAmmoHUD();
            return { success: true };
          })()`;
        } else if (payload.type === 'sync-ammo') {
          codeToRun = `(() => {
            if (typeof window.syncAmmoFromDOM === 'function') window.syncAmmoFromDOM();
            if (typeof window.updateAmmoHUD === 'function') window.updateAmmoHUD();
            return { ammo: window.__currentAmmo };
          })()`;
        } else if (payload.type === 'zero-ammo') {
          codeToRun = `(() => {
            window.__currentAmmo = 0;
            try { localStorage.setItem('pelican_current_ammo', '0'); } catch(e){}
            if (typeof window.updateAmmoHUD === 'function') window.updateAmmoHUD();
            return { ammo: 0 };
          })()`;
        } else if (payload.type === 'update-sell') {
          codeToRun = `(() => {
            if (!window.__sellConfig) window.__sellConfig = {};
            Object.assign(window.__sellConfig, ${JSON.stringify(payload.config)});
            try { localStorage.setItem('pelican_sell_cfg', JSON.stringify(window.__sellConfig)); } catch(e){}
            const trashEl = document.getElementById('p-sell-trash');
            if (trashEl && ${JSON.stringify(payload.config.enabled)} !== undefined) trashEl.checked = !!window.__sellConfig.enabled;
            const weightEl = document.getElementById('p-sell-weight');
            if (weightEl && ${JSON.stringify(payload.config.weightThreshold)} !== undefined) weightEl.value = String(window.__sellConfig.weightThreshold);
            const weapEl = document.getElementById('p-sell-weap');
            if (weapEl && ${JSON.stringify(payload.config.weaponRarity)} !== undefined) weapEl.value = String(window.__sellConfig.weaponRarity);
            const armorEl = document.getElementById('p-sell-armor');
            if (armorEl && ${JSON.stringify(payload.config.armorRarity)} !== undefined) armorEl.value = String(window.__sellConfig.armorRarity);
            const refEl = document.getElementById('p-sell-keep-refined');
            if (refEl && ${JSON.stringify(payload.config.keepRefined)} !== undefined) refEl.checked = !!window.__sellConfig.keepRefined;
            const specEl = document.getElementById('p-sell-keep-special');
            if (specEl && ${JSON.stringify(payload.config.keepSpecial)} !== undefined) specEl.checked = !!window.__sellConfig.keepSpecial;
            const sockEl = document.getElementById('p-sell-keep-sockets');
            if (sockEl && ${JSON.stringify(payload.config.keepSockets)} !== undefined) sockEl.checked = !!window.__sellConfig.keepSockets;
            const wlEl = document.getElementById('p-sell-whitelist');
            if (wlEl && ${JSON.stringify(payload.config.whitelist)} !== undefined) wlEl.value = String(window.__sellConfig.whitelist);
            return { success: true };
          })()`;
        } else if (payload.type === 'sort-inventory') {
          codeToRun = `if (typeof window.refreshInventoryAndWeight === 'function') window.refreshInventoryAndWeight(null, true);`;
        } else if (payload.type === 'test-sell') {
          codeToRun = `if (typeof window.executeSellTrashAtNpc === 'function') window.executeSellTrashAtNpc(true);`;
        } else if (payload.type === 'update-auth') {
          codeToRun = `(() => {
            if (!window.__authConfig) window.__authConfig = {};
            Object.assign(window.__authConfig, ${JSON.stringify(payload.config)});
            try { localStorage.setItem('pelican_auth_cfg', JSON.stringify(window.__authConfig)); } catch(e){}
            const authEn = document.getElementById('p-auth-enabled');
            if (authEn && ${JSON.stringify(payload.config.enabled)} !== undefined) authEn.checked = !!window.__authConfig.enabled;
            const authUs = document.getElementById('p-auth-user');
            if (authUs && ${JSON.stringify(payload.config.username)} !== undefined) authUs.value = String(window.__authConfig.username);
            const authPs = document.getElementById('p-auth-pass');
            if (authPs && ${JSON.stringify(payload.config.password)} !== undefined) authPs.value = String(window.__authConfig.password);
            const authCh = document.getElementById('p-auth-char');
            if (authCh && ${JSON.stringify(payload.config.charName)} !== undefined) authCh.value = String(window.__authConfig.charName || '');
            const authRes = document.getElementById('p-auth-resume');
            if (authRes && ${JSON.stringify(payload.config.autoResumeBot)} !== undefined) authRes.checked = !!window.__authConfig.autoResumeBot;
            return { success: true };
          })()`;
        } else if (payload.type === 'update-autosell') {
          codeToRun = `Object.assign(window.__autoMarketSellConfig, ${JSON.stringify(payload.config)}); try { localStorage.setItem('pelican_automarket_cfg', JSON.stringify(window.__autoMarketSellConfig)); } catch(e){} if (typeof updateMasterBotUI === 'function') updateMasterBotUI();`;
        } else if (payload.type === 'add-autosell-rule') {
          codeToRun = `if (typeof window.addAutoMarketSellRule === 'function') window.addAutoMarketSellRule(${JSON.stringify(payload.itemName || '')});`;
        } else if (payload.type === 'remove-autosell-rule') {
          codeToRun = `if (typeof window.removeAutoMarketSellRule === 'function') window.removeAutoMarketSellRule(${JSON.stringify(payload.ruleId)});`;
        } else if (payload.type === 'trigger-autosell-now') {
          codeToRun = `if (typeof window.runAutoMarketSellCycle === 'function') window.runAutoMarketSellCycle(true);`;
        } else if (payload.type === 'market-search') {
          codeToRun = `(() => {
            const kw = ${JSON.stringify(payload.keyword || '')};
            const input = document.getElementById('p-mk-keyword');
            if (input) input.value = kw;
            if (kw && typeof window.searchMarketByKeyword === 'function') {
              window.searchMarketByKeyword(kw);
            } else if (typeof window.startMarketSearch === 'function') {
              window.startMarketSearch();
            }
            return { success: true };
          })()`;
        } else if (payload.type === 'export-config') {
          codeToRun = `(typeof window.exportAllBotSettings === 'function' ? window.exportAllBotSettings() : null)`;
        } else if (payload.type === 'import-config') {
          codeToRun = `(typeof window.importAllBotSettings === 'function' ? window.importAllBotSettings(${JSON.stringify(payload.configJson)}) : { success: false, error: 'import function not available' })`;
        } else if (payload.type === 'eval' && payload.code) {
          codeToRun = payload.code;
        }

        const evalUrl = `http://127.0.0.1:${profile.debugPort}/api/eval?code=` + encodeURIComponent(codeToRun);
        http.get(evalUrl, (cRes) => {
          let d = "";
          cRes.on("data", chunk => d += chunk);
          cRes.on("end", () => {
            try { sendJSON({ success: true, result: JSON.parse(d) }); }
            catch(e) { sendJSON({ success: true, raw: d }); }
          });
        }).on('error', err => sendJSON({ success: false, error: err.message }, 502));
      } catch (err) {
        sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  
  // ==========================================
  // PLAN PROFILES & WORKFLOW BUILDER API
  // ==========================================

  // GET /api/plan-profiles (List all plan profiles & assignments)
  if (req.method === "GET" && pathname === "/api/plan-profiles") {
    const plansData = loadPlans();
    return sendJSON({
      success: true,
      profiles: plansData.profiles || [],
      assignments: plansData.assignments || {}
    });
  }

  // POST /api/plan-profiles (Create new plan profile)
  if (req.method === "POST" && pathname === "/api/plan-profiles") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const plansData = loadPlans();
        const newPlan = {
          id: "plan_" + Date.now(),
          name: (payload.name || "New Plan").trim(),
          description: payload.description || "",
          triggers: Array.isArray(payload.triggers) ? payload.triggers : [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        plansData.profiles.push(newPlan);
        savePlans(plansData);
        return sendJSON({ success: true, profile: newPlan });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // PUT /api/plan-profiles/:id (Update plan profile)
  if (req.method === "PUT" && pathname.match(/^\/api\/plan-profiles\/[^/]+$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const plansData = loadPlans();
        const idx = plansData.profiles.findIndex(p => p.id === id);
        if (idx === -1) return sendJSON({ success: false, error: "Plan profile not found" }, 404);

        plansData.profiles[idx] = {
          ...plansData.profiles[idx],
          name: payload.name !== undefined ? payload.name.trim() : plansData.profiles[idx].name,
          description: payload.description !== undefined ? payload.description : plansData.profiles[idx].description,
          triggers: Array.isArray(payload.triggers) ? payload.triggers : plansData.profiles[idx].triggers,
          updatedAt: Date.now()
        };

        savePlans(plansData);

        // Sync live to any connected game clients assigned to this plan
        const assignedClientIds = Object.keys(plansData.assignments || {}).filter(cId => plansData.assignments[cId] === id);
        if (assignedClientIds.length > 0) {
          const profiles = loadProfiles();
          const targetPlan = plansData.profiles[idx];
          assignedClientIds.forEach(cId => {
            const clientProf = profiles.find(p => p.id === cId);
            if (clientProf && clientProf.debugPort) {
              const code = `
                if (typeof window.__applyScriptPlan === 'function') {
                  window.__applyScriptPlan(${JSON.stringify(targetPlan)});
                } else {
                  window.__currentScriptPlan = ${JSON.stringify(targetPlan)};
                }
              `;
              const evalUrl = `http://127.0.0.1:${clientProf.debugPort}/api/eval?code=` + encodeURIComponent(code);
              http.get(evalUrl, () => {}).on('error', () => {});
            }
          });
        }

        return sendJSON({ success: true, profile: plansData.profiles[idx] });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // DELETE /api/plan-profiles/:id (Delete plan profile)
  if (req.method === "DELETE" && pathname.match(/^\/api\/plan-profiles\/[^/]+$/)) {
    const id = pathname.split("/")[3];
    const plansData = loadPlans();
    const idx = plansData.profiles.findIndex(p => p.id === id);
    if (idx === -1) return sendJSON({ success: false, error: "Plan profile not found" }, 404);

    plansData.profiles.splice(idx, 1);
    // Remove assignments
    if (plansData.assignments) {
      Object.keys(plansData.assignments).forEach(cId => {
        if (plansData.assignments[cId] === id) delete plansData.assignments[cId];
      });
    }

    savePlans(plansData);
    return sendJSON({ success: true });
  }

  // POST /api/plan-profiles/:id/assign (Assign plan to a client card & sync live)
  if (req.method === "POST" && pathname.match(/^\/api\/plan-profiles\/[^/]+\/assign$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const clientProfileId = payload.clientProfileId;
        if (!clientProfileId) return sendJSON({ success: false, error: "Missing clientProfileId" }, 400);

        const plansData = loadPlans();
        const plan = plansData.profiles.find(p => p.id === id);
        if (!plan) return sendJSON({ success: false, error: "Plan profile not found" }, 404);

        if (!plansData.assignments) plansData.assignments = {};
        plansData.assignments[clientProfileId] = id;
        savePlans(plansData);

        // Sync live to client if running
        const profiles = loadProfiles();
        const clientProf = profiles.find(p => p.id === clientProfileId);
        let syncedLive = false;
        if (clientProf && clientProf.debugPort) {
          const code = `
            if (typeof window.__applyScriptPlan === 'function') {
              window.__applyScriptPlan(${JSON.stringify(plan)});
            } else {
              window.__currentScriptPlan = ${JSON.stringify(plan)};
            }
          `;
          const evalUrl = `http://127.0.0.1:${clientProf.debugPort}/api/eval?code=` + encodeURIComponent(code);
          http.get(evalUrl, () => {}).on('error', () => {});
          syncedLive = true;
        }

        return sendJSON({
          success: true,
          planId: id,
          clientProfileId,
          syncedLive,
          message: syncedLive
            ? `ผูกแผน "${plan.name}" กับจอเกมและซิงค์ข้อมูลสดสำเร็จ!`
            : `ผูกแผน "${plan.name}" กับจอเกมเรียบร้อย (จะเริ่มทำงานเมื่อเปิดจอ)`
        });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // POST /api/plan-profiles/import (Import plans from JSON)
  if (req.method === "POST" && pathname === "/api/plan-profiles/import") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const plansData = loadPlans();
        let importedList = [];
        if (Array.isArray(payload)) {
          importedList = payload;
        } else if (payload && Array.isArray(payload.profiles)) {
          importedList = payload.profiles;
        } else if (payload && payload.name) {
          importedList = [payload];
        }

        let addedCount = 0;
        importedList.forEach(p => {
          if (p && p.name) {
            plansData.profiles.push({
              id: "plan_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
              name: p.name.trim(),
              description: p.description || "",
              triggers: Array.isArray(p.triggers) ? p.triggers : [],
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
            addedCount++;
          }
        });

        savePlans(plansData);
        return sendJSON({
          success: true,
          addedCount,
          profiles: plansData.profiles,
          message: `นำเข้า Plan Profiles สำเร็จ ${addedCount} รายการ!`
        });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // 9. GET /api/plans/:id
  if (req.method === "GET" && pathname.match(/^\/api\/plans\/[^/]+$/)) {
    const id = pathname.split("/")[3];
    const plans = loadPlans();
    return sendJSON({ success: true, plan: plans[id] || null });
  }

  // 10. POST /api/plans/:id
  if (req.method === "POST" && pathname.match(/^\/api\/plans\/[^/]+$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const plan = JSON.parse(body);
        const plans = loadPlans();
        plans[id] = plan;
        savePlans(plans);
        return sendJSON({ success: true, plan });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // 11. POST /api/plans/:id/apply
  if (req.method === "POST" && pathname.match(/^\/api\/plans\/[^/]+\/apply$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const plan = JSON.parse(body);
        const plans = loadPlans();
        plans[id] = plan;
        savePlans(plans);

        const profiles = loadProfiles();
        const profile = profiles.find(p => p.id === id);
        if (!profile || !profile.debugPort) {
          return sendJSON({ success: true, warning: "Profile saved, but client debugPort not found", plan });
        }

        const code = `
          if (typeof window.__applyScriptPlan === 'function') {
            window.__applyScriptPlan(${JSON.stringify(plan)});
          } else {
            window.__currentScriptPlan = ${JSON.stringify(plan)};
            console.log('[Pelican Plan] Plan loaded:', ${JSON.stringify(plan.name)});
          }
        `;
        
        try {
          await new Promise((resolve) => {
            const clientReq = http.request({
              hostname: "127.0.0.1",
              port: profile.debugPort,
              path: `/api/eval?code=${encodeURIComponent(code)}`,
              method: "GET",
              timeout: 1500
            }, (res) => {
              res.resume();
              resolve(true);
            });
            clientReq.on("error", () => resolve(false));
            clientReq.on("timeout", () => { clientReq.destroy(); resolve(false); });
            clientReq.end();
          });
        } catch (e) {}

        return sendJSON({ success: true, message: "Plan applied successfully", plan });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  
  // ==========================================
  // PRESETS & PROFILE SAVE LIST API (CENTRAL PRESET LIBRARY)
  // ==========================================

  // GET /api/presets (List all presets)
  if (req.method === "GET" && pathname === "/api/presets") {
    return sendJSON({ success: true, presets: loadPresets() });
  }

  // GET /api/presets/export (Export all presets as downloadable JSON)
  if (req.method === "GET" && pathname === "/api/presets/export") {
    const presets = loadPresets();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="aetheria_profiles_presets.json"'
    });
    return res.end(JSON.stringify(presets, null, 2));
  }

  // POST /api/presets (Create or update single preset)
  if (req.method === "POST" && pathname === "/api/presets") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const presets = loadPresets();
        const id = data.id || ("preset_" + Date.now());
        const existingIdx = presets.findIndex(p => p.id === id);

        // Sanitize auth config (strictly exclude username & password)
        const safeCfg = Object.assign({}, data.config || {});
        if (safeCfg.authConfig) {
          safeCfg.authConfig = {
            enabled: !!safeCfg.authConfig.enabled,
            autoResumeBot: safeCfg.authConfig.autoResumeBot !== false,
            charName: safeCfg.authConfig.charName || ''
          };
        }

        const presetItem = {
          id: id,
          name: (data.name || "โปรไฟล์ส่วนกลาง").trim(),
          description: data.description || "",
          updatedAt: Date.now(),
          createdAt: existingIdx >= 0 ? presets[existingIdx].createdAt : Date.now(),
          config: safeCfg
        };

        if (existingIdx >= 0) {
          presets[existingIdx] = presetItem;
        } else {
          presets.unshift(presetItem);
        }
        savePresets(presets);
        return sendJSON({ success: true, preset: presetItem });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // POST /api/presets/import (Import 1 or multiple profiles/presets)
  if (req.method === "POST" && pathname === "/api/presets/import") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        let payload = JSON.parse(body);
        let itemsToImport = [];

        if (Array.isArray(payload)) {
          itemsToImport = payload;
        } else if (Array.isArray(payload.presets)) {
          itemsToImport = payload.presets;
        } else if (payload.config) {
          itemsToImport = [payload];
        } else if (payload.sellConfig || payload.archerConfig) {
          // Direct exported config object
          itemsToImport = [{
            name: payload.name || "โปรไฟล์นำเข้าส่วนกลาง",
            description: payload.description || "นำเข้าจากการตั้งค่าเดี่ยว",
            config: payload
          }];
        }

        if (itemsToImport.length === 0) {
          return sendJSON({ success: false, error: "ไม่พบข้อมูลโปรไฟล์ที่สามารถนำเข้าได้" }, 400);
        }

        const presets = loadPresets();
        let importedCount = 0;

        itemsToImport.forEach(item => {
          const cfg = item.config || item;
          // Sanitize
          const safeCfg = Object.assign({}, cfg);
          if (safeCfg.authConfig) {
            safeCfg.authConfig = {
              enabled: !!safeCfg.authConfig.enabled,
              autoResumeBot: safeCfg.authConfig.autoResumeBot !== false,
              charName: safeCfg.authConfig.charName || ''
            };
          }

          const newPreset = {
            id: "preset_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
            name: (item.name || payload.name || "โปรไฟล์นำเข้าส่วนกลาง").trim(),
            description: item.description || "นำเข้าเมื่อ " + new Date().toLocaleString('th-TH'),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            config: safeCfg
          };
          presets.unshift(newPreset);
          importedCount++;
        });

        savePresets(presets);
        return sendJSON({ success: true, count: importedCount, presets });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // DELETE /api/presets/:id (Delete preset)
  if (req.method === "DELETE" && pathname.match(/^\/api\/presets\/[^/]+$/)) {
    const id = pathname.split("/")[3];
    let presets = loadPresets();
    presets = presets.filter(p => p.id !== id);
    savePresets(presets);
    return sendJSON({ success: true });
  }

  // POST /api/presets/:id/apply (Copy to specified profiles)
  if (req.method === "POST" && pathname.match(/^\/api\/presets\/[^/]+\/apply$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const targetIds = Array.isArray(data.targetProfileIds) ? data.targetProfileIds : [];
        const presets = loadPresets();
        const preset = presets.find(p => p.id === id);
        if (!preset) return sendJSON({ success: false, error: "Preset not found" }, 404);

        const profiles = loadProfiles();
        const appliedProfiles = [];

        for (const pId of targetIds) {
          const profile = profiles.find(p => p.id === pId);
          if (!profile) continue;

          // 1. Update targetMap in profile
          if (preset.config?.targetMap) {
            profile.targetMap = preset.config.targetMap;
          }
          appliedProfiles.push(profile.name || profile.id);

          // 2. If running, send importAllBotSettings via debugPort
          if (profile.debugPort) {
            const codeToRun = `(() => {
              if (typeof window.importAllBotSettings === 'function') {
                return window.importAllBotSettings(${JSON.stringify(preset.config)});
              } else {
                return { success: false, error: 'importAllBotSettings not ready' };
              }
            })()`;

            try {
              await new Promise((resolve) => {
                const clientReq = http.request({
                  hostname: "127.0.0.1",
                  port: profile.debugPort,
                  path: `/api/eval?code=${encodeURIComponent(codeToRun)}`,
                  method: "GET",
                  timeout: 2000
                }, (res) => {
                  res.resume();
                  resolve(true);
                });
                clientReq.on("error", () => resolve(false));
                clientReq.on("timeout", () => { clientReq.destroy(); resolve(false); });
                clientReq.end();
              });
            } catch(e) {}
          }
        }

        saveProfiles(profiles);
        return sendJSON({
          success: true,
          appliedCount: appliedProfiles.length,
          appliedProfiles: appliedProfiles,
          message: `คัดลอกการตั้งค่า "${preset.name}" ไปยัง ${appliedProfiles.length} โปรไฟล์เรียบร้อยแล้ว`
        });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
    });
    return;
  }

  // POST /api/profiles/:id/save-as-preset (Save current profile config as a preset)
  if (req.method === "POST" && pathname.match(/^\/api\/profiles\/[^/]+\/save-as-preset$/)) {
    const id = pathname.split("/")[3];
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const profiles = loadProfiles();
        const profile = profiles.find(p => p.id === id);
        if (!profile) return sendJSON({ success: false, error: "Profile not found" }, 404);

        let liveConfig = null;
        if (profile.debugPort) {
          try {
            liveConfig = await new Promise((resolve) => {
              const clientReq = http.request({
                hostname: "127.0.0.1",
                port: profile.debugPort,
                path: `/api/eval?code=${encodeURIComponent("typeof window.exportAllBotSettings === 'function' ? window.exportAllBotSettings() : null")}`,
                method: "GET",
                timeout: 2500
              }, (res) => {
                let d = "";
                res.on("data", c => d += c);
                res.on("end", () => {
                  try {
                    const parsed = JSON.parse(d);
                    resolve(parsed?.result?.data || parsed?.result || null);
                  } catch(e) { resolve(null); }
                });
              });
              clientReq.on("error", () => resolve(null));
              clientReq.on("timeout", () => { clientReq.destroy(); resolve(null); });
              clientReq.end();
            });
          } catch(e) {}
        }

        // Fallback default config if client offline
        const finalConfig = liveConfig || {
          targetMap: profile.targetMap || "ซากโบราณสถาน Lv.45–55",
          autoLoop: true,
          sellConfig: { enabled: true, weightCheckEnabled: true, weightThreshold: 80, sellMaterials: true },
          archerConfig: { requireArrow: true, arrowType: 90030, arrowBuyQty: 200, ammoThreshold: 50 },
          authConfig: { enabled: true, autoResumeBot: true, charName: "" }
        };

        const presets = loadPresets();
        const newPreset = {
          id: "preset_" + Date.now(),
          name: (data.name || (`เซฟจาก ${profile.name}`)).trim(),
          description: data.description || (`ดึงการตั้งค่าจากโปรไฟล์ "${profile.name}" เมื่อ ` + new Date().toLocaleString('th-TH')),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          config: finalConfig
        };
        presets.unshift(newPreset);
        savePresets(presets);

        return sendJSON({ success: true, preset: newPreset });
      } catch (err) {
        return sendJSON({ success: false, error: err.message }, 400);
      }
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
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`========================================================`);
  console.log(`🚀 [Pmhee Ma weaw] Running on http://127.0.0.1:${PORT}`);
  console.log(`📁 Sessions directory: ${SESSIONS_DIR}`);
  console.log(`🎮 Game executable: ${GAME_EXE}`);
  console.log(`========================================================`);
});
