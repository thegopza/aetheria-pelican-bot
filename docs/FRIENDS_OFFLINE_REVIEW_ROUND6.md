# Codex review รอบ 6 — 2026-10-13

R5.1/R5.2 ปิดแล้ว: DB readiness อ่าน identity/release/chunks ของฐานที่ listener เปิดจริง และ CLI/เทสต์เรียก shared executeRouteToHost/executeGoLive/executeResumeCloudflare โค้ดเดียวกัน Cutover suite16/16, privateรวม33/33, Manager146/146 ผ่านจากการตรวจซ้ำ ZIPล่าสุด SHA25642D97C703D577BA8B4F5FBEB64AE5248AC6DDF10A3EA05510B871EF972D88C5C ตรงรายงาน ไม่มี production mutation ในรอบตรวจ

ยังไม่ผ่านปล่อยเพราะ coordinated rollout ที่เพิ่มใหม่:

## R6.1 — health ถูก serviceRequest ปฏิเสธ

manager/server.js createCoordinatedScriptCoordinator.checkServerEndpoint เรียก service.serviceRequest('/v1/aetheria/health') แต่ manager/human_check_solver.js serviceRequest whitelist ยอมเฉพาะ script/usage/billing/proxy/offline ที่มี subpath จึง throw Unsupported coordinator route ก่อนส่ง HTTP แล้วถูก catch เงียบ detectedMode ไม่เปลี่ยน ต้องอนุญาต exact health path หรือมี health method แยกที่ปลอดภัย ทดสอบผ่าน service implementation จริง ไม่ใช้ mock ที่ยอมทุก route

## R6.2 — wrapper ไม่ได้คุมวงรอบ / restart offline

start() ตรวจ health ครั้งเดียวแล้วเรียก underlying legacyCoordinator.start หรือ offlineCoordinator.start Timer ของ underlying ไม่ผ่าน wrapper.cycle; จึงไม่ตรวจพบ owner host ที่พร้อมภายหลังอัตโนมัติ wrapper.cycle ถูกเรียกแค่ pilot POST แบบ manual ต้องให้ wrapper คุม timer/singleflight/stop และ transition โดยไม่สร้าง timerสองชุด

detectedMode อยู่ใน memory อย่างเดียว restart Manager ตอน owner offline จะกลับ legacy แม้มี signed cache รุ่นหนี้และเคย activate แล้ว ต้องเก็บ activation ที่ผูก account+origin ไว้และคืน offline mode จากสถานะที่เชื่อถือได้ ไม่กลับ legacy เพียงเพราะ host ติดต่อไม่ได้ รักษา forced legacy/explicit opt-in และ credential change ให้ถูกต้อง

## R6.3 — offline wallet attach ก่อนเลือกโหมด

server.js สร้าง offlineCoordinator ตั้งแต่ต้น constructor นี้เรียก service.setOfflineWallet ทันที แม้ wrapper เลือก legacy; human_check_solver.refreshBalance จะใช้ offlineWallet.refresh แทนอ่าน server /balance และ topupจะ forceRefresh ไป offline/sync ซึ่ง Workerเก่าไม่มี ต้อง bind wallet เมื่อactivateofflineจริง และdetach/restoreเมื่อexplicitlegacy ก่อนเปิดโหมด legacyต้องไม่แก้ยอดจาก journalที่ยังไม่activate

## เทสต์ที่ต้องเพิ่มก่อนสร้างแพ็กเกจใหม่

ใช้ wrapper implementation จริงและ human_check_solver จริง กับ fixture transports/keys/accounts: เริ่มก่อนhostพร้อมแล้วตรวจพบภายหลัง; health routeผ่าน whitelist; maintenanceยังไม่activate; เปลี่ยนโหมดแล้วไม่มีtimerซ้อน; restartตอนhostoffline signedcacheยังโหลดบอท/คิดหนี้ได้; legacybalance/topupไม่ถูกofflineWallet hijack; stopระหว่างhealthrequestไม่เริ่มtimerกลับมา

ไม่ต้องแก้ cutover ที่ผ่านแล้วซ้ำในงานนี้ เมื่อแก้Managerเสร็จให้ sync release modules/ZIPใหม่และตรวจทุกentry จากนั้นส่งรีวิว ก่อน commit/push runtime ที่ auto-updateผู้ใช้
