# รายการทดสอบก่อนปล่อย PmheeAether friends mode

อัปเดต 2026-10-13 — ห้ามเปิด production เพียงเพราะ unit tests ผ่าน ต้องตรวจครบทั้ง client/server/runtime/migration

## ผลที่มีแล้ว (candidate ยังไม่ใช่ release)

- Manager offline journal/coordinator: 9 tests ผ่าน รวม daily dedup, account isolation, old slot import, offline cached bootstrap, immutable lost-ACK batch, corrupt debt ไม่ล้างข้อมูล/ไม่หยุด cached bot
- Security bootstrap/builders รวม protocol 1+2: 16 tests ผ่าน
- Private owner-host + embedded solver/full runtime: 12 tests ผ่าน (backend 7 + private payload 5)
- Discord compatibility tests: 10 ผ่าน; UI contract ล่าสุด 4 ผ่าน
- Full Manager suite ครั้งแรก 100/101 ผ่าน; 1 failure เป็น assertion เก่าว่าต้องเปลี่ยนรหัส Proxy (“ชุดใหม่”) ซึ่งขัดคำสั่งเจ้าของที่ให้ใช้ชุดเดิมได้ แก้ assertion แล้วและ focused UI suite ผ่าน แต่ **ยังไม่ได้รัน full suite ใหม่หลังทุกการแก้ล่าสุด**
- Chrome headless fixture ภาพ wallet/bootstrap ตรวจแล้ว: `C:\Users\golf\AppData\Local\Temp\pmhee-friends-offline-ui-uOi9Pz\wallet.png`, `bootstrap.png`, `report.json` — เป็น fake wallet และ signed stub payload ไม่ใช่หลักฐานว่า real private source ทำงานครบใน Edge/Chrome
- ยังไม่ได้ทดสอบ cutover จริง, installed Windows Service, latest full ledger restore, Edge actual offline reload, admin machine UI ภาพจริง หรือ private auto-update patch ล่าสุด

## 1. ฐานข้อมูลและยอดกลาง

- [ ] Restore latest frozen D1 ลง SQLite ใหม่และ `PRAGMA integrity_check` ผ่าน
- [ ] จำนวนและ hash ทุก application table ตรงก่อน/หลัง export รวม accounts/token hashes, receipts, solves, wallet ledger, rates, acceptance, usage, slots/devices/bindings, catalog/security และ payload chunk bytes
- [ ] Trigger restore ไม่กระตุ้น credit/debit ของรายการเก่าซ้ำ
- [ ] ทดสอบคำสั่ง admin ปรับยอดบวก/ลบและยอดติดลบด้วย fixture ไม่ใช่เงินจริง
- [ ] แถว usage เดิมจาก online mode + offline event slot/day เดียวกันคิดเงินเพียงครั้งเดียว
- [ ] Historical rate snapshots ไม่ถูกเปลี่ยนตาม rate วันนี้; เวลาไทย 23:59:59/00:00:00 นับคนละวัน
- [ ] Maintenance ป้องกันรับเงิน/หักเงิน, pending receipt ทำให้ cutover หยุดได้, database import failure ไม่ activate ledger

## 2. Offline debt และ ACK

- [ ] ใช้ 1 จอหลาย refresh ในวันเดียวคิดครั้งเดียว; หลายจอคิดแยก; เปิดเกมเฉย ๆ ไม่ START BOT ไม่คิด
- [ ] Owner offline หลายวัน: ไฟล์แยกวัน, ยอดคำนวณต่อและติดลบได้, restart Manager ยังได้ยอดเดิม
- [ ] ส่งไม่ถึง/timeout/ส่งถึงแต่ ACK หาย/ACK หายแล้ว restart: body+batchId เดิม, serverไม่หักซ้ำ
- [ ] ACK บางรายการล้างเฉพาะรายการนั้น; event ใหม่ที่เกิดระหว่างส่งไม่หาย; history ยังอยู่
- [ ] ACK batch ผิด/รหัสแปลก/ยอดทศนิยมไม่ถูก units/schema เสีย/จำนวนเกิน limit ไม่ล้างหนี้
- [ ] 500+ events แบ่ง batch; retries ไม่ดึงยอดเก่าทับ topup/admin adjustment ใหม่
- [ ] ลบ/แก้/เสียหายของ journal/key: preserve evidence ไม่ reset debtเงียบและไม่ทำให้ bot/captcha จาก valid cache หยุด
- [ ] ไม่เก็บไฟล์ใน unrelated software dirs; ciphertext ไม่มีชื่อไอดี/ยอด/source อ่านตรง ๆ; DPAPI key ไม่รั่วใน log/ZIP/Git

## 3. Payload/loader/auto-update

- [ ] Valid signed real private 4.38.0 ใช้ใน Edge/Chrome และ Electron loader fixture ได้
- [ ] Tampered signature/hash/size/version/key ถูกปฏิเสธก่อน timers/exports/Plan engine เริ่ม
- [ ] เจ้าของ offline: current runtime ทำงานเกิน lease เดิมได้และ cached fresh page เปิดได้ ไม่มี API renew per screen
- [ ] first-ever download เมื่อ host offline แจ้ง failure ที่ถูกต้อง ไม่ fetch public bot เป็น fallback
- [ ] Signature checks อิสระจาก client boolean; ไม่เชื่อ trust keys ที่ serverส่งมา
- [ ] partial initialization/concurrent accepts/refresh during download/CDP reconnect ไม่สร้าง timers สองชุด
- [ ] update private hash/version ผ่าน safe refresh ทีละจอ; skip busy NPC/shop/recovery/refine/trade/Humancheck; START state คืนถูกต้อง
- [ ] ไม่มี refresh วนหรือ public compatibility bot overwrite private cache; latest metadata ไม่ทำให้โหลด payloadเดิมซ้ำทุกชั่วโมง
- [ ] Manager auto-update ส่งทุกโมดูลใหม่ครบ; customer ZIP เก่า updateได้โดยไม่ต้อง restart EXE/ปิดทุกเกม

## 4. แก้คำถามและสถิติ

- [ ] ฐานฝังใน private payload ตอบได้เมื่อ owner offline, ส่วนบุญ 0 และติดลบ โดยไม่เรียก billing/solve API
- [ ] ถูกต้องทั้ง text choices และ item choices; ambiguous/unknown ต้อง manual
- [ ] เกมไม่มีคำถาม/คำถามเปลี่ยน/หน้าต่างปิด/ปิด autoanswer ก่อน delay ห้ามส่งคำตอบค้าง
- [ ] บอทกับ Manager/Discord ไม่ตอบซ้ำ
- [ ] event stats บันทึกก่อน ACK, ACKหาย/Manager restart/หน้าเกม refresh ไม่เพิ่มสถิติซ้ำ
- [ ] ไอดี/profile/character ตรงและ event ข้ามเที่ยงคืนใช้วันที่จริง; ประวัติยังอยู่หลังเคลียร์คิว

## 5. เติมเงินและ admin UI

- [ ] Fixture verified topup เพิ่มยอดครั้งเดียว; already-used/expired/invalid คืนเหตุผลเดิม
- [ ] Provider timeout/ผลไม่แน่ชัดค้าง review ไม่ retry redeem; successแต่syncตามหลังล้มเหลวยังรายงาน success
- [ ] owner offline ไม่แสดงเติมสำเร็จโดยไม่มี receipt; cached history/yอด localยังดูได้
- [ ] Admin Access JWT signature/issuer/audience/expiry ผ่านและไม่รับ headerอย่างเดียว
- [ ] หน้า machines แสดง session/เครื่อง/lastSeen/ยอดจริง, stale countsไม่อ้างเป็นlive, user labelsไม่ทำ XSS
- [ ] Admin POST ผ่าน HTTPS origin จาก Tunnel ได้; Licensing healthและเส้นทางเดิมไม่เปลี่ยน
- [ ] ตรวจ screenshots หน้า Manager wallet/history/stats กับ admin machine/detail/adjustment จริงจาก fixture ก่อน release

## 6. Release gates

- [ ] `node -c` ทุก JS และ `node --check` ทุก MJS ที่แก้
- [ ] Full Manager / security / private backend+payload suites ผ่านหลัง patch สุดท้าย
- [ ] Review จาก agent อิสระและ Codex; บันทึกข้อจำกัดที่ยังเหลือ ห้ามอ้างว่ากัน memory extraction สมบูรณ์
- [ ] Release mirrors hashตรงทุกไฟล์, ZIP เปิดได้และไม่มี secrets/customerconfigs/daily files/private payload
- [ ] Latest ledger backup และ rollback ที่ไม่ย้อนธุรกรรมใหม่พร้อม
- [ ] เปิด production หลังผ่านทั้งหมดและการตรวจงานตามที่เจ้าของขอ อัปเดต TASKS/DEPLOYMENT_STATUS ให้ตรง แล้ว smokeแบบ read-only

ห้ามทดสอบกับซองเงินจริง ซื้อ/ขาย/เทรดของผู้ใช้ หรือหยุด PelicanManager.exe/PMheeLicensingApi/จอเกมจริงโดยไม่จำเป็น ใช้ Manager fixture พอร์ต3899 พร้อมปิด auto-update และ browser fixture โปรไฟล์แยก
