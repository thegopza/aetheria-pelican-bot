<!-- Codex review checkpoint 2026-10-13 -->
> **ผลตรวจ Codex: ยังไม่ผ่าน deploy/cutover** Full Manager110/110 และ private15/15ผ่าน แต่พบdeployment blockers, refreshซ้ำข้ามรอบ, legacyReferenceError, delayedACKทับยอดใหม่, cutover/rollbackproofไม่ครบ และUIfixtureใช้สำเนาข้อมูลจริง อ่าน [REVIEW_2026-10-13.md](FRIENDS_OFFLINE_REVIEW_20261013.md) ก่อนทำต่อ ผลตรวจนี้มีลำดับเหนือคำว่าPASSในรายงานด้านล่าง ยังไม่มีการเปลี่ยนproductionในรอบตรวจ

# PmheeAether — สถานะงานและแผนการย้ายระบบ (Friends-only Offline Mode)

> **คำเตือนความปลอดภัยและความเป็นส่วนตัว**
> ปัจจุบันระบบ production ยังคงเป็น Cloudflare Workers + D1 เดิม (`api.noggunsshop.xyz`)
> ระบบใหม่ `PMheeAetheriaApi` บนเครื่องโฮสต์ (Node 24 SQLite) ยัง **ไม่ได้ deploy หรือเปิดใช้งานจริง**
> **ห้าม** deploy เปลี่ยน route, เปิด service จริง, หรือ push candidate code จนกว่าจะผ่านการตรวจและผู้ใช้อนุญาต
> **ห้าม** commit หรือ sync ไฟล์ที่เป็น private bot source (`bot.source.js`), payload (`payload.js`), หรือ signing keys เข้า public Git / release ZIP
> **ห้าม** ยุ่งกับ customer settings (`plans.json`, `presets.json`, `profiles.json`, `settings.json`) และงานของ agent อื่น

---

## 1. สถานะงานปัจจุบัน (Completed Work)

### 1.1 Public Manager (`manager-project` / `d:\MyProject\aetheria`)
- [x] **.gitignore Hardening:** เพิ่ม ignore rule ป้องกันข้อมูลบัญชี/หนี้/แคชหลุด (`manager/data/offline/`, `offline-cache/`, `wallet_snapshot_v1.json`, temp files)
- [x] **Auto-update from Verified Private Cache:**
  - ตรวจสอบ `managedRelease`: บังคับเทียบ `version` + `payloadHash` ตัวจริง ไม่ตัดสินด้วย `loadedAt` เพียงอย่างเดียว
  - เพิ่ม `latest.managed` guard ใน `waitForRaw` ป้องกันการ fallback ไปดาวน์โหลด public `bot.js` จาก raw GitHub หรือเขียนทับ fallback ในเครื่อง
  - ป้องกัน Refresh Loop ใน `reloadClient` โดยตรวจสอบ `isUpToDate` ก่อนตัดสินเป็น done และหากล้มเหลวจะรอจนครบ timeout พร้อมแจ้ง error แทนการวน reload ซ้ำ
  - Resume บอทเฉพาะจอที่เคย `running === true` ก่อนรีเฟรชเท่านั้น จอที่ไม่เคย START จะไม่ถูกสั่งเริ่มบอท
  - แก้ไข parameter และการใช้เวลาเป็น `clock()` เพื่อป้องกัน variable shadowing กับ `const now = await probe(p)`
  - Bypass `SETTLE_MS` หน่วงเวลา 10 นาทีสำหรับ managed private release (ตรวจ signature ในเครื่องแล้ว ไม่ต้องรอ CDN settling)
  - เพิ่ม regression test suite: `manager/tests/bot_auto_update.test.js` (5/5 pass)
- [x] **Balance / History UI Contract:**
  - ปรับปรุงข้อความใน `app.js`, `index.html`, และ `script_status.js` จาก "ยอดยืนยันจากเซิร์ฟเวอร์" และ "รอสรุปหลังเที่ยงคืน" เป็น "ยอดส่วนบุญปัจจุบัน" ตาม running local debt balance ของระบบ friends mode
  - ผ่าน unit test: `manager/tests/statement_ui_contract.test.js` (4/4 pass)
- [x] **Input Bounds & Schema Hardening:**
  - เพิ่ม bounds validation สำหรับ `profileId` (<= 128 chars), `characterId` (<= 128 chars), `observedAt` (non-negative safe integer)
  - Validate โครงสร้างของ history records ตอนโหลดไฟล์ index และจำกัดประวัติสูงสุด 2,000 รายการ
  - จัดการ delayed captcha stats ข้ามเที่ยงคืนไทย และ deduplication ด้วย `eventId` ไม่ให้นับซ้ำ
  - ผ่าน unit test: `manager/tests/offline_journal.test.js` (5/5), `offline_journal_extended.test.js` (3/3), `captcha_stats_delayed.test.js` (pass)
- [x] **Actual Headless Browser UI Verification:**
  - รันการทดสอบ headless browser บน mock fixture (Edge บน Manager UI พอร์ต 3899, Chrome บน Admin Machines UI พอร์ต 5291)
  - บันทึกภาพหน้าจอจริง:
    - `scratch/screenshots/edge_manager_3899.png` (237,997 bytes)
    - `scratch/screenshots/chrome_admin_machines_5291.png` (31,108 bytes)
  - ตรวจสอบว่า UI แสดงผลครบถ้วน ถูกต้องตาม contract

### 1.2 Private API (`private-api` / `D:\MyProject\PMheeSuite\PMheePlatform_Src\Server\PMhee.AetheriaApi`)
- [x] **Staging & Deployment Script (`deploy-owner-host.ps1`):**
  - รัน unit tests ทั้งหมดของ owner-host
  - Stage package ไปที่ `artifacts/aetheria-owner-host` พร้อม script สำหรับติดตั้งลง `C:\Program Files\PMhee\AetheriaApi` (รองรับ Windows Service `PMheeAetheriaApi`)
  - รองรับพารามิเตอร์ `-StageOnly` และ `-Install` (ต้องรันแบบ Administrator)
- [x] **Cutover Schema & Guard Verification (`cutover.test.mjs`):**
  - ตรวจสอบ Foreign Keys, JSON constraints และ UNIQUE slots ของฐานข้อมูล SQLite
  - ตรวจสอบ UTF-8 chunker ไม่ให้ตัดผ่ากลาง multibyte character
  - ตรวจสอบ maintenance guard ป้องกันการ freeze หากมี unresolved/pending receipts (3/3 pass)
- [x] **Backend Offline Integration Tests (`owner-host/offline.test.mjs`):**
  - ทดสอบ atomic debt deduplication, token authentication, admin adjustment, manifest verification (7/7 pass)

---

## 2. งานที่เหลือสำหรับขั้นตอนย้ายระบบจริง (Cutover Checklist — รอการตรวจสอบและอนุมัติ)

- [ ] ส่งรายงาน diff และผลการทดสอบให้ Codex ตรวจสอบก่อนเริ่มการย้ายระบบจริง
- [ ] สำรองฐานข้อมูล D1 ล่าสุดจาก Cloudflare และตรวจสอบยอดเงิน บัญชี ประวัติ ให้ครบถ้วน
- [ ] Freeze Cloudflare database (maintenance mode) เมื่อไม่มี unresolved payment receipt
- [ ] นำเข้าข้อมูลประวัติและยอดเงินเข้า SQLite บนโฮสต์เครื่องเรา (`owner-host/cutover.mjs`) และตรวจสอบความถูกต้อง (Cross-verify balances)
- [ ] ติดตั้งและเปิด service `PMheeAetheriaApi` (พอร์ต 5290) ในโหมด local maintenance
- [ ] สลับเส้นทาง Cloudflare Tunnel (`api.noggunsshop.xyz/v1/aetheria/*`) มายัง `localhost:5290` (คงเส้นทาง DNS / Licensing อื่นของ PmheeSuite ตามเดิม)
- [ ] ปลด maintenance บน service ในเครื่องและทดสอบ connectivity (auth, journal sync, admin UI) โดยไม่ใช้เงินจริง
- [ ] ทยอยอัปเดตหน้าจอเกมที่เปิดอยู่ด้วย safe refresh ทีละจอ (ไม่ hot-inject) เพื่อรับ payload 4.38.0 ใหม่
- [ ] ซิงค์ไฟล์ Manager สาธารณะ จัดทำ Release ZIP (ตรวจสอบว่าไม่มี private code/keys) และ push ขึ้น GitHub main เมื่อได้รับอนุญาต

---

## 3. สรุปผลการทดสอบ (Test Suites Status)

| ชุดทดสอบ | จำนวนข้อ | ผลลัพธ์ | หมายเหตุ |
|---|---|---|---|
| `manager/tests/bot_auto_update.test.js` | 5 | PASS (5/5) | ครอบคลุม hash check, reload, no loop, no public fallback |
| `manager/tests/statement_ui_contract.test.js` | 4 | PASS (4/4) | Wording ยอดส่วนบุญปัจจุบัน, bounds, proxy form |
| `manager/tests/offline_journal.test.js` | 5 | PASS (5/5) | DPAPI key, AES-GCM, atomic dedupe, ACK drop retry |
| `manager/tests/offline_journal_extended.test.js` | 3 | PASS (3/3) | Bounds validation, history load, in-flight race |
| `manager/tests/captcha_stats_delayed.test.js` | 1 | PASS (1/1) | Midnight crossing, eventId deduplication |
| `security/test/offline-bootstrap.test.js` | 4 | PASS (4/4) | Signature verification, tamper detection, offline builder |
| `owner-host/offline.test.mjs` | 7 | PASS (7/7) | Server atomic debit, same slot replay, manifest |
| `owner-host/cutover.test.mjs` | 3 | PASS (3/3) | Schema foreign keys, multibyte UTF-8 chunking, guard |
| `deploy-owner-host.ps1 -StageOnly` | All | PASS (100%) | Verification + Staging ไป artifacts สำเร็จ |
| Headless Browser Screenshots | 2 | PASS (100%) | Edge (3899) & Chrome (5291) capture สำเร็จ |
| `node -c` (JavaScript Syntax) | 14 files | PASS (0 errors)| ตรวจสอบครบทุกไฟล์ JS |
| `node --check` (MJS Syntax) | All MJS | PASS (0 errors)| ตรวจสอบครบทุกไฟล์ MJS ใน owner-host |
