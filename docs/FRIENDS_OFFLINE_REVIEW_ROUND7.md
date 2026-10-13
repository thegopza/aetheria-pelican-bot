# Codex review รอบ 7 — 2026-10-13

R6.1 และ R6.3 ปิดแล้ว โมดูล coordinated มี health whitelist, wrapper timer/singleflight/stop และ lazy wallet bind/detach จริง Manager153/153 และ private cutover/payload33/33 ผ่านจากการรันซ้ำ ไม่มี production mutation

## R7.1 — P1: server wiring ไม่ส่ง accountId ให้ durable activation

manager/server.js ตอนสร้าง createCoordinatedScriptCoordinator ส่ง getSettings: () => installer.loadSettings() ซึ่งเป็น settings ตัวติดตั้ง ไม่มี accountId; accountId จริงมาจาก humanCheckSolver.loadSettings()

manager/coordinated_coordinator.js บันทึก activation เมื่อ settings.accountId มีค่าเท่านั้น และคืนโหมดหลัง restart เมื่อ accountId ตรงกัน ดังนั้น server จริงจะไม่สร้าง script_coordinator_activation.json แม้ตรวจ host สำเร็จ ขณะที่เทสต์ป้อน accountId ด้วย object เองจึงไม่พบปัญหา

Harness ใช้ wiring shape เดียวกับ server: service มี accountId จริง แต่ getSettings เป็น installer settings → firstMode=offline, activationSaved=false, restartMode=legacy แม้ offline release cache มีและ host ติดต่อไม่ได้

แก้เฉพาะ wiring ให้ส่ง settings ตัวติดตั้งพร้อม accountId ของ service เช่น getSettings: () => ({...installer.loadSettings(), accountId:humanCheckSolver.loadSettings().accountId}) หรือแยก getAccountIdentity เพื่อไม่ผูก identity กับ installer

เพิ่ม regression ที่ใช้การประกอบ dependency ของ server จริง/ฟังก์ชันร่วมกัน ไม่ fake accountId ใน getSettings: activateแล้วไฟล์มี accountId/origin; restartตอนhostofflineต้องoffline; เปลี่ยนบัญชีแล้วไม่รับactivationเก่า จากนั้นรันเทสต์ที่เกี่ยวข้องและ sync server/rebuildZIPตรวจhashใหม่

อย่าย้อนแก้ cutover หรือ R6.1/R6.3 ที่ผ่านแล้วในงานนี้ เหลือ R7.1 จุดเชื่อมหลักก่อนตรวจแพ็กเกจสุดท้ายและ controlled deployment
