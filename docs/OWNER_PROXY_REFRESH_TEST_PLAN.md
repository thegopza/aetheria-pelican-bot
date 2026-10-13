# Test gates — proxy owner broker / refresh recovery

ใช้testkeys/fakeprovider/isolatedprofiles และ actualproductioncodepaths เป็นหลัก ไม่ใช่copylogicมาจำลองให้ผ่าน ไม่มีการregisterเกมจริง/voucherเงินจริงในงานนี้

## B: Refresh/connection (ให้ทำก่อน)

- Baselinecapture: /playready → F5 แล้วเก็บdocumentId/target/session/debugbridge/probe/bootstrapphase ก่อนหลัง ทำให้เกิดอาการเดิมในfixtureและมีregressionที่ล้มเหลวก่อนpatch
- Edge + Chrome realheadless: signedprivatepayloadจริง, 2profilesแยกnamespace, F5/hardreloadซ้ำ, loadmenu/version/bridgeACKกลับมาในtimeoutที่กำหนด (เป้าหมายภายใน60วินาทีหลังplayพร้อม) oneinit/oneHUD/document ไม่ตั้งtimersซ้ำ
- CDPdisconnectระหว่างnavigation/ระหว่างpayloadawaitแล้วreattachsurvivingtarget; stale oldresponseไม่evalในdocumentใหม่ ไม่จับtargetของprofileอื่น
- freshdoc marker-only/ไม่มีbootstrap/failedverification:recoverอย่างbounded; partialinitializedfailedไม่evalfullbotซ้ำในdocเดิมและไม่infiniteforcedreload
- CSP/hash/signature/pinsfail:ไม่fallbackpublicbotหรือdisableverifyเพื่อให้ผ่าน UIบอกcauseที่sanitize
- owneroffline + verifiedcache → F5/restartManager:menuกลับมาและdebtjournalคงอยู่; firstinstallไม่มีcacheต้องแจ้งต้องดาวน์โหลดครั้งแรก ไม่แสร้งว่าพร้อม
- login/characterselection/docnotreadyให้gamealiveแยกpayloadready; เปิดจอที่มีอยู่จากManagerต้องfocusACK/reattach ไม่duplicatewindow; closed/crashedtargetเปิดเฉพาะprofileใหม่ได้
- previouslySTART/STOP + Plan/captcha/pendingACK:respectresume policy/STOP override, sameaccount/profile/slot/วัน, no duplicatecharge/sell/buy/actions, สถิติไม่หาย/ไม่เพิ่มซ้ำ
- Electronloaderfixtureเมื่อเกี่ยวข้องและgame_loader/mirror/versionตรง; main testportไม่ชน3888/5290/debugportsจริง

## A: Owner proxy

- Secret/config:ไม่มีproxyuser/pass/providersecretในpublicresponse/settings/ZIP/source/log/jobpayloadที่อ่านโดยotheraccount; ownercredentialstoreACL/serviceidentityถูกต้อง และcapabilitiesแค่bool/status/fee
- Authentication/schema: bearerถูกต้อง + jobaccount/profileownership, cross-accountquery/mutation403/404, unknownfield/passwordinURL/customtargethostถูกปฏิเสธ; adminAccess/sameOrigin/CSRFเดิมผ่าน
- Same stickyIP: fakeproxyCONNECT+IPlookup+signupทั้งหมดใช้sessionเดียว IPเปลี่ยนก่อนsubmitหยุดและholdจัดการตามpolicy ไม่autoswapexitเพื่อเลี่ยงquota
- Atomicquota/fee: concurrentjobsจำกัด3/rollinghour/availablebalancehold; fixed10units onlyknowngame-success, negativebotdebtไม่ปิดcaptcha/บอท, signuprejectไม่มีregistrationdebit
- Idempotency: requestIdเดียวintentเดิมACKหาย/reload/restartคืนjobเดิม; intentเปลี่ยน409; samejobcompletion/feeledgerซ้ำไม่debitสองครั้ง
- Networkfail: preCONNECT/TLS/bodytimeout, providerchunksdelay, bodymalformed, timeoutหลังserverรับsignup → reviewrequired ไม่signupอีก; knownsuccess+settlementfail/reservationexpiresต้องrecoverjobเดิม ไม่freefalsefailed
- Stop/credential/profilechange/serviceRestart: queuedjobที่ยังไม่submitcancelได้ตามdefinedpolicy; submissionunknownไม่ล้างเพื่อcancelแล้วสมัครใหม่; ownercredentialrotationjobfingerprint mismatchหยุดให้review
- Full Managerintegrationกับrealbroker/SQLitefixture/actualauth_sync+vault: registeredAt/registerDone/loginSyncPendingเขียนหลังACKจริง profileไม่สร้างบัญชีใหม่หลังF5; retrylogin deliveryไม่signupซ้ำ
- ownerdown: newjobsไม่directfallback; pendingรักษาencryptedstate; reconnectquerysamejob; privatepayload/captcha/debtระบบเดิมยังทำงาน
- Actualadmin/browserfixtures screenshotsdesktop/mobile + maskedproxyconfig/status/jobs/ledger ไม่ใช่snapshotพร้อมcustomerdata

## คำสั่ง regression เริ่มต้น

Public: node --test manager/tests/*.test.js (baseline154); focused proxy_registration_recovery/proxy_transport_deadline/proxy_wallet_ack และbrowser_injection_recovery/coordinated/offline suitesตามชื่อไฟล์จริง

Private: owner-host/*.test.mjs, cloudflare/test/proxy_service.test.mjs, protected-script/offline-human-check.test.js, offline-full-runtime.test.js และ actualoffline-browser-runtime.e2e.js เพิ่มbroker/newmigration/fullnetworkfixturetestsที่เรียกโค้ดจริง

ทุกJS/MJSที่แก้ node --checkทีละไฟล์; Managerfixtureport3899หรือephemeralที่allowlistแยก, auto-updatersdisabled, no realcredentials/account data, testkeysและmock provider only หลังเปลี่ยนloader/packageตรวจstage/mirror/ZIPentryhash/privateartifactprovenanceก่อนreview
