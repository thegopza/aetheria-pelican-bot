# AI Agent Guidelines & Repository Workflow Rules

## PmheeAether ownership / authorized use

PmheeAether เป็นซอฟต์แวร์ที่ใช้งานผ่าน Manager ตามสิทธิ์ที่เจ้าของอนุญาต การบำรุงรักษาและทดสอบโดยเจ้าของหรือผู้ที่ได้รับอนุญาตทำได้ ห้าม extract, redistribute หรือแก้เพื่อ bypass สิทธิ์หรือการนับการใช้งานโดยไม่ได้รับสิทธิ์จากเจ้าของ ข้อความนี้เป็น ownership/usage notice ไม่ได้อ้างว่า AI ทุกระบบบังคับได้ หรือว่า client ที่รันในเครื่องป้องกัน memory extraction ได้สมบูรณ์

ชุดเปลี่ยนผ่านอยู่ `security/` และ source รุ่นใหม่อยู่ private API repo `protected-script/` เท่านั้น ห้ามซิงค์ source/payload รุ่นใหม่เข้า repo สาธารณะ, `manager/public/`, release ZIP หรือโฟลเดอร์เกม ใช้ builder ที่ปัก public verification keys และสร้างผลลัพธ์นอก repo สาธารณะก่อนทดสอบ ส่วน `bot.js` สาธารณะเป็น compatibility snapshot (ดูเวอร์ชันจริงจาก PELICAN_BOT_VERSION) จน Manager/Server/pilot พร้อม ห้ามสลับตัวโหลดหรือเปิด billing/enforcement อัตโนมัติเพียงเพราะ commit ชุด preparation แล้ว

เอกสารข้อกำหนดและแนวทางการทำงานสำหรับ AI Coding Assistant และผู้พัฒนาในโปรเจกต์ **Aetheria PmheeAether Bot**
(`AGENTS.md` และ `agent.md` ต้องมีเนื้อหาเหมือนกันเสมอ — แก้ไฟล์หนึ่งต้องคัดลอกไปอีกไฟล์ด้วย)

ตอบผู้ใช้เป็น **ภาษาไทย** เสมอ (ชื่อไฟล์ โค้ด และชื่อสเตตัสในเกม เช่น DEX/MATK ใช้ภาษาอังกฤษได้)

**ชื่อแบรนด์คือ `PmheeAether`** (เดิมชื่อ Pelican) — ข้อความที่ผู้ใช้เห็น (log `[PmheeAether ...]`, หัวข้อ, คู่มือ) ใช้ชื่อนี้
แต่ **ห้ามเปลี่ยนชื่อภายในที่ยังใช้คำว่า pelican** เพราะจะทำให้ของเดิมพัง:
- คีย์ localStorage `pelican_*` (เก็บการตั้งค่าทุกจอ เช่น `pelican_auth_cfg`, `pelican_sell_cfg`) และ id/class `pelican-hud`, `pelican-data-modal` ฯลฯ
- ชื่อ repo GitHub `thegopza/aetheria-pelican-bot` (ลิงก์ที่ตัวโหลดเกมและระบบอัปเดตใช้)
- `PelicanManager.exe` (ข้อความใน tray ถูก compile ไว้ในไฟล์ .exe ไม่มี source ใน repo), โฟลเดอร์ `release/Pelican_Manager_v4.3/`, `Start_Pelican.bat`
- ชื่อตัวแปร/ฟังก์ชันภายใน เช่น `PELICAN_BOT_VERSION`, `window.applyPelicanSettings`, `PELICAN_SERVER_CHILD`

---

## 📌 1. กฎเหล็ก: ทุกการแก้ไขต้อง Commit + Push ขึ้น GitHub

ทุกครั้งที่แก้โค้ด แก้บั๊ก หรือเพิ่มฟีเจอร์ — เมื่อทดสอบเสร็จแล้ว **ห้ามค้างไว้แค่ใน Local**:

1. `node -c <file>` ทุกไฟล์ JavaScript ที่แก้ ก่อน commit
2. `git fetch` → `git status` → `git diff` ตรวจว่ามีอะไรเปลี่ยนบ้าง
3. **Stage เฉพาะไฟล์ของงานตัวเองแบบระบุชื่อไฟล์** — ห้ามใช้ `git add -A` / `git add .`
   (อาจมีหลายเซสชันทำงานพร้อมกัน ถ้าเจอการแก้ไขที่ไม่ใช่ของเรา ห้าม commit ทับหรือกวาดรวมไปด้วย)
4. `git commit` ด้วยข้อความสื่อความหมาย (ถ้าแก้ `bot.js` ให้ใส่เวอร์ชันใหม่ในข้อความ เช่น `feat(bot): ... (v4.4.0)`)
5. `git push origin main`
6. ห้าม commit ไฟล์ชั่วคราว (`scratch/`, logs, session files, `manager/data/portraits/`, `manager/data/bot_update_state.json`) — ให้อยู่ใน `.gitignore`

---

## 🔢 2. เลขเวอร์ชันบอท (ต้องอัปทุกครั้งที่แก้ bot.js)

- เวอร์ชันของบอทมี **ที่เดียว**: ค่าคงที่ `PELICAN_BOT_VERSION` ด้านบนของ `bot.js`
  (ชื่อ HUD, ไฟล์ export config และ `window.__pelicanBotVersion` ดึงจากค่านี้ทั้งหมด)
- ต้องแก้บรรทัด `// @version` ใน header ของ `bot.js` ให้ตรงกันด้วย
- หลักการขึ้นเลข (SemVer):
  - `x.y.Z` (patch) — แก้บั๊ก / ปรับเล็กน้อย
  - `x.Y.0` (minor) — เพิ่ม/เอาฟีเจอร์ออก, เปลี่ยน UI
  - `X.0.0` (major) — เปลี่ยนโครงสร้างใหญ่หรือ config เดิมใช้ไม่ได้
- ห้ามเขียนเลขเวอร์ชันซ้ำหลายที่แบบ hardcode อีก
- เวอร์ชันของ **Manager** (`v4.3.0` ใน `manager/public/index.html`) และชื่อโฟลเดอร์ release `Pelican_Manager_v4.3` เป็นของตัว Manager แยกจากเวอร์ชันบอท

---

## 🔄 3. การส่งอัปเดตบอทไปยังเกมที่เปิดอยู่

**โหมดปัจจุบัน owner-host/private protocol2:** อ่าน docs/BOT_UPDATE_GUIDE.md การ push public bot.js อย่างเดียวไม่ส่ง private release; ขั้นตอน GitHub bot.js ด้านล่างใช้เฉพาะ compatibility/legacy อย่าคัดลอก private payload ตามกฎ sync ของ compatibility

- ตัวโหลดเกม (`main.js`) ดึง `bot.js` ล่าสุดจาก GitHub (`raw.githubusercontent.com/.../main/bot.js`) **ทุกครั้งที่หน้าเกมโหลด**
- Manager มีระบบ Auto-update (`manager/bot_auto_update.js`): เช็ก GitHub ทุก 5 นาที → รอ CDN ส่งไฟล์ใหม่จริง (เทียบ git blob sha) → รีเฟรชเกมทีละจอเฉพาะตอนปลอดภัย → ให้บอทกลับมาฟาร์มต่อ
- ดังนั้นเมื่อแก้ `bot.js` แล้ว **push ขึ้น GitHub = จอเกมที่เปิดอยู่จะอัปเดตเอง** (ดูสถานะ/เวอร์ชันแต่ละจอได้ที่ปุ่ม "Auto-update" บนแถบด้านบนของ Manager)
- **ห้าม hot-inject `bot.js` ทั้งไฟล์เข้าเกมที่รันอยู่** (เช่น `scratch/hot_reload_game.js`) — setInterval ของบอทจะซ้อนกันหลายชุด ถ้าจำเป็นให้ inject เฉพาะฟังก์ชันเล็กๆ ที่แยกอิสระ หรือใช้การรีเฟรชหน้าแทน
- สถานะที่ "ห้ามรีเฟรชแทรก" อยู่ใน `CLIENT_PROBE_JS` ของ `bot_auto_update.js` — ถ้าเพิ่มสถานะ busy ใหม่ใน bot.js (เช่น `window.__isXxx = true`) ให้เพิ่มในรายการนี้ด้วย

### 3.0 โหมดเบราว์เซอร์ (`manager/browser_mode.js`, settings.launchMode = 'browser')

- Manager เปิด Chrome/Edge 1 ตัว (โปรไฟล์แยก `sessions/_browser`, `--remote-debugging-port=9339`, ปิด timer throttling) แต่ละโปรไฟล์ = 1 หน้าต่าง คุมผ่าน Chrome DevTools Protocol
- แต่ละโปรไฟล์มี proxy บน `debugPort` เดิม (`/api/eval`, `/api/state`, `/api/window`) หน้าตาเหมือน Electron loader → ส่วนอื่นของ Manager ใช้ได้เหมือนเดิม; ใส่บอทเองทุกครั้งที่หน้า play โหลด (GitHub → สำรองไฟล์ในเครื่อง)
- ทุกหน้าต่างใช้ localStorage ร่วมกัน → Manager ตั้ง `window.__pmProfileId` ก่อนหน้าเว็บรัน และ bot.js แยกคีย์ `pelican_*` เป็น `pelican_<profileId>__*` (Electron ไม่มี `__pmProfileId` จึงไม่เปลี่ยน) — เกมไม่ได้เก็บ token login ใน localStorage จึงล็อกอินหลายบัญชีในเบราว์เซอร์เดียวได้
- ปิด/เปิดจอในโหมดนี้ห้าม taskkill (จะปิดทุกจอ) ใช้ `browserMode.stop(id)` (Target.closeTarget)

### 3.1 การอัปเดตตัว Manager เอง (`manager/manager_self_update.js`)

- PelicanManager.exe (.NET launcher) รัน `node server.js` และผูก process ไว้กับ Job Object แบบ kill-on-close → **ถ้าปิด/รีสตาร์ท PelicanManager.exe จอเกมทุกจอจะปิดตาม**
- ส่วนบนสุดของ `server.js` คือ **supervisor**: process ที่ launcher เห็นจะรัน server จริงเป็น child (`PELICAN_SERVER_CHILD=1`)
  - child ออกด้วย exit code `75` = supervisor เปิด server ใหม่ (จอเกมไม่ปิด เพราะเกมถูก spawn แบบ detached)
  - ถ้า server ใหม่เปิดไม่ขึ้นหลังอัปเดต supervisor จะคืนไฟล์จาก `data/update_backup/` อัตโนมัติ และจำเวอร์ชันที่พังไว้ (`data/manager_update_failed.json`)
  - **ห้ามเพิ่มโค้ดไว้เหนือบล็อก supervisor** และห้ามลบบล็อกนี้
- **โหมด release** (ไม่มีโฟลเดอร์ `.git`): เช็ก GitHub ทุก 10 นาที เทียบไฟล์ใน `manager/` ทีละไฟล์ด้วย git blob sha → ดาวน์โหลดเฉพาะไฟล์ที่เปลี่ยน (ไม่แตะ `profiles/plans/presets/settings.json`, `data/`, `sessions/`) → สำรองไฟล์เก่า → รีสตาร์ท server ถ้ามีไฟล์ฝั่ง server เปลี่ยน
- **โหมด git** (เครื่องนักพัฒนา): ไม่ดาวน์โหลดทับไฟล์ในเครื่อง — เมื่อไฟล์ฝั่ง server ใน `manager/` ถูก **commit แล้วและ syntax ผ่าน** จะรีสตาร์ท server ให้เองภายใน ~30 วินาที (ไฟล์ที่ยังไม่ commit จะไม่ทำให้รีสตาร์ท)
- หน้าเว็บ Manager ที่เปิดอยู่จะโหลดหน้าใหม่เองเมื่อไฟล์ใน `public/` เปลี่ยนหรือ server รีสตาร์ท (เลื่อนไปก่อนถ้าผู้ใช้กำลังพิมพ์/เปิดหน้าต่างค้าง)
- จะไม่รีสตาร์ทระหว่างที่ Auto-update กำลังรีเฟรชเกม หรือระบบรวมเงิน (`consolidationState.running`) ทำงานอยู่
- สิ่งที่ **ไม่** อัปเดตอัตโนมัติ: ตัว `PelicanManager.exe`, `bin/node.exe`, และ `main.js` (ตัวโหลดในโฟลเดอร์เกม — ต้องติดตั้งใหม่ผ่านปุ่ม "สคริปต์เกม")

---

## 📦 4. ซิงค์ไฟล์ให้ครบทุกจุด (Multi-Location Sync)

- แก้ `bot.js` → ซิงค์ไปที่ `bot.js` (root), `manager/public/bot.js`, `release/Pelican_Manager_v4.3/bot.js`, `release/Pelican_Manager_v4.3/manager/public/bot.js` และโฟลเดอร์เกม `%LOCALAPPDATA%\Programs\Aetheria Online\resources\bot.js`
  (ใช้ `node scratch/sync_all_files.js` ได้ — สคริปต์นี้ซิงค์ bot.js / server.js / app.js และเช็ก syntax ให้)
- แก้/เพิ่มไฟล์ใน `manager/` → คัดลอกไปที่ `release/Pelican_Manager_v4.3/manager/` ด้วย (ไฟล์ใหม่ต้องคัดลอกเองทุกไฟล์)
- แก้ `main.js` (ตัวโหลดเกม) → คัดลอกไป `manager/game_loader/main.js` และ `release/Pelican_Manager_v4.3/main.js` ด้วย (เครื่องที่ใช้ zip ได้ไฟล์ใหม่ผ่าน Manager self-update เฉพาะใน `manager/` — ปุ่ม "สคริปต์เกม" ติดตั้งจาก `manager/game_loader/main.js`) และขึ้นเลข `version` ใน `package.json` + `installer.js` — มีผลเมื่อปิด-เปิดจอเกมใหม่เท่านั้น
- **ตัวติดตั้งสคริปต์เกม** (`manager/installer.js`): เกมอาจติดตั้งที่ `%LOCALAPPDATA%Programs` หรือ `C:Program Files` (หาจาก registry ได้) — ต้องเช็กว่ามี `Aetheria Online.exe` ก่อนติดตั้งเสมอ (ห้ามสร้างโฟลเดอร์ใหม่แล้วบอกว่าสำเร็จ), ต้องเปลี่ยนชื่อ `resources/app.asar` → `app.asar.disabled` (ถ้ายังมี app.asar เกมจะไม่โหลดตัวโหลดของเรา = ECONNREFUSED), Program Files ต้องขอสิทธิ์ผ่าน UAC (`installScriptAsync`) และปุ่มเปิดจอต้องเช็ก `gameLaunchProblem()` ก่อน
- ทุกครั้งที่ release เปลี่ยน ต้องบีบอัด `release/Pelican_Manager_v4.3.zip` ใหม่
  - ไฟล์ zip มักถูกโปรแกรมอื่นล็อก (`user-mapped section open`) → ให้ `Compress-Archive` ไปที่โฟลเดอร์ชั่วคราวก่อน ตรวจว่าเปิดได้ แล้วค่อย `Copy-Item` ทับ และเทียบ hash
- แก้ `manager/server.js` หรือไฟล์ฝั่ง server → commit แล้ว Manager จะรีสตาร์ท server เอง (ดูข้อ 3.1) — **ไม่ต้องให้ผู้ใช้ปิด-เปิด PelicanManager.exe** (การทำแบบนั้นจะปิดจอเกมทั้งหมด)
- แก้แค่ `manager/public/*` → หน้าเว็บโหลดใหม่เอง (bump `?v=` ใน `index.html` ด้วย)

---

- **อ่านข้อความจาก HTTP ต้อง `setEncoding('utf8')` ก่อน `+= chunk` เสมอ** (หรือเก็บ Buffer แล้ว `Buffer.concat`) — ตัวอักษรไทย 3 ไบต์ที่ถูกตัดคร่อม chunk จะกลายเป็น U+FFFD (เคยทำให้ bot.js ที่โหลดจาก GitHub เพี้ยน ~200 ตัวอักษร); server.js ตั้ง `req.setEncoding` ไว้ต้น handler แล้ว

## 👥 ทีม Agent ของโปรเจกต์ (`.claude/agents/`)

| Agent | หน้าที่ |
|---|---|
| `aetheria-bot-dev` | แก้/เพิ่มโค้ดใน bot.js (แผน, ขาย/ซื้อ, เดินทาง, ตีบวก) |
| `aetheria-manager-dev` | แก้/เพิ่ม Manager (server.js และหน้าเว็บ) |
| `aetheria-game-probe` | อ่านข้อมูลจากจอเกมจริงแบบอ่านอย่างเดียว เพื่อหาสาเหตุปัญหา |
| `aetheria-tester` | เขียน/รันเทสต์ (harness จาก bot.js, Manager ทดสอบพอร์ต 3899 + ภาพหน้าจอ) |
| `aetheria-reviewer` | ตรวจบัค การทำซ้ำ/ซื้อซ้ำ และการทับซ้อนกับระบบอื่น ก่อน commit (ไม่แก้ไฟล์) |
| `aetheria-release` | ซิงค์ไฟล์ทุกจุด, zip, commit เฉพาะไฟล์ของงาน, push |

ลำดับงานปกติ: (probe ถ้าเป็นบัคจากจอจริง) → dev → tester → reviewer → แก้ตามรีวิว → release

## 🧪 5. การทดสอบอย่างปลอดภัย

- ผู้ใช้มักเปิดเกมอยู่หลายจอ (debug port 49876–49880) และ Manager จริงรันที่พอร์ต 3888 — **ห้ามปิด/รีสตาร์ท PelicanManager.exe หรือ Manager จริงเอง** (จะปิดจอเกมที่เปิดผ่าน Manager)
- ทดสอบ Manager ด้วยการคัดลอก `manager/` ไปโฟลเดอร์ชั่วคราว เปลี่ยน `PORT` เป็น 3899 แล้วรันแยก
  - ในสำเนาทดสอบให้ **ปิด Auto-update** (`data/bot_update_state.json` และ `data/manager_update_state.json` → `{"enabled": false}`) ไม่งั้นจะไปรีเฟรชเกมจริง / ดาวน์โหลดไฟล์ทับสำเนา
  - สำเนาทดสอบที่ไม่มี `.git` จะทำงานแบบ release mode (เทียบกับ GitHub) — `server.js` จาก GitHub ใช้พอร์ต 3888 ซึ่งชนกับ Manager จริง
- **ส่งคำสั่ง/ข้อมูลเข้าเกมจาก Manager ต้องใช้ `evalProfilePort` (POST) เสมอ** — ห้ามใส่ config/แผน/whitelist ลงใน URL (`/api/eval?code=`) เพราะข้อความไทยที่ encode แล้วยาวเกินขีดจำกัด URL ทำให้ส่งไม่ถึงเกมแบบเงียบๆ และต้องเช็กคำตอบของเกม (`result.result.success`) ก่อนบอกผู้ใช้ว่าสำเร็จ
- อ่านข้อมูลจากเกมผ่าน `POST http://127.0.0.1:<debugPort>/api/eval` ได้ (คืนค่า Promise ได้)
- **ห้ามทำ action ที่ย้อนกลับไม่ได้กับของจริงของผู้ใช้โดยไม่ได้รับอนุญาต** เช่น ลงขายตลาด, ซื้อ, ทิ้งไอเทม, เทรด — ทดสอบได้แค่การอ่านข้อมูล หรือ action ที่ย้อนกลับได้ (เช่น ล็อค→ปลดล็อค)
- หน้า UI ทดสอบด้วย headless Chrome (`--screenshot`) แล้วตรวจภาพจริงทุกครั้งก่อนส่งงาน

---

## 🎮 6. สถาปัตยกรรมและกฎของระบบ PmheeAether Bot

1. **Plan Script Engine**:
   - ⚠️ **โค้ด Plan Script อยู่นอก IIFE หลักของ bot.js** (IIFE หลักจบราว ๆ บรรทัด 11700) — ฟังก์ชันของ IIFE หลักที่ต้องใช้ในส่วนแผนต้อง export เป็น `window.xxx` ก่อน (เช่น `window.getCurrentMapName`, `window.restoreFarmMapAfterJobChange`) ชื่อเปล่าๆ จะเป็น undefined (เคยทำให้วนเดินเข้าเมืองไม่จบ) — test harness ห้ามส่งฟังก์ชันพวกนี้เป็นตัวแปรเปล่าให้
   - **Master Switch**: `window.__planScriptEnabled` มีค่าเริ่มต้นเป็น `false` เสมอ
   - ระบบตั้งค่าพิเศษ (เช่น ระยะล่าทั้งแมพ `huntRadiusTiles: 'all'`, ติ๊ก Auto สกิล, ปิดประกาศบนจอ, ปิดหน้าต่างข่าวสาร) ต้องทำงานภายใต้เงื่อนไข `window.__planScriptEnabled && window.__currentScriptPlan` เท่านั้น
   - ห้ามรบกวนหรือทับการตั้งค่าของตัวละครฟาร์มปกติที่ไม่ได้เปิด Plan Script
   - **ทำงานเฉพาะตอน START BOT** (`window.__isBotRunning`): Trigger, อัปสกิล/สเตตัส และเปลี่ยนอาชีพของแผน ห้ามทำงานตอนบอทหยุด และห้ามทำระหว่างระบบอื่นยุ่งอยู่ (`planBusyReason`: เดินไปแมพ/ซื้อของ/ฟื้นตัว/รวมเงิน/เปลี่ยนอาชีพ/ขายของ)
   - **Trigger แบบ "ข้ามผ่านเลเวล"**: ทำเมื่อ `lastLevel < target <= currentLevel` (ไม่ใช่เลเวลตรงเป๊ะ) และเก็บสถานะแยกต่อ ตัวละคร+แผน ใน `pelican_plan_state_<char>_<planId>` (`done`/`pending`) — Action ที่ยังไม่สำเร็จจะลองใหม่ทุก 60 วิ (ใส่ของยอมแพ้หลัง 30 นาที)
   - Action `sell_trip` (🛒 กลับไปขายของ 1 รอบ): เรียก `executeAutoShopRoutine()` ครั้งเดียว (ถ้าถูกปฏิเสธเพราะ cooldown/กำลังเดิน จะลองใหม่ทุก 4 วิ) เสร็จเมื่อ `__isShopping` กลับเป็น false
   - Action `weight_scroll` (📦 Weight Limit Scroll itemId 90309, ใช้ได้ 10 ครั้ง/ตัวละคร): ใช้ของในกระเป๋าก่อน (เกมมีคูลดาวน์ ~3 วิระหว่างใช้ → เว้น 3.5 วิ) นับครั้งที่จำนวนในกระเป๋าลด หรือ `inventory.weightLimit` เพิ่ม (+500/ครั้ง) ใน `pelican_weight_scroll_v2_<char>`; ถือว่าครบโควตาเมื่อเกมปฏิเสธ 3 ครั้งติดกันที่เว้นเกินคูลดาวน์เท่านั้น; ไม่พอ → กลับเมือง → `planBuyFromNpcShop` เปิดร้าน NPC ทีละร้าน (ร้านลูกธนูก่อน) หาแถวที่ React key = itemId แล้ว `shop_buy_many {lines:[{itemId, qty}]}` (เช็คราคา × จำนวน กับเงินก่อน)
   - **จำนวน Weight Limit Scroll ที่ใช้ไปแล้ว ดูจากเกมเอง** (`window.getWeightScrollsUsed()`): น้ำหนักสูงสุด = 2000 + 30 × (STR + bonus STR) + 500 × ครั้งที่ใช้ (ตรงทุกตัวที่ตรวจ) — ห้ามเชื่อตัวนับใน localStorage อย่างเดียว (หายเมื่อย้ายไปโหมดเบราว์เซอร์ → เคยซื้อซ้ำ 10 อันที่ใช้ไม่ได้); ถ้าคำนวณไม่ได้ (เช่น Merchant มีสกิล Pack Mule `enlarge-weight`) ให้ซื้อทีละ 1 อันเป็นตัวทดสอบ
   - **เซ็ตอุปกรณ์ของแผน** (`plan.gearPlan = {startClass, steps}`, หน้าเว็บ `manager/public/gear_builder.js`, ข้อมูลไอเทมจาก `GET /api/game-items` = `/wiki-data` ของเกม): บอท (`window.runGearPlanStep`) ทำทีละรายการตามลำดับ เมื่อเงิน ≥ ที่ตั้ง และอาชีพอยู่ในสายของ `startClass`; สถานะ "เสร็จ" เช็คจากของที่สวมจริงทุกครั้ง (ชื่อ + ออปชั่นสุ่ม / ระดับตีบวก); equip = กระเป๋า → ตลาด (ราคาไม่เกินเงินที่ตั้ง, จำการซื้อไว้ 30 นาทีกันจ่ายซ้ำ, รออาชีพที่ใส่ได้จาก `step.jobs`); refine = คุยกับ NPC ชื่อ Blacksmith → ตัวเลือก "ตีบวก" → ข้อความ `refine` {items:[{source,to,onFail,material,zeny}]} → `room.send('refine',{source, blessing})` → `refine_result`; ขั้นที่อาจแตกจะไม่ตีถ้าไม่มี Blessing (เว้นแต่ผู้เล่นเอาติ๊ก Blessing ออก); ทุกทางที่ล้มเหลวต้องเว้นระยะ + กลับแมพฟาร์ม (`pelican_gear_trip` อยู่ใน localStorage เผื่อรีเฟรชระหว่างทาง); `__isGearRefining` อยู่ใน `planBusyReason` และ `CLIENT_PROBE_JS`
   - **หินตีบวก** (จาก wiki ของเกม): อาวุธ (main-hand) = Phracon 90201 (+1~4) / Emveretarcon 90202 (+5~7) / Oridecon 90203 (+8~10), ที่เหลือ = Rough Elunium 90204 / Elunium 90205 / Enriched Elunium 90206 — Blacksmith Enok (เมืองหลวง n3) ขายเฉพาะขั้นต้น 200 z; บอทซื้อจากตลาดก่อนเดินเข้าเมือง (`gearBuyOreMarket`): ถูกสุดต่อก้อนก่อน, ไม่เกิน 5 ก้อน/รอบ (และไม่เกิน 2 × ขั้นที่เหลือในช่วงหินนั้น), ไม่แพงกว่าร้าน NPC / 2 เท่าของราคาถูกสุด, ค้นได้ 5 หน้า, เก็บเงินค่าตีบวกไว้ (ค่าตีบวก + ชนิดหินจริงจำจากหน้าต่างตีบวกใน `pelican_gear_refine_seen_*`); หิน/Blessing ที่แผนยังต้องใช้อยู่ใน `window.__gearKeepItemIds` — ระบบขาย NPC และลงตลาดต้องข้ามเสมอ
   - **เซ็ตอุปกรณ์: เลเวล / เจม / การ์ด / แมพเมื่อครบ**: ทุกรายการมี `minLevel` (Base Lv.) คู่กับ `zeny`; ช่อง `gem-1..4` — เจมนับทุกช่อง เจมชื่อเดียวกัน % สูงกว่าถือว่าผ่าน ใส่ด้วย `gemTargetSlot` (ช่องของ % ต่ำกว่า ไม่งั้นช่องว่าง); รายการ `kind: 'card'` {slot, itemName, cardId, cardName} = `room.send('card_insert', {card: bagSlot, target: {kind: 'equip', slot}})` (ถอดเองไม่ได้ — ทำเมื่อไอเทมมีช่องว่างเท่านั้น, การ์ดใบเดียวกันหลายใบ = หลายรายการ นับจาก `item.cards`), ไม่มีในกระเป๋า = ซื้อในตลาดราคาไม่เกิน `zeny` (ตัวกันจ่ายซ้ำเดียวกับ equip), การ์ดที่รอใส่อยู่ใน `isGearKeptItem`; `gearPlan.onCompleteMap` = เปลี่ยนแมพฟาร์มครั้งเดียวต่อตัวละคร+แผน+แมพ เมื่อทุกรายการเสร็จ (`planMapForNow` ยอมรับแมพนี้และแมพที่ผู้เล่นเลือกเองใน HUD ระหว่างเปิดแผน)
   - **ขั้นตอนในตัวทุกแผน: รับสัตว์เลี้ยง Event** (`runEventPetStep`, `plan.eventPet` ค่าเริ่มต้นเปิด): Base ≥ 15 → กลับเมือง (จำแมพฟาร์มไว้คืน) → `npc_talk` Event Lily (หาจากชื่อ ตอนนี้ n10) → ตัวเลือกที่มีคำว่า "รับ" → `inv_use` Orc Cub Egg (itemId 90334) — ครั้งเดียวต่อตัวละคร (`pelican_event_pet_<char>`) ข้ามถาวรถ้ารับไปแล้วหรือไม่มี NPC
   - **เจม**: ชื่อบอกระดับเป็น % (`Mana Gem (Skill) 3%` < `5%`) ใส่ในช่อง `gem-1..4` — ใส่ลงช่องที่ต้องการด้วย `equip {slot, to: 'gem-N'}` (ทดสอบกับเกมจริงแล้ว ของเดิมกลับเข้ากระเป๋า); `autoUpgradeGems` (ค่าเริ่มต้นเปิด) และ action สวมใส่เจมจะไม่เปลี่ยนกลับไปเป็น % ที่ต่ำกว่า
   - **คุยกับ NPC ในแมพเดียวกันไม่ต้องเดินเอง**: ส่ง `npc_talk` จากตรงไหนก็ได้ เซิร์ฟเวอร์จะเดินตัวละครไปหา NPC แล้วเปิดบทสนทนาให้ (เกมเองก็ทำแบบนี้ใน route) — `move_to` ระยะไกลอาจค้างเมื่อทางอ้อมแม่น้ำ/สะพาน
   - **NPC key เลื่อนได้เมื่อเกมเพิ่ม NPC** (Valkyrie เคยเป็น n5 ตอนนี้ n6) → หา NPC จากชื่อใน `room.state.npcs` เสมอ (`getValkyrieNpc`, `getAliceNpc`) ห้าม hardcode key/พิกัด
   - Action `set_arrow` {requireArrow, arrowType, arrowBuyQty, ammoThreshold} เขียนทับ `__archerConfig` (ค่าเริ่มต้นของ requireArrow คือ false) แล้วต้องทำให้ลูกธนูชนิดนั้นถูกสวมจริง (`ensurePlanArrows`: สวมจากกระเป๋า หรือส่งไปซื้อ) — ลูกธนูที่ใส่อยู่อยู่ใน `char.ammo` {itemId, qty}; การคำนวณจำนวนที่ต้องซื้อต้องนับเฉพาะชนิดที่จะซื้อ; ปุ่ม "ใช้งาน" เปิดหน้าต่างเลือกจอ → `POST /api/plan-profiles/:id/assign {clientProfileIds, unassignProfileIds}`
   - **Action**: `change_map` ใช้ `window.setTargetFarmMap(map, walkNow)` (เขียน `pelican_farm_map` ด้วย), `equip_item` ใช้ `findAndEquipItemByName` (ชื่อตรงตัว + optionFilter; ซื้อจากตลาดต้อง `collect_all` ก่อนใส่ และต้องพัก sniper ระหว่างค้นหา), `change_class` รอจนเป้าหมายอยู่ใน `char.jobChangeOptions`
   - **คำสั่งอัปสเตตัส** คือ `stat_up {stat, n}` (ไม่ใช่ `amount`) ราคา/แต้ม = `floor((v-1)/10)+2`, ตันที่ 99; อัปสกิลใช้ `skill_up {skillId}` และต้องข้ามสกิลที่ยังเรียนไม่ได้ (สายอาชีพ/prerequisites/learnMaxLevel)
   - **`__applyScriptPlan(plan, enable)`** เปลี่ยนสวิตช์เฉพาะเมื่อส่ง `enable` เป็น boolean — การแก้ไขแผนใน Manager ต้องไม่เปิด Plan Script ให้เอง
   - **ส่งแผนเข้าจอ** ผ่าน `manager/plan_sync.js` เท่านั้น (POST eval): ผูกแผน = ส่ง+เปิด, แก้แผน = ส่งแต่คงสวิตช์เดิม, ลบแผน = ล้างแผนในจอที่ใช้อยู่, จอออฟไลน์จะได้แผนจาก `reconcile` (ทุก 30 วิ, ใช้ `pendingEnable`)
   - `walkToTargetMap(map)` **ตั้ง map เป็นแมพฟาร์มถาวรเสมอ** — การเดินไปที่อื่นชั่วคราว (เช่น เมืองหลวงเพื่อหา Valkyrie) ต้องจำแมพเดิมไว้แล้วคืนให้ (`pelican_job_return_map` / `restoreFarmMapAfterJobChange`)
   - เงื่อนไขที่ผู้เล่นเพิ่มเข้าแผนทีหลัง (`st.known`): ถ้าเลเวลตรงกับเลเวลปัจจุบันจะทำ 1 ครั้ง (เหมือนตอนผูกแผนครั้งแรก) ส่วนเลเวลที่ผ่านไปแล้วไม่ทำย้อนหลัง
   - **คุยกับ Valkyrie** (`executeAutoJobChange`): เกมส่งหน้าบทสนทนาใหม่ทีละหน้า (`npc_dialog`) → ต้องรอจนหน้าเปลี่ยน, log ตัวเลือกทุกหน้า, ปุ่ม "ยืนยัน" ห้ามเป็นตัวเลือกที่มีชื่ออาชีพอื่น (เลือกผิดย้อนไม่ได้), ล้มเหลวแล้วต้องเว้นระยะ (`__jobChangeBackoffUntil`)
   - **การซื้อของไม่ยอมแพ้และไม่ซื้อเกินเงิน**: เช็ค `ch.zeny` ก่อนส่ง `market buy` (เงินไม่พอ = รอ), action ที่รอ (เช่นรอเงิน) ลองใหม่ทุก 1 นาที แล้วช้าลงเป็นทุก 5 นาทีหลัง 10 นาที — ไม่ถูกทิ้ง; มีเงื่อนไขชนิด `zeny` (`targetZeny`) ทำ 1 ครั้งเมื่อเงินถึง
   - **Action ในเงื่อนไขเดียวกันทำตามลำดับ**: เปลี่ยนอาชีพที่ยังไม่เสร็จจะกั้น action ถัดไป (เช่น เปลี่ยนอาชีพ → สวม Bow) ส่วน action อื่นที่ต้องรอ (ซื้อของ) รอของมันเองไม่กั้นตัวอื่น; เปลี่ยนอาชีพที่ค้างลองใหม่ทุก 4 วิ และตั้ง `__planJobChangeHoldUntil` กันไม่ให้ระบบส่งตัวละครออกจากเมืองระหว่างไปหา Valkyrie
   - **เงื่อนไข Job Lv. ผูกกับอาชีพ** (`trigger.classId`, ว่าง = ทุกอาชีพ) เพราะ Job Lv. เริ่มนับ 1 ใหม่ทุกอาชีพ — state เก็บ `lastJobClass`
   - `plan.autoJobChange` (สวิตช์ "เปลี่ยนอาชีพอัตโนมัติ"): แผนใหม่ = ปิด, แผนเก่าที่ไม่มีค่า = อัตโนมัติถ้าไม่มี action `change_class` (บอทและหน้าเว็บใช้กฎเดียวกัน)
   - **เปลี่ยนอาชีพอัตโนมัติ** (`checkAndExecuteAutoJobChange`): เปลี่ยนเมื่อ Job Lv. ถึง `plan.class1JobLevel` (ค่าเริ่มต้น 10) / `plan.class2JobLevel` (ค่าเริ่มต้น 50 — เกมให้เปลี่ยน Class 2 ได้ตั้งแต่ Job 40 แต่รอ 50 ได้แต้มสกิลเพิ่ม) จำกัดไม่เกิน `jobMaxLevel` และ **ใช้แต้มสกิลตามคิวให้หมดก่อน** (`autoAllocateSkills` คืน `true` เมื่อเพิ่งอัปไป 1 แต้ม = รอบนั้นยังไม่เปลี่ยนอาชีพ) — ฟิลด์ใหม่ของแผนต้องเพิ่มใน POST/PUT/import ของ `server.js` ด้วย (server เก็บเฉพาะฟิลด์ที่ระบุชื่อ)
   - **หน้าแก้ไขแผน**: หน้าหลักเป็นการ์ดสรุป (คลิกเพื่อแก้) — เพิ่ม/แก้เงื่อนไขทำในกล่อง dialog (`openTriggerDialog`) ที่แก้ draft (`trigIdx = -1` ใน action editor) แล้วค่อยใส่ลงแผนตอน "ส่งลงแผน" + เลื่อนจอไปไฮไลต์ (`focusPlanTrigger`); action ใหม่ต้องเพิ่มใน `PLAN_ACTION_TILES`, `renderActionNodeHtml`, `planActionSummary`
   - หน้าจัดการสกิล: ทุกการเพิ่ม/ลดแต้มต้องผ่าน `repairSkillQueue` (สกิลเงื่อนไขมาก่อน, โควตา 9/49/49, ไม่เกิน maxLevel)
   - **หน้าจัดการสเตตัส = คิวตามลำดับที่กด** (`statBuild.queue = [{stat, to}]`): บอท (`autoAllocateStats`) อัปขั้นแรกจนถึง `to` ก่อนแล้วค่อยขั้นถัดไป (แต้มไม่พอ = รอ ไม่ข้ามขั้น); ทุกการแก้ผ่าน `normalizeStatQueue` (รวมขั้นสเตตัสเดียวกันที่ติดกัน, ตัดขั้นที่ไม่เพิ่มค่า, ไม่เกิน 99); บันทึก `targets` (ค่าสุดท้าย) + `priorityOrder` ไว้ด้วยเพื่อบอทเวอร์ชันเก่า — แผนเก่าที่ไม่มี queue = targets ตาม priorityOrder (พฤติกรรมเดิม)
   - ฐานข้อมูลสกิลใน `manager/public/builder_module.js` (`SKILLS_DATABASE`) สร้างจาก `window.__skillCatalog` ของเกม — ถ้าเกมเพิ่ม/แก้สกิลให้ดึงใหม่ ห้ามพิมพ์เอง
2. **Alice Service Priority**:
   - เมื่อกำลังเดินกลับไปฟาร์มผ่าน Alice Service (`window.__isWalkingToMap === true`) ห้ามระบบอื่น (เช่น เปลี่ยนอาชีพ, Auto-update รีเฟรชหน้า) ขัดจังหวะเด็ดขาด
3. **Auto Sell ลงตลาดกลาง**: รอบอัตโนมัติ (`runAutoMarketSellCycle(false)`) ทำงาน **เฉพาะตอน START BOT อยู่** (`window.__isBotRunning`) — ปุ่ม "ตรวจสอบทันที" (manual) กดได้ตลอด — ราคาลงขาย (`fetchItemSmartSellPrice`) = ถูกกว่าคนขายที่ถูกที่สุด 1 z แต่ข้ามรายการที่ต่ำกว่า 70% ของราคากลาง (มัธยฐานราคาขายจริง 24 ชม. / 7 วันถ้าขายน้อย) กันโดนราคาล่อ; เทียบเฉพาะชิ้นไม่มีออปชั่น ตีบวกเท่ากัน ไม่ใช่ประมูล ไม่ใช่ของเราเอง; ของมีออปชั่นสุ่ม = ราคากลาง; ไม่มีประวัติขายและคนขาย < 3 = ไม่ลงขายรอบนั้น
4. **ค้นหาตลาดจาก Manager**: ต้องพัก `autoBuy`/`sniperAlert` ของบอทชั่วคราวระหว่างค้นหา (ผลค้นหาไหลเข้า sniper ของบอท อาจซื้ออัตโนมัติโดยไม่ตั้งใจ) — ดู `manager/inventory_market_api.js`
5. **Action ที่แตะไอเทม** (ล็อค/ทิ้ง/ลงขาย): ต้องเช็กซ้ำว่าไอเทมในช่อง (slot) ยังเป็น itemId เดิมก่อนส่งคำสั่งเสมอ
4.8 **การเดินทาง (`walkToTargetMap`)**: ทุกทริปมีเลข `__navSeq` — ขั้นตอนที่หน่วงเวลาไว้ (กดหมุด, กดปุ่มเดิน, `npc_warp` สำรอง) ต้องเช็ค `navLive()` ก่อนทำ (เคยมี npc_warp ของทริปที่ยกเลิกแล้ววาร์ปผิดแมพ); `npc_warp` สำรองส่งเฉพาะเมื่อไม่ได้กดปุ่มบนแผนที่; ถ้ายอมแพ้ต้องคืน `__isNavigating = false` (ไม่งั้นค้างสถานะเดินทางตลอด); เปิด Plan Script อยู่ → ใช้แมพจาก `planMapForNow()` (แมพล่าสุดที่แผนสั่ง ไม่งั้นคิดจากเลเวล)
4.9 **ประหยัดค่าวาร์ป** (`__travelConfig.minZenyForWarp`, `isWarpTooExpensive()`): เงินต่ำกว่าค่าที่ตั้ง → `walkToTargetMap` ไม่คุยกับ Alice / ไม่ส่ง `npc_warp` แต่เปิดแผนที่โลกแล้วกด "เดินไปที่นี่" (`.worldmap-walk button`, ฟรี) — วาร์ปเฉพาะเมื่อเดินจากจุดนั้นไม่ได้
4.10 **กลับเมืองหลวงต้องผ่านฟังก์ชันกลางเท่านั้น**: `window.goToCapital(why)` = มี Butterfly Wing ใช้ปีก (รอ 10 วิให้ลงก่อน, ปีกไม่พา 2 ครั้ง → เดิน) ไม่มีปีก → เปิดแผนที่โลกแล้วกด "เดินไปที่นี่" (`walkToTargetMap(capital, true, {walkOnly: true})` ฟรี ไม่ใช้ Alice/npc_warp); ระบบในแผน (เปลี่ยนอาชีพ, Weight Scroll, เติมน้ำหนัก, สัตว์เลี้ยง Event, เซ็ตอุปกรณ์) ใช้ `window.planTripToCapital(who)` (เมืองหลวงเป็นแมพเป้าหมายระหว่างอยู่ในเมือง + จำแมพฟาร์ม + `needTown(who)`) และคืนแมพด้วย `restoreFarmMapAfterJobChange(who)` — คืนแมพฟาร์มเฉพาะเมื่อไม่มีระบบอื่นยังต้องอยู่ในเมือง (`pelican_town_needs`, หมดอายุ 15 นาที, watchdog กวาดคืนให้ถ้าไม่มีใครต้องการแล้ว); รวมเงิน: `executeBwingHome` / `ensureInCapital` (รอถึงเมืองก่อนย้ายแชนเนล, แมพฟาร์มเก็บใน `pelican_gohome_keep_farm` คืนด้วย `restoreKeptFarmMap` ตอนเริ่มบอท); เป้าหมายที่เป็นเมืองห้ามถูกเปลี่ยนเป็นแมพของแผน
4.13 **รวมเงินห้ามตัดงานสำคัญกลางคัน** (STEP 0 ใน `runConsolidationWorkflow`): ตั้ง `window.__consolidationPending = true` (ลูปแผน / `planBusyReason` / ร้านค้า / ฝากคลัง ไม่เริ่มงานใหม่) แล้วรอได้ถึง 3 นาทีจน `__isShopping`, `__isStoring`, `__isGearRefining`, `__planMarketBuyInFlight`, `__isChangingJob`, `__isWeightScrollBusy`, `__isManualSelling/__isAutoSellingNow` เป็น false — จอส่งที่ยังไม่เสร็จถูกข้ามรอบนี้, ตัวรับเงินไม่เสร็จ = ยกเลิกรวมเงิน; ทุกทางจบต้องล้าง `__consolidationPending` — งานสำคัญใหม่ที่มีสถานะ busy ต้องเพิ่มในรายการนี้ด้วย
4.11 **ค้นหาตลาดต้องพัก sniper ผ่าน `window.pauseSniper()` / `window.resumeSniper()`** (นับชั้น — ค้นหาซ้อน/ต่อกันคืนค่าเดิมครั้งเดียวตอนจบ); ของที่เซ็ตอุปกรณ์ยังต้องใช้ (`window.isGearKeptItem(raw)`) ระบบขาย NPC / ลงตลาดต้องข้ามเสมอ
4.12 **หน้าต่าง "ยินดีต้อนรับ" / ประกาศ Event** (`footer.event-foot`): บอทติ๊ก "ไม่ต้องแสดงอีกวันนี้" แล้วกดปิดเอง (ทุก 2 วิ)
5.0 **ขายของให้ NPC** (`triggerAutoSellTrash`): แถวในหน้าร้าน (`.shop-row`) มี React key = slot ในกระเป๋า → ใช้ slot หา item จริงเสมอ (ห้ามจับคู่ด้วยชื่อ เพราะชื่อซ้ำได้) — ปุ่ม "ใส่วัตถุดิบทั้งหมด" ของเกมข้ามวัตถุดิบที่เกมติดป้าย "หายาก" และ type `Life` อยู่แท็บ "อื่นๆ" จึงมี `processStackCategory` เก็บตกตาม type จริง; แร่ตีบวก (type `Enchantment`) ขายเฉพาะเมื่อเปิด `sellRefineOres` และไม่อยู่ใน Whitelist — กดปุ่มในตะกร้าด้วย `clickOnce` (ห้ามใช้ `triggerClick` กับปุ่มที่กดซ้ำแล้วเพิ่มจำนวน)
5.0.1 **ตัวกรองออฟชั่น Whitelist ตัดสินเด็ดขาด**: ไอเทมใน Whitelist ที่ออฟสุ่ม (`affixes` เท่านั้น ไม่นับ `attributes` พื้นฐาน) ไม่ผ่าน → ขายเลย ข้ามล็อกระดับความหายาก/ล็อก Option/ล็อกรูการ์ด (ยกเว้นของตีบวก หรือมีการ์ดใส่อยู่ใน `item.cards`)
5.0.4 **ฝากของเข้าคลังหลังขาย** (`runAutoStorageDeposit`, เรียกจาก `sellThenStore` ต่อจาก `executeSellAndBuyActions` ระหว่าง `__isShopping`; ตั้งค่าใน `pelican_sell_cfg`: `storeEnabled` ค่าเริ่มต้นปิด, `storeWeapon/Armor/Acc/Refine`, `storeSkipLocked`): ฝากเฉพาะอาวุธ/ชุดเกราะ/ประดับ+เจม/แร่ตีบวก **รวมของใน Whitelist** (สวิตช์ `storeWhitelist`) — หมวดต้องผ่านเสมอแม้อยู่ใน Whitelist: ไม่ฝากของใช้, ลูกธนู (Ammo), การ์ด, วัตถุดิบ; ไม่ฝากของที่อยู่ในรายการขายลงตลาดกลาง (`isItemOnMarketSellList`), ของล็อค, ของที่เซ็ตอุปกรณ์ต้องใช้ (`isGearKeptItem`), ของที่ action "สวมใส่" ของแผนรออยู่ และเจม % สูงกว่าที่ใส่ (`planStillNeeds`); คลังเป็นของทั้งบัญชี มีค่าเปิด — เปิดผ่าน NPC ที่มีตัวเลือก "คลัง" (จำชื่อไว้ใน `pelican_storage_npc`, ลอง Alice ก่อน, ไม่แตะ guild), `storage_put {slot, qty}`, เช็คช่องซ้ำด้วยเงื่อนไขเต็มก่อนฝากทุกชิ้น; คลังเต็ม/ไม่เจอ NPC/เงินไม่พอค่าเปิด/เกมไม่รับ = เว้นระยะใน `pelican_storage_state` (ห้ามจ่ายค่าเปิดซ้ำทุกรอบ); `__isStoring` อยู่ใน busy ทุกจุด
5.0.2 **Save List (`save-as-preset`)**: ต้องอ่าน config จริงจากจอ (`evalProfilePort` + exportAllBotSettings, timeout 10 วิ) ถ้าอ่านไม่ได้ให้แจ้ง error — ห้ามบันทึกค่า default แทน (เคยทำให้ Copy to แล้วค่าไม่มา)
5.0.3 **Auto-login / Auto-register** (`manager/auth_sync.js`, `manager/credentials.js`): รหัสผ่านเก็บใน `manager/data/credentials.json` (git-ignored) เท่านั้น — **ห้ามเก็บรหัสใน profiles.json** (ไฟล์นี้อยู่ใน repo สาธารณะ) และห้ามส่งรหัสไปหน้าเว็บ (ส่งแค่ `hasLoginPassword`); โปรไฟล์ที่สร้างโดยไม่ใส่รหัส = `autoRegister`: Manager สุ่ม ID/รหัส บันทึกก่อน แล้วส่ง `authConfig.register` ให้บอทสมัคร (`form.login-form` 3 ช่อง → "สมัครและเข้าเกม") + สร้างตัวละคร (`.char-card.empty` → `form.char-create`); บอทรายงานกลับด้วย `registerDone` / ID ใหม่ถ้าซ้ำ
5.1 **คัดลอกการตั้งค่าไปจออื่น** (`manager/config_copy_api.js`, ปุ่ม "📋 คัดลอกไปจออื่น" ในเมนูบอทบนเว็บ และ "Copy to" ของ Save List): ห้ามส่ง `username`, `password`, `charName` ของ `authConfig` ไปจออื่นเด็ดขาด
5.2 **คีย์ localStorage ต้องตรงกับตอนโหลด**: `pelican_auto_market_sell_cfg`, `pelican_market_filter_cfg`, `pelican_sell_cfg`, `pelican_archer_cfg`, `pelican_shop_cfg`, `pelican_buff_potion_config`, `pelican_auth_cfg`, `pelican_target_map`, `pelican_travel_cfg` — เขียนผิดชื่อ = ค่าหายหลังรีเฟรชหน้า (ซึ่งเกิดบ่อยเพราะ Auto-update)
6. **ข้อมูลไอเทม**: `attributes` = ค่าพื้นฐาน (คงที่), `affixes` = ออฟชั่นสุ่ม (Random Options) — `equipType` ของเกมมี: Weapon, Helmet, HeadMid, HeadLow, Armor, Cape, Glove, Pants, Boot, Shield, Acc, Gem, Ammo, Costume* (โค้ดที่แยกหมวดต้องครอบคลุมครบ) — ไอคอนไอเทมต้องหาจาก `/art/icons/manifest.json` (ตาม itemId) ห้ามเดาจากชื่อ และต้องเป็น URL เต็มของเว็บเกมเมื่อแสดงใน Manager
6.3 **โหมดประหยัด (`setupLowPower` ต้นไฟล์ bot.js)**: AUTO ต่อสู้ทำงานฝั่งเซิร์ฟเวอร์ (`auto_set`) ฝั่ง client แค่วาดภาพ — ซ่อนจอ = `window.setLowPowerMode(true)`: วาด ~2 fps, ซ่อน canvas, และ `WEBGL_lose_context` คืนหน่วยความจำ GPU (วัดจริง 1.4-3.4 GB → 0.28 GB ต่อจอ, Phaser restore ภาพได้ปกติ); `win.hide()` ไม่ทำให้ document เป็น hidden (backgroundThrottling ปิดอยู่) จึงต้องสั่งจาก Manager/loader เสมอ; จำกัด FPS ตอนแสดงจอ = `pelican_fps_cap`
6.4 **การตาย**: เช็คจาก `room.state.players.get(sessionId).dead` ก่อนเสมอ (HUD ยังแสดง HP เต็มตอนตาย) — ปุ่มในเกมมี 2 บรรทัด ให้เทียบบรรทัดแรก; ฟื้นด้วย `room.send('respawn', {to: 'save'})`; ตอนตายเปิด AUTO ไม่ได้ ห้ามตีความว่าน้ำหนักเกิน
6.5 **Colyseus room เปลี่ยนทุกครั้งที่เปลี่ยนแมพ**: ห้ามใช้ room ที่ cache ไว้โดยไม่เช็ค `room.connection.isOpen` (room เก่ายังมี `.state` แต่ส่งไปไม่ถึงเซิร์ฟเวอร์) — ใช้ `window.getColyseusRoom()` / `getGameRoom()` เท่านั้น อย่าอ่าน `window.__colyseusRoom` ตรงๆ
7. **คำสั่งเกม (Colyseus `room.send`)** ที่ใช้อยู่: `equip`, `unequip`, `inv_use`, `inv_lock {slot, locked}`, `inv_destroy {slot, qty}`, `inv_sort`, `market {op: search|history|list|buy|mine|collect_all}` — ดูรายการทั้งหมดได้จาก `scratch/index_bundle.js` (โค้ดเกมที่ dump ไว้)
8. **HUD ในเกม (`createUI` ใน bot.js)**:
   - ห้ามเปลี่ยน `id` ของ element เดิม (โค้ดส่วนอื่นอ้างถึงอยู่)
   - สไตล์ทั้งหมดอยู่ใน `<style>` ของ `#pelican-hud` (checkbox แสดงเป็นสวิตช์, การ์ด/ปุ่ม/ช่องกรอกใช้ธีมเดียวกัน) — ของใหม่ให้ใช้ class เดิม (`p-card`, `p-card-title`, `p-btn`, `p-check-box`, `p-hint`) แทน inline style
   - ห้ามใช้ emoji 🪙 (Windows 10 แสดงเป็นกล่องสี่เหลี่ยม) ให้ใช้ 💰
9. **HUD จำลองใน Manager** (`getGitHubHudTemplate` ใน `manager/public/app.js`) เป็นสำเนาของ HUD ในเกม — ถ้าเอาฟีเจอร์ออกจาก bot.js ต้องเอาออกจากที่นี่และ action ใน `server.js` (`client-action`) ด้วย

## Cloudflare Workers + D1 — ระบบ Point / Auto Humancheck (ย้ายแล้ว 2026-10-12)

- ฝั่ง API อยู่ `D:\MyProject\PMheeSuite\PMheePlatform_Src\Server\PMhee.AetheriaApi\cloudflare\` อ่าน `README.md`, `DEPLOYMENT_STATUS.md` และ `../AGENTS.md` ก่อนทำงาน สถานะ deploy จริงอยู่ใน DEPLOYMENT_STATUS ห้ามอ้างว่าขึ้น production แล้วจากการมีโค้ดเพียงอย่างเดียว
- Manager เป็น client เรียก `https://api.noggunsshop.xyz/v1/aetheria/*` ยอด Point/เติมซอง/ตัวกันหักซ้ำเป็นหน้าที่ของ API และ D1 ห้ามสร้างเครดิตออฟไลน์เอง ผู้ใช้อนุญาต Humancheck local/offline ซึ่ง implement แล้วพร้อม seed 1,160 รายการและ last-good cache; คำตอบกำกวมต้องให้ตอบเอง ข้อความยอดที่ผู้ใช้เห็นใช้ชื่อ **ส่วนบุญ** แต่คีย์/API Point เดิมคงไว้
- โดเมนแชร์กับ Licensing API: ใช้ Worker route เฉพาะ `/v1/aetheria/*` ห้ามย้าย DNS หรือ custom domain ทั้ง hostname; ห้ามหยุด PMheeLicensingApi, PMheeCloudflared, Manager หรือจอเกม
- ย้ายข้อมูลต้องคง accountId, token_hash, Point, receipts, requestId/payload_hash/response เดิมทั้งหมด และคงอัตราใช้ฟรี/คิดแต้มจาก config จริง ห้ามบังคับกลับเป็น 1 Point
- หักแต้ม+บันทึกผล / เติมแต้ม+receipt ต้อง atomic และ idempotent; pending voucher ห้าม retry redeem อัตโนมัติ; ห้ามเปิด SQLite กับ D1 ให้รับรายการพร้อมกัน
- Receiver/webhook ใช้ Workers Secrets เท่านั้น export/backup/customer data อยู่โฟลเดอร์ artifacts ที่จำกัดสิทธิ์ในโปรเจกต์ API ห้ามคัดลอกลง Manager/release/Git/log
- โค้ด client เดิมผูกบัญชีกับ API origin จึงคง origin เดิมเพื่อใช้ token เดิม อย่าลบไฟล์บัญชีใน Manager ระหว่างย้าย
- ทดสอบด้วย D1 staging/ข้อมูลจำลองก่อน; ทดสอบเงินจริงหรือเปลี่ยนราคาต้องมีคำสั่งผู้ใช้ชัดเจน การ rollback หลังมีรายการบน D1 ต้องย้าย ledger ล่าสุดกลับ ห้ามใช้ SQLite backup เก่าแทน
- เปลี่ยนแนวทาง/สถานะที่มีผลต่อ agent ให้ปรับส่วนนี้ทั้ง AGENTS.md และ agent.md พร้อมกัน และปรับ DEPLOYMENT_STATUS ของฝั่ง API ด้วย
- สถานะ 2026-10-12: production Worker `pmhee-aetheria-api` + D1 ใช้งานแล้ว; PMheeAetheriaApi ในเครื่องหยุดอยู่; origin/token เดิมใช้ได้ และ Manager เดิมไม่ต้องแตก zip ใหม่ การคิด 2 Point/จอ/วันเป็นแผนใหม่ที่ยังไม่เปิดใช้ อ่าน `cloudflare/BILLING_DESIGN.md` ก่อนแก้ ห้ามเริ่มเก็บเงินหรือยอมให้บัญชีใหม่หนีหนี้โดยอนุมานเอง
- ข้อสรุป 2026-10-12: สคริปต์ต้องเปิดสิทธิ์ผ่าน Manager บันทึกจอที่ใช้จริงด้วย slotId คงที่ แล้วหักเรทผู้ดูแลต่อ slot ต่อวันไทยหลังเที่ยงคืน; session/refresh/ปิดเปิดต้องไม่เก็บซ้ำและยอมให้ยอดติดลบ ใช้ deferred rule เดียวกันทุกจอใหม่/เก่า ไม่มี prepay ใน implementation นี้ ระบบใหม่มีใน staging/shadow แต่ยังไม่เปิดเก็บเงินจริงหรือบังคับสิทธิ์ใน production อ่าน `docs/SCRIPT_TRANSITION_READINESS.md` ก่อนเปิด pilot
- เรทรายวันผู้ดูแลปรับได้จนก่อน 00:00 ไทย เช่น 1.5 Point แล้วปิดเรทของวันนั้นไว้ถาวร Cron ที่รันช้าต้องใช้เรทก่อน cutoff ไม่ใช่เรทล่าสุดหลังเที่ยงคืน เก็บยอดเป็นหน่วยจำนวนเต็ม 100 หน่วยต่อ 1 Point เพื่อรองรับทศนิยมและหนี้ ห้ามคิดเงินด้วย float; หากจอใหม่จ่ายล่วงหน้าแล้วเรทลด ต้องคืนส่วนต่างแบบกันทำซ้ำ
- เตรียม security/Auto-update อ่าน `docs/SCRIPT_SECURITY_ROLLOUT.md`: Manager พร้อมก่อน -> script observation mode -> ทดสอบ compatibility -> enforce เฉพาะจอพร้อม -> เปิด billing หลังแจ้งเงื่อนไข ห้ามเปิด gate จนทำให้จอเก่าหยุดเอง ห้ามสัญญาว่ากันแกะ client ได้ 100% หรือบังคับแตก zip/รีสตาร์ท EXE ทั้งที่ POST bridge เดิมใช้ได้


## ขั้นตอนอัปเดตหลังย้าย Cloudflare (เพิ่ม 2026-10-13)

- GitHub สาธารณะ `thegopza/aetheria-pelican-bot` เก็บ Manager, loader, bootstrap, public verification keys และ compatibility bot เท่านั้น การ push Manager ไม่ได้ deploy Worker หรือเปลี่ยน payload ใน Cloudflare โดยอัตโนมัติ
- Source บอทที่ตรวจสิทธิ์อยู่ `D:/MyProject/PMheeSuite/PMheePlatform_Src/Server/PMhee.AetheriaApi/protected-script/bot.source.js`; อ่าน AGENTS.md และ cloudflare/DEPLOYMENT_STATUS.md ของ API ก่อนงานทุกครั้ง API repo ปัจจุบันต้องตรวจ git remote ก่อนอ้างว่า push แล้ว ห้ามนำ private source/payload/signing keys/voucher/token/proxy password ลง GitHub สาธารณะหรือ release ZIP
- แก้บอท protected: bump PELICAN_BOT_VERSION และ @version ใน private source ให้ตรงกัน; ใช้ `node security/build-private-payload.js PRIVATE_SOURCE PRIVATE_ARTIFACT_DIR PUBLIC_KEYS_JSON` สร้างนอก public repo; ตรวจ syntax และ security tests รวม runtime/event จริงบน Edge/Chrome ห้ามถือว่า initialization ผ่านเท่ากับทุกปุ่มทำงาน
- ใน API/cloudflare รัน prepare-private-script.mjs กับ private artifacts แล้ว import SQL chunks เข้า staging D1 ก่อน deploy staging Worker พร้อม SCRIPT_RELEASE_JSON/version/hash/size/storageKey ที่ตรงกัน ตรวจ signed ticket, hash หลังประกอบ chunks, auth denial, expiry/renewal และ idempotency ห้าม redeem ซองเงินจริงเพื่อ smoke test
- ก่อน production: สำรอง D1 แบบกู้คืนได้ ตรวจฐาน/flags/routes/secrets จริง ใช้เฉพาะ route api.noggunsshop.xyz/v1/aetheria/* ไม่เปลี่ยน DNS หรือ Licensing; apply additive migrations ที่ทดสอบแล้วก่อน code; import payload ใหม่แบบ immutable ไม่เขียนทับ release/hash เดิม แล้ว deploy Worker ด้วย wrangler.production.jsonc
- Lease ต้องผูก release descriptor ฝั่ง server ต่อ runtime: backfill lease เดิมด้วย manifest ที่ใช้อยู่ก่อนเปลี่ยน release; เก็บ private chunks รุ่นก่อนเพื่อ renewal/rollback จอเดิมใช้ signed release เดิมต่อได้ จอ fresh ใช้รุ่นใหม่ ห้ามเปลี่ยน version/hash ใน ticket ของ runtime ที่เริ่มแล้วหรือ hot-inject payload ซ้ำ; อัปเดตจอเฉพาะ safe boundary และผ่าน Manager ที่รองรับ
- Public bootstrap/key/loader เปลี่ยน: sync manager และ release ตามข้อ 4, rebuild ZIP ด้วย allowlist ตรวจไม่มี customer configs/credentials/private artifacts; commit เฉพาะไฟล์งานแล้ว push main; Manager self-update จัดการ server เอง ห้าม restart PelicanManager.exe/ปิดเกมรวม
- TrueMoney: ผู้รับเป็น Workers Secret TRUEMONEY_RECEIVER; reserve receipt ก่อน provider; pending outcome ไม่ชัดเจนห้าม retry redeem/credit เอง; rejected/credited/verified ต้องตอบตามสถานะและ replay อย่างถูกต้อง; การแก้โค้ดไม่ใช่สิทธิ์ย้าย ledger กลับ SQLite เก่า
- Billing: อ่าน enabled/wallet_units_ready/activation_day/acceptance ใน D1 และ statement จริง ห้าม hardcode UI ว่าไม่คิดเงิน ห้ามคำนวณหนี้จากจำนวนเกมที่เปิดหรือใช้ยอดสมมุติ; นับ actual script usage ตาม immutable slot+วันไทย และไม่เปิด/ปิด billing เปลี่ยนเรทหรือวันเริ่มเองจากการ deploy
- หลัง deploy ตรวจ API/Licensing health, balance/statement read-only, provider connectivity ด้วย invalid fixture (ไม่ใช้ซอง/เบอร์จริง), signed payload/renewal ทั้งรุ่นเดิมและใหม่, schemaและยอดเดิม; อัปเดต DEPLOYMENT_STATUS.md ให้ตรงของจริงพร้อม deployment ID/hash/test limitations
- Rollback ใช้ Worker revision ก่อนหน้าและ D1 ledger ล่าสุด เก็บ payload รุ่นก่อน; ห้าม restore backup เก่าทับรายการเติม/หักใหม่ ห้าม downgrade wallet_units_ready ที่ย้ายเป็น units แล้ว; ห้ามฝังข้อมูลรับรองในชุดแจก; เจ้าของยืนยันวันที่ 2026-10-13 ให้ใช้ Proxy credential เดิมในเครื่องได้โดยไม่บังคับ rotate ตามการตัดสินใจนี้ ห้ามนำค่าจริงกลับเข้า source/GitHub/ZIP

## Owner-hosted friends mode / งานส่งต่อ — 2026-10-13

ทางเข้ารวมโปรเจกต์คือ D:\MyProject\PmheeAether (manager-project และ private-api เป็น junction ไป source เดิม ไม่ใช่สำเนาใหม่) อ่าน TASKS.md และ TEST_PLAN.md ในโฟลเดอร์นี้ก่อนแก้งานต่อ หรือ docs/FRIENDS_OFFLINE_TASKS.md และ docs/FRIENDS_OFFLINE_TEST_PLAN.md ใน repo นี้

เจ้าของยืนยันแบบ friends-offline: signed cached encrypted payload ไม่ต้องต่ออายุสิทธิ์ออนไลน์, solver/catalog ฝังใน private bot, เก็บสถิติใน Manager, local daily debt แยกวันไทย/slotId, ส่งทุกชั่วโมง/เที่ยงคืน/reconnect, ล้างเฉพาะ ACK สำเร็จ, ยอดแสดงคำนวณต่อจาก local pending ขณะ host เจ้าของออฟไลน์; เติมเงินตรวจรับกลางเมื่อ host ออนไลน์เท่านั้น นี่คือการปรับแบบที่เจ้าของอนุญาต ไม่ใช่การให้ผู้ใช้ข้าม billing โดยพลการ

สถานะปัจจุบัน LIVE: owner-host เป็น ledger หลักหลัง cutover-20261013-1715; D1 เดิม maintenance=1, Cloudflare Access/Tunnel เป็นทางเข้า PMheeAetheriaApi เปิดใช้งานแล้ว ตรวจ health/service ล่าสุดก่อนทำงาน ห้ามใช้ฐาน SQLite เก่าหรือทำ cutover ใหม่เพื่ออัปเดตบอททั่วไป อ่าน docs/BOT_UPDATE_GUIDE.md เป็น workflow ปัจจุบันแทน candidate handoff เก่า

Private source รุ่นใช้งานอยู่ Server/PMhee.AetheriaApi/owner-host/ และ protected-script/bot.source.js (ตรวจ version จริงจากค่าคงที่) public bot.js เป็น compatibility snapshot; ห้ามซิงค์ private source/payload เข้า public Git/ZIP/gamefolder เก็บ protocol1 compatibility/lease renewal จน safe reload protocol2 สำเร็จ

trash มีเฉพาะ one-off patch helper ที่ตรวจแล้วว่าไม่ได้ใช้ ไม่ใช่ที่ทิ้งฐานเก่า/secrets/sourceเดิม/rollbackโดยเดา ห้าม recursively move/delete junction ของ repo และห้ามสร้าง source hand-edit สำเนาที่สาม