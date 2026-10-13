# Codex review รอบ 5 — 2026-10-13

สถานะ: แพ็กเกจและ backend integration ผ่านแล้ว แต่ยังไม่ผ่าน production cutover ไม่มีการ deploy หรือแก้ข้อมูลเงินจริงในรอบตรวจ

## ยืนยันว่าแก้แล้ว

- DELETE route และตรวจ removal สำเร็จก่อนบันทึก routed-to-host; go-live ตรวจ route absence และ public HTTPS identity
- rollback เช็ก TCP listener และ local maintenance เพิ่มจาก health ไม่ถือ health error อย่างเดียวว่า service หยุด
- Manager 146/146 และ owner-host/payload 32/32 ผ่านจากการรันซ้ำ
- Private artifact 4.38.0 SHA256 `529f4fcba61ecd546478b3d0e334b6db712e3f9cfe22701a0543198e55487534`: size/hash ตรง source ที่ instrument ล่าสุด และ offline signature ตรวจด้วย public pin ผ่าน
- ZIP 84 entries SHA256 `B7E2C09551FCC43595C1DBA87F6850C0F0E9AE397116D92202912E1E722AC4BD`: hash ทุก entry ตรง release mirror และโมดูลหนี้ครบ ไม่มี configs/credentials/private payload/signing keys พบเฉพาะ empty sessions directory และ public item catalog ตาม allowlist
- Transition test ใช้ actual owner handler/SQLite แทน fake backend แล้ว และ duplicate event ยืนยัน original ledger rate100 ไม่หักซ้ำ

## R5.1 — readiness ต้องยืนยัน DB ที่บริการเปิดจริง

`cloudflare/worker.mjs` health ส่ง cutoverLabel และ releaseHash จาก config พร้อม hardcode schemaVersion owner-v1; ไม่อ่าน schema/release/proof identity จาก DB ที่ listener ใช้ CLI ตรวจ proof อีก connection ตาม config ที่อ่านของตัวเอง จึงยังมีกรณี listener ใช้ DB อีกไฟล์แต่ค่าตั้งชื่อ/hash เหมือนกันแล้ว health ผ่าน ต้องมี owner-only readiness ที่อ่าน schema/release/chunks และ identity ของฐานที่ service เปิดจริง ผูก fingerprint/operation identity ในฐาน prepared กับ proof และยืนยันก่อน go-live โดยไม่เผย path/secret

## R5.2 — tests ต้องเรียก orchestration ที่ CLI ใช้จริง

`owner-host/cutover.test.mjs` มี simulateRouteToHostDeleteFail/simulateRouteRemovalUnconfirmed/simulateResumeCloudflare ที่เขียนลำดับเอง เทสต์ไม่ได้เรียก implementation ของ cutover.mjs จึงผ่านแม้ CLI เปลี่ยนกลับผิด แยก phase implementation ให้ inject transport/state/DB แล้วใช้ฟังก์ชันเดียวกับ CLI ทดสอบ DELETE fail, verification fail, crash recovery, identity mismatch, route restore fail และ local maintenance/port guard ไม่มี live Cloudflare mutation

## หลักฐานและลำดับปล่อยที่ยังต้องครบ

- Backend/coordinator integration ผ่าน แต่ legacy coordinator ใน transition test ยังเป็นตัวนับ และ eval/reload ใช้ fleet object ไม่ได้ execute actual legacy runtime/lease/bootstraps ร่วมกัน เพิ่ม fixture integration เส้นทางนี้ก่อนอ้าง end-to-end migration
- ขั้นเติมเงินในเทสต์ INSERT SQL ตรวจ reconcile หลัง credit ไม่ใช่ redeem flow ทั้งเส้นทาง ใช้ fake provider ใน fixture ทดสอบ Manager entry point/handler แทนซองเงินจริง
- manager/server.js เปิด offline coordinator โดย default เว้น PMHEE_SCRIPT_LEGACY_MODE=1; ห้าม push runtime นี้ให้ผู้ใช้ auto-update ก่อน owner host/offline endpoints พร้อม ต้องกำหนด opt-in rollout หรือ coordinated maintenance/release ที่ตรวจ endpoints ก่อน switch ให้ชัด

ส่งกลับตรวจ R5.1/R5.2 และหลักฐานข้างต้นก่อน production migration; ไม่ต้องแก้ ZIP/hotfix ที่ยืนยันตรงแล้วซ้ำหาก source ไม่เปลี่ยน เมื่อ source เปลี่ยนจึง rebuild artifact ที่เกี่ยวข้อง
