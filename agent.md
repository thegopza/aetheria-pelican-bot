# AI Agent Guidelines & Repository Workflow Rules

เอกสารข้อกำหนดและแนวทางการทำงานสำหรับ AI Coding Assistant และผู้พัฒนาในโปรเจกต์ **Aetheria Pelican Bot**:

---

## 📌 กฎเหล็กสำคัญ: การอัปเดตไฟล์ต้องซิงค์ขึ้น GitHub เสมอ (Mandatory GitHub Sync)

ทุกครั้งที่มีการแก้ไขไฟล์โค้ด, ปรับปรุงระบบ, แก้บั๊ก, หรือพัฒนาฟีเจอร์ใหม่:
1. **ต้องทำการ Commit และ Push ขึ้น GitHub (`origin main`) เสมอ**:
   - เมื่อแก้ไขและทดสอบเสร็จสมบูรณ์แล้ว ห้ามค้างการเปลี่ยนแปลงไว้แค่ใน Local
   - ต้องตรวจสอบ `git status` -> `git add` -> `git commit` ด้วยข้อความที่สื่อความหมายชัดเจน -> `git push origin main`
2. **รักษาความสะอาดของ Repository (Git Hygiene)**:
   - ห้าม Commit ไฟล์ชั่วคราว หรือสคริปต์ทดสอบชั่วคราว (เช่น โฟลเดอร์ `scratch/`, logs หรือ session files ให้คงไว้ใน `.gitignore`)
3. **ตรวจสอบ Syntax ก่อน Commit เสมอ**:
   - รันคำสั่ง `node -c <file>` เพื่อตรวจสอบไวยากรณ์ของโค้ด JavaScript ทุกไฟล์ก่อนทำการ Commit
4. **ซิงค์ไฟล์ให้ครบทุกจุด (Multi-Location Sync)**:
   - หากมีการแก้ `bot.js`: ต้องซิงค์ทั้ง `bot.js` (root), `manager/public/bot.js`, `release/Pelican_Manager_v4.3/bot.js`, และโฟลเดอร์เกมในเครื่อง (`%LOCALAPPDATA%\Programs\Aetheria Online\resources\bot.js`)
   - หากมีการอัปเดตเวอร์ชัน Release: ต้องบีบอัด `release/Pelican_Manager_v4.3.zip` ให้ตรงกับโค้ดล่าสุดเสมอ

---

## 🎮 สถาปัตยกรรมและการทำงานของระบบ Pelican Bot

1. **Plan Script Engine**:
   - **Master Switch**: `window.__planScriptEnabled` มีค่าเริ่มต้นเป็น `false` เสมอ
   - ระบบตั้งค่าพิเศษ (เช่น การปรับระยะล่าเป็นทั้งแมพ `huntRadiusTiles: 'all'`, ติ๊ก Auto สกิล, ปิดประกาศบนจอ และปิดหน้าต่างข่าวสาร) ต้องทำงานภายใต้เงื่อนไข `window.__planScriptEnabled && window.__currentScriptPlan` เท่านั้น
   - ห้ามรบกวนหรือทับการตั้งค่าของตัวละครฟาร์มปกติที่ไม่ได้เปิดใช้งาน Plan Script
2. **Alice Service Priority**:
   - เมื่อตัวละครกำลังเดินกลับไปฟาร์มผ่าน Alice Service (`window.__isWalkingToMap === true`) ห้ามระบบอื่น (เช่น ระบบเปลี่ยนอาชีพ) ขัดจังหวะหรือแทรกแซงการเดินโดยเด็ดขาด
