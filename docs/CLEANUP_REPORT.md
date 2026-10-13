# เก็บไฟล์เก่า — 2026-10-13

ย้ายไฟล์ที่ตรวจแล้ว72ไฟล์ไป D:/MyProject/PmheeAether/trash/2026-10-13-obsolete โดยไม่มีการลบ และเก็บเนื้อหาเอกสารก่อนแก้เพิ่ม13รายการ รวม inventory85รายการ SHA256ตรวจตรงทั้งหมด

- scratch-patches: 58สคริปต์patch/read/update/prepareเก่าที่เสร็จงาน ไม่มีreferenceจากmanager/security/main/package และตรวจไม่พบprocessที่รันสคริปต์เหล่านี้ รวมhot_reloadและgrantpointshelpersที่ไม่ใช่workflowปัจจุบัน
- hub-history: 12รายงานreview/captcha/cutover/handoffที่จบแล้ว; TASKS/TEST_PLANเก่าเก็บเป็นpreviousก่อนเขียนหน้าปัจจุบัน
- private-legacy-deploy: deploy.ps1/update-service.ps1ของระบบSQLiteเก่าไม่มีactive deploymentdependency ย้ายพร้อมเขียนREADMEปัจจุบันและเก็บREADMEเดิม
- public-old-docs: เนื้อหาcandidate/reviewเก่าเก็บก่อนเปลี่ยนentryเป็นcurrent/statusredirect เอกสารเก่าไม่ใช่คำสั่งdeployที่ค้าง

inventory.jsonระบุoriginal/archived/hash/reason ใช้กู้คืนทีละไฟล์ได้ แต่ห้ามexecuteหรือคัดลอกกลับไปทับsourceปัจจุบันโดยไม่ตรวจdiff แฟ้มtrashอยู่นอกpublicrepo ไม่อัปโหลดไฟล์ภายในไปGitHub

## ตั้งใจเก็บไว้

private server.js/service.js/security_events.js ยังใช้legacytestsและpackage script; matcher.js/cloudflare modulesเป็นliveimports; protected-script/releasesเป็นoldpinnedprotocol1และrollback; bot.js/publicbotเป็นcompatibility; releaseเป็นdistribution; databases/keys/credentials/data/sessions/installedbackups/privateartifacts/temporaryruntimecacheไม่แตะ

scratchยังมีเครื่องมือและfixtureเก่าที่อาจมีข้อมูลบัญชี/keysหรือreferences จึงไม่ย้ายเหมารวม ไม่ใช้scratchเป็นcanonicalsource อ้าง SOURCE_MAP.md/BOT_UPDATE_GUIDE.mdก่อนแก้ทุกครั้ง

อ่าน D:/MyProject/PmheeAether/SOURCE_MAP.md และcurrent TASKS.md/TEST_PLAN.md คู่AGENTS.md/agent.mdซิงค์ตรงกัน ปรับหน้าREADMEและFRIENDS_OFFLINE_HOSTไม่ให้ชี้candidateยังไม่deploy ทั้งที่ownerhostLIVEแล้ว ไม่มีการเปลี่ยนruntime/ยอดเงิน/บริการ/routeในงานcleanupนี้
