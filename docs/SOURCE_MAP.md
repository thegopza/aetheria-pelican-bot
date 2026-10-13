# Source map — current owner-host deployment

เปิดโครงการที่ D:\MyProject\PmheeAether และอ่าน AGENTS.md/BOT_UPDATE_GUIDE.md ก่อนแก้ ตรวจ LIVE health/service ล่าสุดก่อน deploy

| ส่วน | Source ที่แก้ | หน้าที่ |
|---|---|---|
| บอท private ที่ใช้จริง | private-api/protected-script/bot.source.js | canonical source (อ่าน version จากค่าคงที่) |
| Manager | manager-project/manager/ | UI/controller/cache/debt/auto-update |
| owner API / แอดมิน | private-api/owner-host/ | authoritative ledger และหน้า admin |
| โมดูล API ที่ใช้อยู่ | private-api/cloudflare/ | worker/wallet/billing/access/protocol ถูก owner-host import; ชื่อfolderไม่ได้แปลว่าต้อง deployWorker |
| builder | manager-project/security/build-offline-payload.js | สร้าง signed private artifactนอกpublicrepo |
| ติดตั้ง owner package | private-api/deploy-owner-host.ps1 | verified stage/install;ไม่ใช้สคริปต์deployเก่า |
| อัปเดตหน้า admin | private-api/owner-host/deploy-admin-ui.ps1 | verified3filemanifest/update/backup |

ไม่ใช่ canonical: release/Pelican_Manager_v4.3 เป็นdistributionmirror; C:/Program Files/PMhee/AetheriaApi เป็นinstalledcopy; publicbot.js/manager/public/bot.js เป็นcompatibility snapshot; protected-script/releases เป็นprotocol1 pins/rollback ไม่แก้แทนbot.source.js

เก็บเพื่อdependency: private-api/server.js/service.js/security_events.js ใช้legacytests (npm startที่rootprivateยังเป็นlegacy ไม่ใช่คำสั่งรันproduction); matcher.jsยังถูกliveworkerimport. ห้ามย้าย cloudflareหรือreleasesเหมารวม

trash/2026-10-13-obsolete เก็บpatchscripts/รายงานเก่า/legacydeployที่ตรวจแล้ว ห้ามexecute/แก้/ใช้เป็นsource. scratchเป็นเครื่องมือ/fixtureชั่วคราว ไม่ใช่sourceบอทหรือManager ไม่แตะsessions/data/credentials/debts/privateartifacts/backupsในการcleanup
