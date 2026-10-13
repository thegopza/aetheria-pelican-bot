# อัปเดตบอทหลังย้ายระบบ owner-host

คู่มือปัจจุบัน 2026-10-13 ทางเข้ารวม D:\MyProject\PmheeAether อ่าน AGENTS.md, TASKS.md และคู่มือนี้ก่อนแก้ ข้อมูล LIVE จาก health/deployment status สำคัญกว่าบันทึก candidate/handoff เก่า

## แก้ไฟล์ให้ถูกที่

- บอทรุ่นใช้งานจริง: private-api/protected-script/bot.source.js (private root D:\MyProject\PMheeSuite\PMheePlatform_Src\Server\PMhee.AetheriaApi) รุ่นปัจจุบัน4.38.0 ตรวจค่าจริงจาก PELICAN_BOT_VERSION และ @version เสมอ
- Manager: manager-project/manager/ ใน public repo D:\MyProject\aetheria
- เซิร์ฟเวอร์และหน้าแอดมิน: private-api/owner-host/ และโมดูล cloudflare/ ที่ owner-host เรียกใช้ ชื่อ cloudflare ไม่ได้แปลว่าต้อง deploy Worker
- public bot.js4.36.3 เป็น compatibility snapshot การ push ไฟล์นี้อย่างเดียวไม่อัปเดต private bot ของผู้ใช้โหมดใหม่ ห้ามนำ private source/payload เข้า public repo, manager/public, ZIP หรือโฟลเดอร์เกม

## ลำดับงานบอท

1. อ่านสถานะจริงและ git status ก่อนแก้ เก็บ private artifact รุ่นเดิมพร้อม metadata สำหรับ rollback โค้ด ไม่ทับข้อมูลผู้ใช้
2. แก้ canonical private bot ขึ้น SemVer ใน PELICAN_BOT_VERSION และ @version ให้ตรง ไม่แก้ compatibility snapshot หากงานไม่เกี่ยวข้อง
3. ตรวจ syntax และรัน regression ของระบบที่แก้ รวม private offline human-check/full runtime และ security/offline bootstrap หากมีผลกับตัวโหลด ทดสอบ source/payload ใหม่จริงใน Edge/Chrome fixture ตรวจ offline/reload/Plan/captcha และ ACK ไม่ใช้เงินจริงหรือซื้อขายของจริง
4. สร้าง signed protocol2 release ด้วย manager-project/security/build-offline-payload.js ไปโฟลเดอร์ artifacts ใหม่ **นอก public repo** ใช้ public pins และ private signing key ที่มีอยู่ ห้ามพิมพ์ key/token ลง log หรือเปลี่ยน pins เอง ตรวจ source/version/hash/size/signature/chunk integrity จาก artifact ที่จะปล่อยจริง
5. งานเผยแพร่ต้องอ่าน owner service config ที่ใช้อยู่ และใช้ฐาน SQLite LIVE ที่ชี้ไว้ ตรวจ identity/backup แบบรองรับ WAL อัปเดตเฉพาะ script_payload_releases/script_payload_chunks กับ OFFLINE_RELEASE_JSON ให้สอดคล้อง เก็บ payload รุ่นเดิม ห้าม import ฐานเก่า ห้าม freeze-export/prepare-host ย้ายระบบใหม่ทั้งก้อนเพื่ออัปเดตบอทธรรมดา และห้ามแตะ accounts/ledger/receipts/rates/debt policy
6. หากยังไม่มีเครื่องมืออัปเดต private release ที่ทำ validation/transaction/config backup/rollbackครบ ให้สร้างและทดสอบเครื่องมือนั้นก่อน ไม่ใช้ SQL/script เฉพาะกิจที่เขียนทับฐานทั้งไฟล์ รีสตาร์ทเฉพาะ owner API เมื่อจำเป็นด้วยสิทธิ์ Administrator ตรวจ public/loopback health, manifest และประกอบ chunksตรวจ signature/hash ตรงรุ่นใหม่ก่อนแจ้งสำเร็จ ห้ามปิด ManagerEXE หรือ hot-inject botทั้งไฟล์
7. Manager ดาวน์โหลด manifest/cache ใหม่เป็นระยะ (ปัจจุบันประมาณทุก1ชั่วโมงเมื่อhostติดต่อได้) Auto-update จะใช้ private version/hash แล้วรอ safe reload ทีละจอ ไม่ใช่ทันทีทุกจอ ผู้ใช้ที่ owner offline ใช้ last-good signed cacheต่อ เมื่อเชื่อมต่อจึงรับรุ่นใหม่
8. ถ้าแก้ Managerด้วย ให้ sync release mirrors/rebuildZIPจาก allowlist ตรวจทุกentryและ syntax/tests, explicitstage/commit/push publicไฟล์งานเท่านั้น Private repo commitแยก (ปัจจุบันยังไม่มีremote; ห้ามpushprivateไปpublicเพื่อแก้ข้อจำกัดนี้) อัปเดตTASKS/DEPLOYMENT_STATUS พร้อม private artifacthash/publiccommits/pilotจริง

## ระบบที่ต้องรักษา

owner-host เป็น ledgerหลักตั้งแต่ cutover-20261013-1715; D1เดิม maintenance1 ไม่ใช่ฐานรับรายการใหม่ CloudflareAccess/Tunnelเป็นทางเข้า ไม่เปลี่ยนDNS/route/Licensingเพื่ออัปบอท ป้องกันจ่ายซ้ำ slotId/วันไทย, negativebalances, durableevent/batchACK, adminpolicyrevision และ account/origin activation

มี runtime protocol1 เดิมค้างได้ เก็บ compatibility/immutableleasesจน safe reloadสำเร็จ ชื่อตัวแปร/คีย์ pelican_* ต้องคงเดิม การ rollback private release เปลี่ยนเฉพาะcode/config metadata ไม่ย้อนยอดเงินหรือคืนledgerbackupเก่า

Promptเริ่มงาน: "ทำงานใน D:\MyProject\PmheeAether อ่าน AGENTS.md, TASKS.md และ BOT_UPDATE_GUIDE.md ก่อน ช่วยแก้ [รายละเอียด] ใน source ที่ใช้งานจริง ทดสอบและอัปเดตตามคู่มือ ห้ามแก้หรืออัปโหลดไฟล์ผู้ใช้/private payload ไป public และบันทึกสถานะงานทุก checkpoint"

## Manager public update channel
อ่าน docs/MANAGER_UPDATE_CHANNEL.md หลัง commit/push source ต้อง publish generated distribution ที่ thegopza/aetheria-manager-updates ด้วย ห้ามถือว่า push private source เท่ากับส่งอัปเดตผู้ใช้
