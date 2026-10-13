# งานปัจจุบัน — PmheeAether

อัปเดต2026-10-13: owner-host LIVE หลัง cutover-20261013-1715; D1เดิมmaintenance1. Manager154/154ตรวจผ่าน; privatebot4.38.0 signedpayload529f4fc...; admin5หมวดขึ้นระบบแล้ว. นี่เป็นบันทึกสถานะ ไม่ใช่เหตุให้เปิดฐานเก่าหรือทำcutoverใหม่

## เริ่มงานครั้งต่อไป

1. อ่าน AGENTS.md, SOURCE_MAP.md, BOT_UPDATE_GUIDE.md และTEST_PLAN.md
2. แก้canonical sourceตามSOURCE_MAP ไม่แก้release/installed/scratch/trashแทนต้นฉบับ
3. ทดสอบส่วนที่เปลี่ยนและartifactจริงก่อนปล่อย รักษาledgerlatest; explicitstageเฉพาะงาน ไม่รวมcustomerconfigs/keys
4. บันทึกcheckpointผลจริงระหว่างงาน ไม่อ้างว่าsourceพร้อม=productiondeployแล้ว

## ข้อค้างด้านปฏิบัติการ

- owner serviceยังStartTypeManualตามตรวจล่าสุด: การตั้งAutomaticเป็นงานดูแลบริการแยก ไม่ใช่การcleanไฟล์
- invalidvoucherทดสอบปฏิเสธแล้ว; ยังไม่มีหลักฐานvalidvoucherครบเส้นทาง ห้ามใช้เงินจริงทดสอบเอง
- privateGitยังไม่มีremote; localcommitได้แต่ห้ามเผยprivate source/payload/keyบนpublicGit
- อัปเดตprivatebotครั้งใหม่ต้องใช้verifiedreleaseprocedureตามคู่มือ ห้ามใช้old patchhelper

## งานเก็บไฟล์ครั้งนี้

ย้าย72ไฟล์เก่าเข้าtrash/2026-10-13-obsolete พร้อมinventory/hash; รายงานreview/patch/cutoverที่เสร็จแล้วไม่ใช่งานค้าง. เนื้อหาTASKS/TEST_PLANเก่าเก็บในhub-history. รายละเอียด CLEANUP_REPORT.md
