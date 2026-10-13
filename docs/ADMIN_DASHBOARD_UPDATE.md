# หน้าแอดมินใหม่ — 2026-10-13

เปิดใช้งานแล้วที่ https://api.noggunsshop.xyz/v1/aetheria/admin/usage/machines/ui และ /v1/aetheria/admin/usage/ui ทั้งสองเส้นทางใช้หน้าเดียวกันและตรวจ Cloudflare Access JWT ก่อนแสดงหน้า

แยก 5 หมวด: ภาพรวม เครื่องและจอ บัญชี/ส่วนบุญ ประวัติรายการ และตั้งค่าระบบ รองรับค้นหา/กรอง/เรียงข้อมูล รายละเอียดเครื่องและจอ แยกยอดติดลบ ปรับยอดพร้อมเหตุผลและตรวจทานก่อนยืนยัน ประวัติล่าสุดของบัญชีพร้อมกรอง สวิตช์หนี้ และตั้งราคาโดยโหลดค่าจริง ไม่มีการเปลี่ยนยอด/ราคาเมื่อเปิดหน้า

ข้อมูลเครื่องเป็นรายงานล่าสุด ไม่ใช่คำสั่ง start/stop จอจากเซิร์ฟเวอร์ ยอดภาพรวมนับแต่ละบัญชีครั้งเดียว ประวัติรายบัญชีล่าสุดสูงสุด100รายการตาม API ปัจจุบัน รายการเงินผลลัพธ์ไม่แน่นอนเก็บrequestIdเดิมไว้ลองซ้ำ; รายการถูกปฏิเสธแบบยืนยันว่าไม่บันทึกสามารถแก้ไขข้อมูลได้

Sourceอยู่ private API owner-host/admin-ui.mjs และ server.mjs; helper cloudflare/admin_mutations.mjs การอัปเดตครั้งนี้ติดตั้งเฉพาะ3ไฟล์นี้ใน C:/Program Files/PMhee/AetheriaApi และรีสตาร์ทเฉพาะ PMheeAetheriaApi ไม่แตะ Manager/เกม ฐาน ledger/config/payload/rate/debtpolicy ใช้เดิม ต้นฉบับมี private local commit3c9e634 (private parent repo ยังไม่มีremote ไม่ส่งsource privateไป public)

ตรวจ syntax และ backend debt/offline/cutover28/28, scopedUI/helper/Access8/8ผ่าน HeadlessEdge/Chromeจริง14checksต่อbrowserและตรวจภาพdesktop/mobileแล้ว รวมยืนยันก่อนบันทึก, lostACK/retryไม่เครดิตซ้ำ, XSSเป็นข้อความ, ACKแล้วโหลดข้อมูลล้มเหลวไม่รายงานผิด และวันปิดยอดถูกปฏิเสธแล้วแก้รายการใหม่ได้

Deploy manifest/result: private artifacts/admin-dashboard-update-20261013; installed3filehashesตรงmanifest Publichealth200 maintenancefalse labelcutover-20261013-1715 payloadhash529f4fc...คงเดิม Unauthenticatedadminโดเมน302ไปAccessและloopback403 Backupเฉพาะโค้ด3ไฟล์ก่อนอัปเดตอยู่ ProgramData/PMhee/AetheriaApi/ui-update-backup/25691013-173905-466 ไม่ใช่ฐานledgerbackup

อัปเดตหน้าแอดมินครั้งต่อไปใช้ owner-host/deploy-admin-ui.ps1 พร้อม verifiedmanifest และสิทธิ์Administrator; ไม่ deploy Worker/D1 หรือสร้าง ManagerZIPใหม่เพียงเพื่อปรับหน้า owner-host ตรวจส่วนUI/Accessที่เปลี่ยนก่อนและสำรองไฟล์โค้ดเสมอ
