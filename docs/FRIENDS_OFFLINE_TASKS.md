# งานต่อ: PmheeAether ใช้เซิร์ฟเวอร์เครื่องเจ้าของ + ทำงานออฟไลน์

อัปเดต: 2026-10-13 — เจ้าของขอให้หยุดพัฒนาต่อในรอบนี้ จัดโฟลเดอร์และร่างงานก่อน แล้วให้ agent อื่นเขียนโค้ดและ Codex ตรวจงาน

## สถานะจริงตอนส่งต่อ

- [x] จัดทางเข้ารวม `D:\MyProject\PmheeAether` พร้อม README / AGENTS / TASKS / TEST_PLAN
- [x] `manager-project` เชื่อมไปยัง source จริง `D:\MyProject\aetheria`
- [x] `private-api` เชื่อมไปยัง source จริง `D:\MyProject\PMheeSuite\PMheePlatform_Src\Server\PMhee.AetheriaApi`
- [x] สร้าง `trash` และย้าย one-off patch helpers ที่เลิกใช้แล้ว 3 ไฟล์ พร้อม inventory
- [x] ตรวจ service เดิม: `PMheeAetheriaApi` มีอยู่แล้ว แต่ Stopped / Manual; Licensing กับ Cloudflared กำลังทำงานแยกกัน
- [x] เริ่ม implementation candidate ใน source ทั้งสองชุดก่อนคำสั่งหยุดล่าสุด — ต้องตรวจและต่อยอด ไม่สร้าง source อีกชุด
- [x] ทดสอบหน่วยและบาง integration ของ candidate แล้ว รายละเอียดอยู่ TEST_PLAN.md
- [ ] ตรวจรวม candidate ทุกไฟล์และแก้รายการค้างด้านล่าง
- [ ] ทดสอบ Edge/Chrome กับระบบครบวงจรตาม TEST_PLAN.md
- [ ] ย้ายฐานล่าสุดจาก Cloudflare มายังฐานใหม่ในเครื่องเจ้าของ
- [ ] เปิด service เดิมด้วย implementation ใหม่ และเปลี่ยนเฉพาะ route Aetheria
- [ ] ทำ release / ZIP / commit / push หลังผ่าน review

**ยังไม่ได้ freeze D1, export ฐานรอบ cutover, เปิด service, เปลี่ยน route หรือปล่อยโค้ดใหม่** Cloudflare ยังคงเป็นบัญชียอดจริงเพียงชุดเดียว ห้ามเปิด SQLite เก่าที่ service เคยใช้

## ข้อกำหนดที่เจ้าของยืนยันแล้ว

1. ผู้ใช้เป็นกลุ่มเพื่อน ต้องการกันเปิดอ่าน bot.js ง่าย ๆ ไม่ต้องการระบบตรวจสิทธิ์ออนไลน์ถี่ ๆ
2. payload ตรวจลายเซ็นและ hash; เก็บเข้ารหัสชื่อสุ่มในพื้นที่ข้อมูลของ Manager และรันจากหน่วยความจำ ไม่แอบใส่โฟลเดอร์ Windows/โปรแกรมอื่น
3. หลังดาวน์โหลดครั้งแรก บอทและแก้คำถามต้องทำงานต่อได้ขณะเครื่องเจ้าของออฟไลน์ โดยไม่มี lease หมดอายุใน friends mode
4. ฝังตัวแก้คำถามและฐานคำตอบไว้ใน private payload; ไม่เช็กส่วนบุญหรือ server ก่อนตอบ; คำตอบไม่แน่ชัดให้ผู้ใช้ตอบเอง
5. Manager แสดงสถิติแก้คำถามตามไอดีและประวัติเหมือนเดิม เก็บข้าม refresh และป้องกันบอทกับ Manager ตอบซ้ำ
6. ราคา 1 บาท = 1 ส่วนบุญ = 100 integer units ต่อจอที่ใช้บอทจริงต่อวันไทย; ใช้ stable slotId; reload/เปิดใหม่จอเดิมในวันเดียวไม่เก็บเพิ่ม
7. หนี้ค้างแบ่งไฟล์รายวัน เข้ารหัส; แสดงยอดตามปกติจากยอดยืนยันล่าสุดลบรายการค้าง แม้เจ้าของออฟไลน์ ไม่เพิ่มป้ายรอซิงค์ใน flow ผู้ใช้
8. ส่งรายการทุกชั่วโมง ตอนเที่ยงคืนไทย และเมื่อเชื่อมต่อกลับมา; server ยืนยันรับแล้วจึงเคลียร์รายการที่ ACK สำเร็จ; history ยังอยู่; lost ACK/retry/restart ต้องไม่คิดซ้ำ
9. เจ้าของดูเครื่อง/session/ยอดและปรับยอดกลางได้; เครื่องที่ขาดการเชื่อมต่อเป็นข้อมูลล่าสุดที่เคยรายงาน ไม่อ้างว่าเป็นจำนวนสด
10. เติมเงินจริงต้องเชื่อมต่อ host เจ้าของและตรวจรับสำเร็จก่อนเพิ่มยอด ไม่มีการรับซองจริงเพื่อทดสอบโดย agent
11. ยอมรับว่าผู้ใช้ควบคุมเครื่องสามารถลบรายการที่ยังไม่ส่งหรือดึงโค้ดจากหน่วยความจำได้; encryption ไม่ใช่การป้องกันสมบูรณ์

## ไฟล์ candidate ที่มีแล้ว

### Public Manager source — `manager-project`

- `manager/offline_journal.js`: ไฟล์หนี้รายวัน AES-GCM, DPAPI key, stable slots, immutable pending batch, explicit ACK และยอด local
- `manager/offline_payload_cache.js`: แคช payload เข้ารหัสและตรวจ P-256 signature/hash
- `manager/offline_coordinator.js`: โหลด/เปิด payload ใหม่, hourly/midnight sync, journal errors, compatibility runtime เดิม
- `manager/offline_script_bootstrap.js`: protocol 2, ไม่มี expiry หลังตรวจ signed release สำเร็จ
- integration: `manager/server.js`, `human_check_solver.js`, `discord_bot.js`, `script_coordinator.js`, `public/script_status.js`
- `manager/bot_auto_update.js`: ร่างการอัปเดตจาก verified private cache แทน public bot.js **เพิ่งแก้และยังไม่มี regression test ครบ**
- `manager/public/index.html`, `script_status.html`: cachebuster candidate เท่านั้น
- tests: `manager/tests/offline_journal.test.js`, `offline_coordinator.test.js`
- tooling: `security/offline_bootstrap.js`, `build-offline-payload.js`, `security/test/offline-bootstrap.test.js`
- public `bot.js` ยังคง compatibility 4.36.2 ไม่ใช่ source ที่ต้องแก้ feature ใหม่

### Private source — `private-api`

- `owner-host/sqlite-d1.mjs`: Node 24 SQLite adapter เพื่อใช้ SQL/ledger เดิมของ Workers
- `owner-host/schema.sql`, `offline.mjs`: รับ daily events/เครื่อง/session, atomic debit, fresh balance ACK, dedupe usage เดิม
- `owner-host/server.mjs`, `admin-ui.mjs`: owner host, API เดิม, admin inventory ภายใต้ Access และ catchup billing ช่วงเปลี่ยนผ่าน
- `owner-host/offline.test.mjs`: ชุดทดสอบ backend
- `owner-host/cutover.mjs`: ร่างเครื่องมือ freeze/export/verify/prepare/route มีผลกับ production เมื่อสั่ง **ห้ามรันทันทีโดยไม่ผ่าน checklist**
- `protected-script/bot.source.js`: candidate 4.38.0 ฝัง solver/catalog และ durable answer events
- tests: `protected-script/offline-human-check.test.js`, `offline-full-runtime.test.js`

Private artifact ที่สร้างแล้ว: `D:\MyProject\PMheeSuite\PMheePlatform_Src\artifacts\aetheria-friends-offline-candidate` version 4.38.0, hash `c09fb5bfca695dcd8fa643dd74eff18b24d1392915073fb4dadd2566363e314a`, 1,184,203 bytes. นี่คือ build candidate ไม่ได้ deploy ห้ามคัดลอก payload/signing keys เข้า public Git หรือ ZIP

## งานค้างที่ agent ต่อไปต้องทำ

- [ ] อ่าน AGENTS ทั้ง hub/public/private และเอกสารต้นทางก่อนแก้
- [ ] `git status` ทั้งสอง repo; candidate ยัง uncommitted; แยกงานของเจ้าของ/agent อื่น ห้ามกวาดรวม
- [ ] ตรวจ auto-update จาก private cache: เปรียบ version+payloadHash จริง, ไม่ใช้ loadedAt อย่างเดียว, ไม่โหลด public fallback ทับ, ไม่ refresh วน, resume เฉพาะจอที่เคย START
- [ ] เพิ่ม regression tests สำหรับ auto-update candidate ก่อนใช้งานจริง
- [ ] ตรวจ balance/history UI: candidate ยังมีข้อความว่า “ยอดยืนยันจากเซิร์ฟเวอร์”/“รอสรุปหลังเที่ยงคืน” ในบางส่วนที่ไม่ตรงกับ local running balance ให้ใช้ข้อความปกติที่ถูกต้อง เช่น “ยอดส่วนบุญปัจจุบัน” โดยไม่อ้างว่ายืนยันจาก server ทุกขณะ
- [ ] เพิ่ม `.gitignore` สำหรับ `manager/data/offline/`, `offline-cache/`, `wallet_snapshot_v1.json` และ temp ที่เกี่ยวข้อง ห้ามแจก daily debts/keys/customer data ใน release
- [ ] ตรวจ input bounds และ schema ของไฟล์พักหนี้/ACK, concurrency balance admin/topup ระหว่าง in-flight batch, full history หลัง restart และ delayed captcha stats ข้ามเที่ยงคืน
- [ ] ทดสอบ actual Edge + Chrome กับ real private candidate บน fixture ไม่มีเกมจริง/เงินจริง และตรวจรูป UI จริงทั้ง Manager และ admin machine page
- [ ] จัด installation/deployment script สำหรับ service เดิมโดยใช้ฐานใหม่ที่ restore จาก latest D1; service มี ACL ต้องใช้ UAC; ยังไม่ได้สร้าง deployment script ในรอบนี้
- [ ] ตรวจและทดสอบ `cutover.mjs` ด้วยสำเนาก่อน: schema columns/foreign keys/trigger order, snapshots ทุก table+payload chunks, failure recovery, maintenance, schedules, route guard
- [ ] สำรองฐานล่าสุด, freeze เมื่อไม่มี pending/verified receipt, import/verify account tokens/ledger/history/usage/rates ทั้งหมด ห้ามสอง ledger รับรายการพร้อมกัน
- [ ] เปิด local maintenance ของฐานใหม่อย่างมีขั้นตอน โดย Cloudflare เดิมยัง frozen; ตรวจ host/auth/admin/topup connectivity แบบไม่ redeemเงินจริง
- [ ] เปลี่ยนเฉพาะ `api.noggunsshop.xyz/v1/aetheria/*` ไป Tunnel localhost:5290; DNS, Licensing และ service Cloudflared เดิมต้องไม่เสีย
- [ ] ทดสอบ migrate runtime 4.37.x ด้วย safe refresh ทีละจอ; ห้าม hot-inject ทั้งไฟล์; จอเก่ายังมี lease จนโหลดใหม่ จึงยังไม่ถือว่าออฟไลน์ได้ครบ
- [ ] sync public Manager files ไป release copies; สร้าง ZIP ที่ไม่มี private source/payload/keys/data; syntax checks; independent review; commit เฉพาะ owned files; push public main ตาม AGENTS
- [ ] อัปเดต authority/deployment status ใน TASKS, FRIENDS_OFFLINE_HOST และ private DEPLOYMENT_STATUS ให้ตรงของจริง

## งานของเจ้าของ/อื่นที่ห้ามรวม commit

Public repo มี customer edits เดิมใน `manager/plans.json`, `presets.json`, `profiles.json`, `settings.json` ห้าม revert หรือ stage รวม Private repo มีงานเดิมใน `README.md`, `security_events.js`, `server.js`, `service.js` และ `.wrangler/` ที่ไม่ใช่งานรอบนี้ ตรวจ status ใหม่ก่อน commit

## การสานต่อ

ให้ agent ถัดไปเริ่มจาก TASKS และ TEST_PLAN นี้ ต่อ candidate ที่มีแล้ว ส่ง diff/ผลทดสอบให้ Codex ตรวจ ก่อนการย้ายจริงหรือ release ไม่ใช่ตีความว่าการมีไฟล์ใหม่หมายถึงใช้งานจริงแล้ว
