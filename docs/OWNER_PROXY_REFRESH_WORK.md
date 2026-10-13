# งานรอบถัดไป: กู้ payload หลัง refresh และสมัครผ่าน proxy ของเจ้าของ

สถานะ: แบบร่างตามคำขอเจ้าของ ยังไม่ implement/deploy ในงานเอกสารนี้ เริ่มที่ D:\MyProject\PmheeAether อ่าน AGENTS.md, SOURCE_MAP.md, BOT_UPDATE_GUIDE.md และ TEST_PLAN.md ก่อน ห้ามใช้สคริปต์เก่าใน trash

## สถานะที่ยืนยันแล้ว

owner-host LIVE, private bot source protected-script/bot.source.js, private signed protocol2 cache และ debt journal ใช้งานแล้ว ระบบสมัคร proxy เดิมอยู่ Managerแต่ละเครื่อง อ่าน manager/data/proxy_settings.json ของเครื่องนั้นเอง ไม่ดึง credential กลาง เครื่องเจ้าของมีข้อมูลตั้งไว้และ connection testผ่าน แต่ enabled=false; เทสต์ recovery/transport/wallet13/13ผ่าน ไม่ได้สมัครบัญชีจริง

งานใหม่ต้องคง dailybotprice100units/จอ/วัน, proxy feeเดิม10unitsต่อสมัครสำเร็จ และ existing IPquota3รายการ/rollinghour เว้นเจ้าของสั่งเปลี่ยนภายหลัง ไม่เปิดสวิตช์หรือเปลี่ยนยอดเองเพื่อทดสอบ

## B — ทำก่อน: F5 แล้วเมนูหาย / Manager ควบคุมจอไม่ได้

เจ้าของรายงาน: จอที่ทำงานอยู่กดF5/refresh → บอทและเมนูไม่กลับมา จอไม่เชื่อมกับManager กดเปิดจอจากManagerไม่สำเร็จหรือเปิดกลับไม่ได้ ต้องปิดclient/sessionนั้นก่อน อาการนี้ยังไม่ reproduced ในรอบร่างงาน จึงยังไม่มี root cause ที่ยืนยัน

### ต้องได้พฤติกรรมนี้

- Refreshสร้างdocumentใหม่ได้ และ bootstrap/payloadจากsignedcacheกลับมาเพียงครั้งเดียวต่อdocument เมื่อหน้าplayพร้อม โดยไม่ต้องปิดclientหรือManager
- Managerแยก game/process/targetยังอยู่ กับ transport/bridgeขาด และ payloadยังไม่พร้อม ไม่รายงานว่าพร้อมหรือเปิดสำเร็จจากpid/targetอย่างเดียว
- ปุ่มเปิดจอ/แสดงจอที่มีอยู่ต้องโฟกัสหรือreattach/recoverbridgeของจอนั้น ตรวจACKก่อนตอบสำเร็จ ไม่เปิดwindowซ้ำและไม่ปิดจออื่น
- ภายหลังreloadให้restoreการตั้งค่าของprofileเดิมและนโยบายresumeเดิมเท่านั้น จอที่ผู้ใช้STOPต้องไม่ถูกSTARTด้วยpromise/timerเก่า การlogin/เลือกตัวละครค้างให้แสดงรอสถานะ ไม่ forceclickเกมเอง
- profileId, account, stable slotId, localStorage namespace, Plan state, debt queue และcaptcha statsต้องไม่ข้ามจอ/บัญชีหรือคิดซ้ำ
- ownerofflineแต่มีverifiedcache: refreshแล้วยังโหลดบอท/เมนูได้ ไม่มีการพึ่งmanifestออนไลน์ก่อนส่งcache เงื่อนไขsignedcache/pinsยังต้องครบ

### จุดตรวจ (สมมติฐาน ไม่ใช่ผลวิเคราะห์แล้ว)

1. manager/browser_mode.js: documentGeneration/documentId/performance.timeOrigin, Page.frameNavigated/loadEventFired, staleCDPsession/Targetdetach, knownTargets, injectionInFlight/pendingLoad/retryTimer และ HTTPdebugbridgeของแต่ละprofile ต้องinvalidatepromiseเก่าเมื่อdocument/sessionเปลี่ยนและreattachอย่างมีowneridentity
2. manager/script_coordinator.js PROBE_JS และ manager/offline_coordinator.js: existingRuntimeรวม __pmBrowserInjectionAttempted/__pmLegacyInjectionAttempted ซึ่งเป็นattemptmarkerไม่ใช่หลักฐานpayloadสำเร็จ ตรวจว่าfreshdocumentที่ยังไม่มีbootstrapหรือmarkerจากfailedattemptทำให้ค้าง waiting-safe-bootstrapหรือไม่ ห้ามแก้โดยล้างguardแล้วevalทั้งbotซ้ำในdocumentที่partialinitializeแล้ว
3. manager/offline_script_bootstrap.js และ security/offline_bootstrap.js: phasewaiting/verifying/ready/failed, __pmPayloadInitialized, newFunction/hash/signature/exceptionDetails ตรวจการปฏิเสธmetadata/CSPและresult envelope จริง มี runtimeบางส่วนแล้วต้องไม่retryfullbotในdocumentเดิม; recoveryต้องใช้freshdocumentอย่างควบคุมและไม่วนreload
4. main.js กับ manager/game_loader/main.js สำหรับElectron: did-finish-load/will-navigate/generation และ protectedmodeที่รอManager delivery เกมwindowbridgeต้องยังใช้ได้เมื่อpayloadหาย
5. manager/server.js POST /api/profiles/:id/launch, clientAlreadyOpen, runningProcesses/isProcessAlive, evalProfilePort และ /api/window: บางbranchตอบalreadyOpenพร้อมส่งfocusHTTPแล้วกลืนerror ตรวจACK/bridgeและrecoveryจริงก่อนsuccess
6. manager/coordinated_coordinator.js: wrapperยังคุมcycleหลังrefresh/restart, activation/account/originถูกต้อง และofflinewalletไม่ถูกเปลี่ยนกลับlegacyเพราะhostชั่วคราวขาด

### เก็บหลักฐานและแก้

บันทึกเฉพาะprofile/debugPort/targetId/sessionId/documentId/bootstrapphase/version/hashprefix/transporterror/timestamp โดยmask account/credential/tokenและไม่dumpwholelocalStorage ใช้read-only probeกับจอจริงได้ แต่ทำF5/reload reproductionในfixture Edge/Chrome/Electronแยกก่อน ห้ามrefreshกองจอจริงโดยไม่มีเจ้าของอนุญาต

เพิ่มstate/retryที่แยก perprofile/perdocumentและboundedbackoff ยกเลิกcallbacksเก่า ตรวจผลPOSTevalและCSPexception ไม่ใช้pidเพียงอย่างเดียว และให้UIมีสถานะเข้าใจได้เช่นรอเกม/กำลังกู้เชื่อมต่อ/กำลังโหลดสคริปต์/พร้อม/ล้มเหลว ไม่สรุปsuccessก่อนpayloadและbridgepostconditionsครบ

ขอบเขตไฟล์หลัก B: public manager/browser_mode.js, offline_coordinator.js, coordinated_coordinator.js, script_coordinator.js, server.js, offline_script_bootstrap.js/tests; main.js/game_loader/installerเฉพาะเมื่อพิสูจน์เกี่ยวข้อง ถ้าแก้ตัวโหลดต้องทำversion/mirror/installตามAGENTS Privatebot sourceแก้เฉพาะจำเป็นและผ่านsignedartifactprocedure ไม่เผยsource private

## A — สมัครผ่าน proxy โดยเก็บรหัสบนเครื่องเจ้าของ

เป้าหมาย: Managerเพื่อนส่งงานสมัครผ่านHTTPSมายังowner-host เจ้าของเป็นผู้ใช้proxy credentialเพื่อlookupIPและส่งsignupให้ ไม่ส่ง proxyUser/proxyPass/tokenproviderไปManagerเพื่อน ไม่ฝังในpubliccode/ZIP/payload

### สิ่งที่ต้องเพิ่ม

1. ownerproxy configuration: protectedfileในProgramData/PMhee/AetheriaApi หรือcredentialstoreของservice พร้อมACL/การเข้ารหัสที่serviceidentityอ่านได้ อย่าใช้CurrentUserDPAPIของผู้ดูแลแล้วคาดว่าLocalSystemอ่านได้ การimportข้อมูลจากManagerเจ้าของทำบนเครื่องเจ้าของครั้งเดียวผ่านverifiedinstall/adminoperation ไม่ให้clientระบุfilePathหรือเลือกproviderเอง ไม่พิมพ์/ส่งรหัสในchat/log
2. Owner-onlyadminใต้ /v1/aetheria/admin/usage/*: configured/enabled/testconnection/ประเทศ/โควต้า/งานค้าง แสดงแค่สถานะหรือmask credential ตรวจAccessJWTและsame-originPOST ไม่มีreadsecretendpoint ทดสอบconnectionไม่ส่งsignupจริง
3. private durable signup broker เช่น owner-host/proxy_signup.mjs + transportmoduleที่reuse/แยกจากtransporttestedเดิม ใช้fixedallowlist api.ipify.org และgame/auth/register ไม่เป็นgenericHTTPproxy/SSRF ใช้sticky sessionเดียวสำหรับIPlookup/validation/signup ไม่ส่งpasswordผ่านURL และใช้absoluteCONNECT/TLS/bodytimeouts
4. Suggested native API: GET /v1/aetheria/proxy/capabilities; POST /proxy/signup {requestId,profileId,username,password}; POST /proxy/signup-status {jobId}. Authenticatebearerและscopejobกับaccount+clientmachine/profile ปฏิเสธbody/length/fieldsที่ไม่รู้ ห้ามclientระบุhost/port/proxyUser/proxyPass/country/fee/successเพื่ออนุมัติเงินหรือเลือกexitเอง
5. DurablejobในฐานLIVEผ่านmigrationเพิ่มตารางโดยไม่import/ทับledger: unique(accountId,requestId), intenthash, stablejobId, sticky sessiontag, phases queued/reserved/submitting/result-known/settlement-pending/completed/review-required, providerfingerprint, timestamp และsanitizederror เก็บgamepasswordถ้าจำเป็นในencryptedserviceownedstoreจนjobจบ ไม่log/plaintextDB Credentialสมัครของแต่ละprofileยังส่งกลับloginของprofileเจ้าของงานตามauth_syncเดิม ไม่ส่งให้บัญชีอื่น
6. ก่อนsignupreservequota+feehold atomicallyตามpolicyเดิม คิด10unitsเฉพาะsignupที่ownerตรวจผลสำเร็จ และledgerkeyjobเดียวไม่หักซ้ำ ความสัมพันธ์hold/job/IPต้องpersistก่อนส่งprovider ถ้าACKหาย Managerquery/retryjobเดิมโดยrequestIdเดิม ไม่สร้างaccountใหม่
7. Unknownoutcome: persist submittingก่อนnetwork ถ้าtimeoutหลังส่งอย่าทดลองsignupใหม่หรือเปลี่ยนusername/sessionเอง แสดงรอตรวจสอบให้admin ส่วนknownsuccessแต่settlementACKหาย/restartต้องsettlejobเดิมได้โดยไม่signupซ้ำ วางกติกาreservationexpireระหว่างrequestให้ไม่สูญหายหนี้/หลักฐานและไม่อ้างว่าสมัครล้มเหลวทั้งที่สำเร็จ
8. Manager: เพิ่มmethodsในhuman_check_solver.js และowner-modeในproxy_register.js; auth_sync.jsใช้jobstateจริงก่อนบันทึกregisteredAt/registerDone/loginSyncPending ใช้vault/profilesเดิม clientjournalเก็บimmutablejobId/requestId/phase ขณะownerofflineสมัครใหม่ไม่ได้ ให้คงงานเดิมและแจ้งสถานะ ไม่fallbackส่งcredentialของเจ้าของหรือสมัครตรงเงียบ ๆ
9. Keepcompat: localproxy modeของManagerเจ้าของและpending legacyticketsต้องไม่ถูกทำลาย แยกโหมด owner/localอย่างชัด ใช้capabilities+featureflagที่serverก่อนswitch อย่าenablepublicclientsก่อนownertransport/config/jobledgerพร้อม ไม่เปิดglobaltoggleเพื่อทดสอบแทนfixture
10. Dashboard: เพิ่มหมวดproxy/jobsหรือsectionที่ชัด แสดงจำนวนงาน/status/lastresult/feeledger/operator ไม่รวมprofilepassword/rawtoken/voucher ให้adminreviewunknownjobsก่อนauthorizeactionใหม่ ไม่รีเซ็ตpending/receiptแล้วส่งซ้ำเอง

### แยกขอบเขตและปล่อย

A Private: owner-host/, cloudflare/proxy_service.mjsเฉพาะadapters/migrationที่จำเป็น, deploy-owner-host/package-smoke allowlists และadminUI; Public: manager/proxy_register.js, auth_sync.js, human_check_solver.js, UI/tests. ไม่ให้privateAPIimportไฟล์จากD:/MyProject/aetheria runtimeโดยตรง ต้องstage dependencyครบในpackage

ทำ B เป็นhotfixแยกก่อน A ถ้าบั๊กกระทบจอผู้ใช้ ไม่แก้billing/rates/sourceอื่นรวมไปด้วย สำหรับการอัปเดตbot/Managerใช้BOT_UPDATE_GUIDE/AGENTS mirror/ZIP/pins/safe reload; ownerAPIdeployเป็นงานแยก ต้องbackupWAL-safeและlatestledger ไม่ทำcutoverใหม่ ห้ามทดสอบsignup/voucher/หักเงินจริงจนเจ้าของอนุญาตรายการนั้น ส่งผลreviewก่อนproductionในรอบงานนี้

## Definition of done

B: reproduceก่อนแก้, fresh/F5/hardreload/reconnect/ownerofflineหลายจอผ่านด้วยactualsignedruntime, oneinit/document, Managerfocus/recoverACKจริง, ไม่มีnewslot/doubledebt/Plan/captcha stateข้ามจอ และSTOPยังหยุด

A: clientไม่มีproxycredentials, ownerfixturetransport+jobledger+Managerintegrationผ่านfailure/restart/concurrency/ACKcases, signupไม่ซ้ำ/feeไม่ซ้ำ/unknownไม่autosubmit, scopeและquotaถูกต้อง, ownerofflineไม่ทำdirectfallback พร้อมadminreviewที่ไม่leaksecrets

ทั้งสองงาน: อัปเดตTASKSพร้อมไฟล์/version/artifacthash/testcommands/screenshots/ข้อค้างทุกcheckpoint Syntax+scopedregression+reviewผ่านก่อนexplicitcommit/pushเฉพาะpublicfiles Privatecommitแยกไม่pushpublic ปล่อยจริงต้องบันทึกผลhealth/manifest/pilot ไม่อ้างว่าคำสั่งรันแปลว่าสำเร็จ
