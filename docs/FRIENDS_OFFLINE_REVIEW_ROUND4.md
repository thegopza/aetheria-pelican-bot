# Codex review รอบ 4 — 2026-10-13

ผล: ยังไม่ผ่าน release/cutover ไม่มีการเปลี่ยน production ในรอบตรวจนี้

ตรวจรายงาน agent แล้วรันทดสอบจริง: Manager 146/146 และ owner-host/payload 28/28 ผ่าน การย้าย health ก่อน maintenance แก้ deadlock เดิมจริง private source รวม config/prefs ของ captcha hotfix แล้ว แต่ข้ออ้างว่าครบทุกข้อยังไม่ตรงกับแพ็กเกจและหลักฐานการทดสอบ

## R1 — P1: phase ย้าย route ถูกบันทึกก่อนลบสำเร็จ

`private-api/owner-host/cutover.mjs` บันทึก routed-to-host ก่อน DELETE และยืนยัน route removal หาก DELETE ล้มเหลว phase ยังอนุญาต go-live ซึ่งเปิด local ledger ทั้งที่ผู้ใช้ยังเข้า frozen Worker และ state live ทำให้ rollback ปกติถูกปฏิเสธ ต้องบันทึก phase หลังยืนยัน และ go-live ต้องตรวจ route ซ้ำ ทดสอบ DELETE failure และ interrupted operation โดยเรียก orchestration จริงกับ Cloudflare fixture ห้ามใช้บัญชี production

## R2 — P1: health ไม่ยืนยันฐานและเส้นทางจริง

route-to-host/go-live ตรวจ loopback success เท่านั้น ไม่ยืนยันบริการใช้ฐาน/config/release ที่ตรวจ proof และ public HTTPS ผ่าน tunnel ถึง host ตัวเดียวกัน ต้องมี readiness identity ของ cutover operation/schema/release และทดสอบ public path ก่อนเปิดเขียน ข้อมูลตอบกลับต้องไม่เปิดเผย credentials หรือ path ฐาน

Rollback ใช้ health=false แทน service stopped ซึ่ง timeout/429/503 ก็ทำให้ false ได้ ต้องยืนยัน process/service หยุดจริงและ local maintenance ก่อนตรวจ proof/restore route ไม่ปลดล็อกสอง ledger พร้อมกัน ทดสอบ process ยังรันแต่ health error และ route restoration failure

## R3 — P1: artifacts/ZIP ยังเป็นรุ่นเก่า

ZIP SHA256 ยังเป็น `5A582CAE059047126323387133CD008FA61CD6E5AF75AD123BDACDA042B0EB3A` ของ captcha hotfix เดิม ไม่มี offline_coordinator.js, offline_journal.js, offline_payload_cache.js, offline_script_bootstrap.js หรือ captcha_stats.js และ release mirror server/script_coordinator/human_check_solver/bot_auto_update ต่างจาก candidate

private artifacts/aetheria-friends-offline-candidate/release.json ยัง hash `c09fb5bfca695dcd8fa643dd74eff18b24d1392915073fb4dadd2566363e314a`; payload.js ไม่มี __pmHumanCheckSolverConfig, pelican_embedded_human_check_cfg, __pmGetHumanCheckEvents ที่ source ใหม่มีแล้ว ต้อง build/sign private payload ใหม่ใน private artifacts ตรวจ hash/source provenance และทดสอบไฟล์ที่เตรียม deploy จริง รวมถึงสร้าง ZIP จาก allowlist ล่าสุด ตรวจ hash ทุก entry และห้ามบรรจุ private source/payload/keys/customer data

## R4 — P2: transition test ยังเป็น simulation

manager/tests/legacy_to_debt_transition.test.js ใช้ payload คอมเมนต์, game fleet จำลอง และ createAuthoritativeServer ที่เขียนเอง ไม่ได้เรียก backend SQLite/handler จริง mock นับ eventId ไม่ใช่ slot/day และคืน eventCharges=0 สำหรับ duplicate ซึ่ง backend จริงคืนอัตราของ ledger ที่คิดแล้ว ต้องเพิ่ม integration test ใช้ actual owner handler/SQLite + actual coordinators กับ fixture keys/credentials ตรวจ reuse slot เดิม, coexistence, safe reload, ACK หาย/replay/restart, topup และสวิตช์ปิดเปิด โดยไม่ทำธุรกรรมจริง

## เงื่อนไขจบงาน

ปิด R1–R4 แล้วอัปเดต TASKS/TEST_PLAN และหลักฐานจากไฟล์ deploy จริง ส่งกลับตรวจอีกครั้งก่อน commit/push candidate และ controlled cutover ไม่ถือว่า tests ผ่านทั้งหมดแปลว่าแพ็กเกจล่าสุดพร้อม
