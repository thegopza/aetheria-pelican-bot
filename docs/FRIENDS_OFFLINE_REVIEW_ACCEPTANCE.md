# ตรวจรับ candidate ระบบหนี้ — 2026-10-13

R7.1 ปิดแล้ว: server ส่ง accountId จาก humanCheckSolver พร้อม installer settings; coordinator มี fallback service identity และ regression ใช้ wiring shape จริง ยืนยัน activation มี accountId/origin, restartขณะ host offline ยังเป็น offline และบัญชีใหม่ไม่รับ activation เก่า

Manager suite รันซ้ำ154/154ผ่าน syntax server/coordinated ผ่าน ตรวจ ZIP86entries SHA256 `2A3962942F6E8A77F3067DC0D20DCA6B4A72550BC7831B3DDB880C123B8DEC17` ทุกentryตรงrelease mirror ไม่มี customer configs/credentials/activation/private source/payload/keys โมดูล server/coordinated/offline/human_check_solver ใน mirrorตรงsourceล่าสุด

ข้อรีวิวที่ค้าง R1–R7 ปิดในขอบเขต candidate ที่ตรวจแล้ว พร้อมเข้าสู่ขั้นตอน release และ controlled deployment ไม่มีการ deploy/startบริการ/freezeD1/เปลี่ยนroute/เปิดหนี้จริงในรอบตรวจนี้

ขั้นตอน production ที่ยังต้องทำเป็นงานปล่อย ไม่ใช่ผลเทสต์: commitเฉพาะruntime/filesที่ตรวจรับและกันcustomer data; freeze/exportฐานD1ล่าสุดตามแผน; prepareพร้อม identity/schema/signedprivateartifact; ติดตั้งserviceจากpackageที่verifyและชี้ฐานmigratedเท่านั้น; ตรวจloopback/publicHTTPS/Access; route/go-liveตามsharedCLI; pilot safe reloadและwallet/debt smokeแบบไม่ใช้เงินจริง ก่อนขยายผู้ใช้ การrollbackรักษาฐานล่าสุดและไม่เปิดสองledgerพร้อมกัน

สวิตช์หนี้คงนโยบายที่เจ้าของเลือก ไม่สลับ enabled/rate เองเพื่อทดสอบ ราคาเดิม100units=1บาทต่อจอ/วัน การแก้คำถามlocalยังไม่คิดเงิน ถ้าโค้ด/packageเปลี่ยนหลังcheckpointนี้ต้องตรวจส่วนที่เปลี่ยนและartifacthashใหม่
