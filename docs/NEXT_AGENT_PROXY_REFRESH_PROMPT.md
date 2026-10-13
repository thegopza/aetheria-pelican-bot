# Prompt สำหรับ agent รอบถัดไป

ทำงานใน `D:\MyProject\PmheeAether` อ่าน `AGENTS.md`, `SOURCE_MAP.md`, `BOT_UPDATE_GUIDE.md`, `TASKS.md`, `OWNER_PROXY_REFRESH_WORK.md` และ `OWNER_PROXY_REFRESH_TEST_PLAN.md` ก่อนแก้ ใช้canonical sourceเท่านั้น ห้ามใช้trash/scratch/release/installedcopiesเป็นต้นฉบับ

เจ้าของต้องการ 2 งาน โดยทำงาน B ก่อน:

**B: แก้ F5/refresh แล้ว payload/เมนูบอทหาย และ Managerควบคุมหรือแสดงจอเดิมไม่ได้ ต้องปิดclient/sessionก่อนเปิดใหม่** หาสาเหตุและทำregressionreproduceจริงในEdge/Chromefixtureก่อนแก้ ตรวจdocument/target/CDPsession/injectionguards/probe/offlinecache/debugbridge/launchACK ให้recoverจอเดิมโดยไม่ปิดManagerEXE/ไม่ปิดจออื่น/ไม่hot-injectbotทั้งไฟล์ซ้ำ รักษาaccount/profile/slot/Plan/captcha/debt/STOP state ใช้actualsignedprivatepayloadและทดสอบowneroffline/F5/reconnect/restartหลายจอ ไม่สรุปrootcauseจากชื่อไฟล์หรือmockที่copylogic

**A: เพิ่ม owner-host signup brokerผ่านproxyของเจ้าของ** Managerเพื่อนส่งjobมายังownerHTTPS ผู้ให้บริการproxy credentialอยู่บนเครื่องเจ้าของเท่านั้น เจ้าของเป็นคนlookupIP+signupด้วยsticky sessionเดียว ไม่ส่งรหัสproxyไปเพื่อน ไม่ฝังในZIP/publicbot. ใช้ข้อมูลproxyเดิมที่ตั้งไว้บนเครื่องเจ้าของผ่านprotectedadmin/import ไม่ขอรหัสในchat. เพิ่มdurablejob/idempotency/reservequota/feehold/knownresult/settlement/adminreview และclientstatusintegration โดยรักษาproxyfee10unitsเดิม, quota3/rollinghourและdailybot100units/จอ/วัน. UnknownsignupหรือACKหายต้องไม่ส่งสมัครใหม่ รักษางานค้างหลังrestart ใช้fakeprovider/SQLitefixturesก่อน ห้ามใช้บัญชีหรือเงินจริงทดสอบเอง

คุณไม่ได้ทำงานคนเดียว ห้ามrevertหรือstagecustomerconfigs/credentials/keys/debts/privateartifacts/unrelatedchanges แยกขอบเขต B(publicManager/loader) กับ A(privatebroker+publicclient) และให้ reviewerตรวจหลังtests ผ่าน ก่อนปล่อยproduction. ถ้าdelegationให้กำหนดfileownershipชัด ไม่มีคนสองคนเขียนreleaseพร้อมกัน

ทุกcheckpointอัปเดตTASKSว่าทำอะไรเสร็จ/ยังไม่เสร็จ rootcauseหลักฐาน/ไฟล์/version/hash/testcommands/screenshots/ข้อจำกัด ให้agentอื่นต่อได้ ถ้าแก้privatebotต้องขึ้นversion/buildsignedartifactนอกpublicrepoและทดสอบไฟล์ที่ปล่อยจริง ถ้าแก้Managerต้องsyncmirror/rebuildZIP/explicitstage+commit+pushเฉพาะงานตามAGENTS PrivateGitcommitแยก ไม่มีremoteอย่าpushprivateไปpublic

ในรอบนี้ให้implement+test+reviewและเตรียมreleaseให้ตรวจรับก่อน ไม่เปิดproxyglobalflag/เปลี่ยนbilling/สมัครจริง/refreshกองจอproductionหรือทำcutoverใหม่เอง. สรุปผลจริง ไม่อ้างsuccessเพียงเพราะส่งคำสั่งแล้ว
