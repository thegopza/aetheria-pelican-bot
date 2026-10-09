# AI Agent Guidelines & Repository Workflow Rules

เอกสารข้อกำหนดและแนวทางการทำงานสำหรับ AI Coding Assistant และผู้พัฒนาในโปรเจกต์ **Aetheria Pelican Bot**
(`AGENTS.md` และ `agent.md` ต้องมีเนื้อหาเหมือนกันเสมอ — แก้ไฟล์หนึ่งต้องคัดลอกไปอีกไฟล์ด้วย)

ตอบผู้ใช้เป็น **ภาษาไทย** เสมอ (ชื่อไฟล์ โค้ด และชื่อสเตตัสในเกม เช่น DEX/MATK ใช้ภาษาอังกฤษได้)

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

- ตัวโหลดเกม (`main.js`) ดึง `bot.js` ล่าสุดจาก GitHub (`raw.githubusercontent.com/.../main/bot.js`) **ทุกครั้งที่หน้าเกมโหลด**
- Manager มีระบบ Auto-update (`manager/bot_auto_update.js`): เช็ก GitHub ทุก 5 นาที → รอ CDN ส่งไฟล์ใหม่จริง (เทียบ git blob sha) → รีเฟรชเกมทีละจอเฉพาะตอนปลอดภัย → ให้บอทกลับมาฟาร์มต่อ
- ดังนั้นเมื่อแก้ `bot.js` แล้ว **push ขึ้น GitHub = จอเกมที่เปิดอยู่จะอัปเดตเอง** (ดูสถานะ/เวอร์ชันแต่ละจอได้ที่ปุ่ม "Auto-update" บนแถบด้านบนของ Manager)
- **ห้าม hot-inject `bot.js` ทั้งไฟล์เข้าเกมที่รันอยู่** (เช่น `scratch/hot_reload_game.js`) — setInterval ของบอทจะซ้อนกันหลายชุด ถ้าจำเป็นให้ inject เฉพาะฟังก์ชันเล็กๆ ที่แยกอิสระ หรือใช้การรีเฟรชหน้าแทน
- สถานะที่ "ห้ามรีเฟรชแทรก" อยู่ใน `CLIENT_PROBE_JS` ของ `bot_auto_update.js` — ถ้าเพิ่มสถานะ busy ใหม่ใน bot.js (เช่น `window.__isXxx = true`) ให้เพิ่มในรายการนี้ด้วย

---

## 📦 4. ซิงค์ไฟล์ให้ครบทุกจุด (Multi-Location Sync)

- แก้ `bot.js` → ซิงค์ไปที่ `bot.js` (root), `manager/public/bot.js`, `release/Pelican_Manager_v4.3/bot.js`, `release/Pelican_Manager_v4.3/manager/public/bot.js` และโฟลเดอร์เกม `%LOCALAPPDATA%\Programs\Aetheria Online\resources\bot.js`
  (ใช้ `node scratch/sync_all_files.js` ได้ — สคริปต์นี้ซิงค์ bot.js / server.js / app.js และเช็ก syntax ให้)
- แก้/เพิ่มไฟล์ใน `manager/` → คัดลอกไปที่ `release/Pelican_Manager_v4.3/manager/` ด้วย (ไฟล์ใหม่ต้องคัดลอกเองทุกไฟล์)
- ทุกครั้งที่ release เปลี่ยน ต้องบีบอัด `release/Pelican_Manager_v4.3.zip` ใหม่
  - ไฟล์ zip มักถูกโปรแกรมอื่นล็อก (`user-mapped section open`) → ให้ `Compress-Archive` ไปที่โฟลเดอร์ชั่วคราวก่อน ตรวจว่าเปิดได้ แล้วค่อย `Copy-Item` ทับ และเทียบ hash
- แก้ `manager/server.js` หรือไฟล์ฝั่ง server → ผู้ใช้ต้อง **รีสตาร์ท PelicanManager.exe** (แจ้งผู้ใช้ทุกครั้ง)
- แก้แค่ `manager/public/*` → ผู้ใช้กด Ctrl+F5 ก็พอ (bump `?v=` ใน `index.html` ด้วย)

---

## 🧪 5. การทดสอบอย่างปลอดภัย

- ผู้ใช้มักเปิดเกมอยู่หลายจอ (debug port 49876–49880) และ Manager จริงรันที่พอร์ต 3888 — **ห้ามรีสตาร์ท Manager จริงเอง** (อาจปิดจอเกมที่เปิดผ่าน Manager)
- ทดสอบ Manager ด้วยการคัดลอก `manager/` ไปโฟลเดอร์ชั่วคราว เปลี่ยน `PORT` เป็น 3899 แล้วรันแยก
  - ในสำเนาทดสอบให้ **ปิด Auto-update** (`data/bot_update_state.json` → `{"enabled": false}`) ไม่งั้นจะไปรีเฟรชเกมจริง
- อ่านข้อมูลจากเกมผ่าน `POST http://127.0.0.1:<debugPort>/api/eval` ได้ (คืนค่า Promise ได้)
- **ห้ามทำ action ที่ย้อนกลับไม่ได้กับของจริงของผู้ใช้โดยไม่ได้รับอนุญาต** เช่น ลงขายตลาด, ซื้อ, ทิ้งไอเทม, เทรด — ทดสอบได้แค่การอ่านข้อมูล หรือ action ที่ย้อนกลับได้ (เช่น ล็อค→ปลดล็อค)
- หน้า UI ทดสอบด้วย headless Chrome (`--screenshot`) แล้วตรวจภาพจริงทุกครั้งก่อนส่งงาน

---

## 🎮 6. สถาปัตยกรรมและกฎของระบบ Pelican Bot

1. **Plan Script Engine**:
   - **Master Switch**: `window.__planScriptEnabled` มีค่าเริ่มต้นเป็น `false` เสมอ
   - ระบบตั้งค่าพิเศษ (เช่น ระยะล่าทั้งแมพ `huntRadiusTiles: 'all'`, ติ๊ก Auto สกิล, ปิดประกาศบนจอ, ปิดหน้าต่างข่าวสาร) ต้องทำงานภายใต้เงื่อนไข `window.__planScriptEnabled && window.__currentScriptPlan` เท่านั้น
   - ห้ามรบกวนหรือทับการตั้งค่าของตัวละครฟาร์มปกติที่ไม่ได้เปิด Plan Script
2. **Alice Service Priority**:
   - เมื่อกำลังเดินกลับไปฟาร์มผ่าน Alice Service (`window.__isWalkingToMap === true`) ห้ามระบบอื่น (เช่น เปลี่ยนอาชีพ, Auto-update รีเฟรชหน้า) ขัดจังหวะเด็ดขาด
3. **Auto Sell ลงตลาดกลาง**: รอบอัตโนมัติ (`runAutoMarketSellCycle(false)`) ทำงาน **เฉพาะตอน START BOT อยู่** (`window.__isBotRunning`) — ปุ่ม "ตรวจสอบทันที" (manual) กดได้ตลอด
4. **ค้นหาตลาดจาก Manager**: ต้องพัก `autoBuy`/`sniperAlert` ของบอทชั่วคราวระหว่างค้นหา (ผลค้นหาไหลเข้า sniper ของบอท อาจซื้ออัตโนมัติโดยไม่ตั้งใจ) — ดู `manager/inventory_market_api.js`
5. **Action ที่แตะไอเทม** (ล็อค/ทิ้ง/ลงขาย): ต้องเช็กซ้ำว่าไอเทมในช่อง (slot) ยังเป็น itemId เดิมก่อนส่งคำสั่งเสมอ
6. **ข้อมูลไอเทม**: `attributes` = ค่าพื้นฐาน (คงที่), `affixes` = ออฟชั่นสุ่ม (Random Options) — ไอคอนไอเทมต้องหาจาก `/art/icons/manifest.json` (ตาม itemId) ห้ามเดาจากชื่อ และต้องเป็น URL เต็มของเว็บเกมเมื่อแสดงใน Manager
7. **คำสั่งเกม (Colyseus `room.send`)** ที่ใช้อยู่: `equip`, `unequip`, `inv_use`, `inv_lock {slot, locked}`, `inv_destroy {slot, qty}`, `inv_sort`, `market {op: search|history|list|buy|mine|collect_all}` — ดูรายการทั้งหมดได้จาก `scratch/index_bundle.js` (โค้ดเกมที่ dump ไว้)
8. **HUD ในเกม (`createUI` ใน bot.js)**:
   - ห้ามเปลี่ยน `id` ของ element เดิม (โค้ดส่วนอื่นอ้างถึงอยู่)
   - สไตล์ทั้งหมดอยู่ใน `<style>` ของ `#pelican-hud` (checkbox แสดงเป็นสวิตช์, การ์ด/ปุ่ม/ช่องกรอกใช้ธีมเดียวกัน) — ของใหม่ให้ใช้ class เดิม (`p-card`, `p-card-title`, `p-btn`, `p-check-box`, `p-hint`) แทน inline style
   - ห้ามใช้ emoji 🪙 (Windows 10 แสดงเป็นกล่องสี่เหลี่ยม) ให้ใช้ 💰
9. **HUD จำลองใน Manager** (`getGitHubHudTemplate` ใน `manager/public/app.js`) เป็นสำเนาของ HUD ในเกม — ถ้าเอาฟีเจอร์ออกจาก bot.js ต้องเอาออกจากที่นี่และ action ใน `server.js` (`client-action`) ด้วย
