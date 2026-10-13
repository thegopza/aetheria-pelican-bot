# ช่องทางอัปเดต Manager (2026-10-14)

Source ที่แก้จริง: `D:\MyProject\aetheria\manager\` ใน repo `thegopza/aetheria-pelican-bot` (เจ้าของจะเปลี่ยนกลับ private หลังช่วงเปลี่ยนผ่าน)

ช่องทางแจก public: https://github.com/thegopza/aetheria-manager-updates
Checkout สำหรับแจก: `D:\MyProject\PmheeAether\manager-update-distribution` เป็น generated distribution ห้ามแก้โค้ดที่นี่แทน source

## ปล่อย Manager ครั้งถัดไป

1. อ่าน AGENTS.md/agent.md, git status และคู่มือบอทก่อนแก้ source จริง ห้ามรวมงานค้างของ agent อื่นหรือไฟล์ผู้ใช้
2. ตรวจ syntax ทุก JS ที่แก้ รัน regression ที่เกี่ยวข้อง รวม `node --test manager/tests/github_update_repository.test.js manager/tests/security_restart_guard.test.js manager/tests/security_update_busy.test.js tools/publish-manager-updates.test.js` ถ้าแก้ช่องทางอัปเดต
3. sync เฉพาะไฟล์งานไป release mirror และ rebuild ZIP จาก allowlist ตรวจ entry/hash ก่อน commit; review แล้ว explicit stage/commit/push origin main ที่ source repo
4. หากเพิ่ม runtime file ใหม่ ต้องเพิ่มชื่อใน `tools/manager-distribution-files.json` และตรวจว่าไม่ใช่ private payload, bot.js, customer configs, credentials, sessions, offline debts/cache หรือ signing secret
5. จาก source root รัน `node tools/publish-manager-updates.js D:\MyProject\PmheeAether\manager-update-distribution --publish` เครื่องมืออ่าน committed HEAD เท่านั้น ไม่อ่านโค้ดค้างใน working tree ตรวจ syntax/ZIP hashes และ push main ที่ public distribution
6. ตรวจ public commit/raw URLs แบบไม่ส่ง GitHub token, distribution.json และ ZIP ให้ตรง sourceCommit แล้วบันทึกสถานะงาน อย่ารายงานว่าปล่อยสำเร็จหาก push เฉพาะ private source

ZIP ของ repo แจกไม่มี bot.js/private payload มี launcher, Node และ Manager runtime เท่านั้น บอทรุ่น private ใช้ owner API และ signed last-good cache เดิม หน้าแอดมิน/ledger/private service ไม่ได้ย้ายมาที่ GitHub

## ช่วงเปลี่ยนผ่าน

เปิด repo เดิม public ชั่วคราวหลัง repo แจกพร้อม เพื่อให้ Manager รุ่นเก่ารับ `github_check.js` และ `manager_self_update.js` ที่ชี้ repo ใหม่ รุ่น release เช็กประมาณทุก 10 นาทีและ restart เฉพาะ server ผ่าน supervisor เมื่อปลอดภัย ห้ามปิด PelicanManager.exe เพราะเกมจะปิดตาม

เมื่อผู้ใช้ได้รับรุ่นเปลี่ยนผ่านแล้ว เจ้าของเปลี่ยน repo เดิมกลับ private เอง เครื่องที่ปิด/ปิด auto-update/ยังไม่รับรุ่นเปลี่ยนผ่านต้องติดตั้ง ZIP ใหม่หรือรับ bridge ก่อน การเปิดไว้ช่วงหนึ่งไม่ยืนยันว่าทุกเครื่องอัปเดตครบ Legacy bot loader ที่ยังดึง bot.js จาก repo เดิมต้องย้ายเข้า private payload mode ก่อนปิด repo; งานนี้เปลี่ยนเฉพาะช่องทาง Manager ไม่ได้ย้าย legacy bot endpoint

Manager JS ที่แจก public ยังอ่านได้ตามปกติ การแยก repo ช่วยไม่แจก private bot source/payload ไม่ใช่การซ่อน Manager runtime ที่จำเป็นต้องแจกให้ผู้ใช้
