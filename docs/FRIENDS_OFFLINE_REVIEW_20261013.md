# ผลตรวจ candidate จาก agent — 2026-10-13

**ผล: ยังไม่ผ่านสำหรับ deploy/cutover** ตรวจ code ใน working tree และรันทดสอบจริง ไม่ได้ยึดคำว่า PASS ในรายงานอย่างเดียว รอบนี้เป็น read-only code review: ไม่แก้ implementation ไม่ freeze/export production ไม่เปิด service ไม่เปลี่ยน route ไม่ publish candidate

## ผลที่ยืนยันแล้ว

- Full Manager `node --test manager/tests/*.test.js`: **110/110 ผ่าน**
- Private `node --test owner-host/*.test.mjs protected-script/offline-human-check.test.js protected-script/offline-full-runtime.test.js`: **15/15 ผ่าน**
- PMheeAetheriaApi ยัง Stopped; PMheeLicensingApi และ PMheeCloudflared ยัง Running
- ตรวจภาพ Edge Manager และ Chrome admin machines แล้ว ภาพ admin แสดง fixture 2 เครื่องได้ ส่วนภาพ Manager แสดง 0 profiles และไม่ได้เปิด balance/history modal จึงยังไม่ยืนยัน flow ที่กล่าวในรายงาน

## ข้อที่ต้องแก้ก่อน release

### R1 — P1: deployment package ยัง stage/run ไม่ได้

ไฟล์ `private-api/deploy-owner-host.ps1`:

- บรรทัด61–62 ใช้ `Copy-Item -LiteralPath ...\*` ซึ่งถือ `*` เป็นชื่อ literal ไม่ใช่ wildcard ตรวจ `Test-Path -LiteralPath ...\owner-host\*` ได้ False; เมื่อ ErrorActionPreference=Stop staging จะหยุด ไม่ใช่ PASS
- บรรทัด67–68 wrapper `server.js` ใช้ CommonJS require แต่บรรทัด85สร้าง package.json เป็น type:module ทำให้ Node เกิด `require is not defined` ก่อน start
- package ไม่รวม API root `matcher.js` ที่ cloudflare/worker.mjs import อยู่ แม้แก้สองข้อแรกก็ยัง missing module ต้องรักษา CommonJS scope ของ matcher ด้วย
- ConfigPath ไม่มี/ผิดถูกข้ามเงียบที่บรรทัด119; -Install อาจหยุด service และเขียนทับ install ก่อนรู้ว่าคอนฟิกไม่พร้อม

ให้ทำ staging allowlist แบบ literal รายไฟล์ ไม่กวาด node_modules/.wrangler/fixtures/ops helpers; ตรวจ resolved stage path ก่อน recursive delete; validate config/latest migrated DB ก่อนแตะ installed service; รันทดสอบ package ที่ stage แล้วจริงด้วย fixture config/DB บนพอร์ตแยก ตรวจ health + signed manifest + auth API ไม่ใช่รัน source tests อย่างเดียว

### R2 — P1: ไม่ได้ป้องกัน refresh loop ข้ามรอบ

`manager-project/manager/bot_auto_update.js:277` ทุก updateCycle จะเรียก reloadClient สำหรับ hash เก่าอีก แม้รอบก่อน state:error และไม่มี hash ใหม่/คำสั่งเจ้าของใหม่

Reproduction จาก real updater (fake game only): checkNowครั้งแรก reloads=1/state:error; checkNowครั้งที่สอง hashเดิม reloads=2/state:error ตัว timerจริงเรียก updateCycleทุก15วินาที จึงเกิดการรีเฟรชซ้ำหลัง recovery timeout ได้ เทสต์ no-loop ปัจจุบันเรียก checkNowเพียงครั้งเดียวจึงไม่พบ

แก้โดยจำ failed target hash+profile และมี cooldown/backoff/explicit retry หรือปลดเมื่อ release ใหม่มาถึง ทดสอบอย่างน้อยหลาย cycle และ Manager restart ถ้าต้องกัน loopต่อเนื่องข้ามrestart

### R3 — P1: branch compatibility มี ReferenceError

`manager-project/manager/bot_auto_update.js:218` reloadClient ใช้ `threshold` ซึ่งมีเฉพาะ local scope ใน updateCycle เมื่อ compatibility recovery เห็น pageใหม่ที่ยังไม่มีเวอร์ชัน จะเกิด `ReferenceError: threshold is not defined`

Reproduce real reloadClient ผ่าน test-only export ของ function ในหน่วยความจำ ไม่แก้ source/ไม่แตะเกม: status.latest.managed=false, probeหน้าใหม่ inGame=true/version=null ได้ errorดังกล่าวจริง

ส่ง immutable target/threshold เข้า reloadClient หรือคำนวณอย่างถูก scope และเพิ่ม regression recovery-before-payload-ready สำหรับ legacy mode

### R4 — P1: delayed ACK ทับยอดใหม่หลัง topup/admin

`manager-project/manager/offline_journal.js:33` acknowledge รับ balanceUnits ทุก ACK มาทับ state โดยไม่มี wallet revision/sequence เปรียบกับ setConfirmedBalanceที่ใหม่กว่า

Reproduce real journal: ยอดเริ่ม1000units ใช้100units; sync serverสร้างACK900units แต่ networkยังไม่ส่งถึง; topupตามหลังทำให้ serverยืนยัน1900units; clientรับ topupและ setConfirmedBalance(1900); ACKเก่ามาถึงแล้ว acknowledgeทำให้ localbalanceกลับ900units และ pendingCount=0 จึงไม่ใช่การลบpendingซ้ำที่ตรวจได้ง่าย ยอดจริง serverยัง1900 แต่ UI/ไฟล์ในเครื่องถูกย้อนจน syncใหม่

เทสต์ concurrency ปัจจุบันส่ง ACK1900 ซึ่งเป็นยอดใหม่อยู่แล้ว จึงไม่ทดสอบ ordering ที่เสีย ให้มี authoritative wallet revision ใน topup/sync/admin/balance และแยก clear-ACK-events จากการรับ balance snapshot; stale revisionห้ามทับฐานใหม่ เพิ่ม integrationที่ delay responseจริง

### R5 — P1: cutover และ rollback proof ยังไม่ครบ

`private-api/owner-host/cutover.mjs:91` route-to-host ตรวจ healthอย่างเดียว ซึ่งไม่ตรวจความพร้อม signed offline manifest/payload หรือฐานในเครื่องตรงกับ exportที่ยืนยันล่าสุด ต้องผูก proofของlatest ledger+config และ authenticated manifest/hash/accountreadinessก่อนถอด Workerroute

Health ของ worker เดิมตรวจ maintenance อยู่แล้ว จึงไม่ได้กล่าวว่า health200ตอนmaintenance1 ประเด็นคือ healthผ่านได้แม้ OFFLINE_RELEASE_JSON/signing/payload configไม่พร้อม

`cutover.mjs:97` resume-cloudflare ตรวจเพียง hostไม่ตอบhealthและ Workerrouteกลับมา ไม่พิสูจน์ว่า hostไม่เคยรับธุรกรรมใหม่หลังcutover ถ้าหยุดhostหลังรับtopupแล้วเรียกresume อาจเปิดD1เก่าทิ้งรายการใหม่ ต้องป้องกันด้วย recorded cutover state + current local financial snapshot หรือ reconcile latest ledgerก่อน rollback

### R6 — P1: UI fixture ยังนำข้อมูลจริงไปใช้

`manager-project/scratch/run_ui_fixture_test.js:18` cpSyncทั้งmanager รวม data/accounts/profiles/customerconfigs ไป testcopy แต่ไม่ได้แทน credential/serviceOrigin ด้วย fixture ต้นทาง server.js:3489/3493 ยัง start coordinatorและauthSync แม้ TEST_INSTANCE; การปิดauto-updateสองตัวไม่แยกเกม/บัญชี/APIจริงออกทั้งหมด

อย่ารัน helperนี้ต่อจนแก้: copyเฉพาะsource allowlist, seed data/account/profilesสมมติ, mock requestJSON/ownerAPI และ POST game bridgeให้fixtureportsทั้งหมด, assertว่าคำขอออกนอกfixtureoriginถูกปฏิเสธ ห้ามนำภาพจากสำเนาที่มีcustomerdataมายืนยันว่าเป็นmockครบวงจร

## ข้อแก้คุณภาพเทสต์ / เอกสาร (P2)

- captcha_stats_delayed.test.js นิยาม recordCaptchaSolvedใหม่ในtest ไม่ใช่ใช้ฟังก์ชันจริงในserver จึงพิสูจน์การบันทึกก่อนACK/atomic write/ข้ามวันในimplementationไม่ได้
- cutover.test.mjs คัดลอกchunkerและSQLfreeze conditionแทนเรียก cutoverจริง; ไม่มี export/restore/failure recovery; foreign-key testไม่ได้เปิด PRAGMAforeign_keysหรือทดสอบinvalidreferenceจริง
- offline_journal_extended ที่ชื่อ corrupt history ไม่ได้แก้ข้อมูลให้เสียจริง; concurrencycaseยังไม่ครอบคลุม stale ACK
- history truncate2000records ทำให้เครื่องจำนวนมาก/ออฟไลน์นานประวัติหาย ขณะที่ข้อกำหนดให้historyอยู่หลังclear หนี้ ต้องกำหนด retention หรือแยกhistoryarchive และ mergeประวัติจริงจากserver (syncACKตอนนี้ไม่มีstatementhistory)
- TASKS.md คำว่า StageOnly PASS100%/no-loopผ่าน ยังขัดกับ sourceจริง ต้องแก้สถานะให้ตรงกับหลักฐานนี้; sync TASKS/TEST_PLAN กับ docsที่ติดตามในGitหลังแก้
- ต้องทดสอบ full real signed private payload 4.38.0 บน EdgeและChrome พร้อมoffline reload/embedded solver/stats ไม่ใช่เพียงเปิดหน้าManager/adminหรือsignedstub
- ขั้นตอน cutoverต้องยอมรับ controlled maintenance window ไม่อ้างไม่มี downtime; โค้ดManagerต้องพร้อมส่งอัปเดตก่อนให้ลูกค้าใช้protocol2 และต้องรักษา protocol1สำหรับruntimeเก่าจนsafe refreshเสร็จ

## งานรอบแก้ที่แนะนำ

1. แก้ R1–R6 และเพิ่ม regressionที่เรียก implementationจริง
2. ทดสอบ sourceและstaged packageครบ โดยไม่ใช้account/customerdataจริง
3. ทดสอบ privatepayloadจริง + หนี้/ยอดแบบresponseout-of-order และตรวจscreenshotsจริง
4. อัปเดตTASKS/TEST_PLANพร้อมหลักฐาน แล้วส่งCodexตรวจใหม่
5. ยังไม่เปิดservice/freezeD1/เปลี่ยนroute/pushcandidate จนผ่านreviewและเจ้าของอนุญาต
