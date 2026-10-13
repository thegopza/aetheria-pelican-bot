# แผนทดสอบปัจจุบัน

ใช้fixturesและtestkeys ห้ามใช้customerเงินจริง/เกมซื้อขายจริง ตรวจAGENTSและBOT_UPDATE_GUIDEก่อนรัน คำสั่งต่อไปเป็นregression ไม่ใช่deploy

- Manager: node --test manager/tests/*.test.js ในmanager-project (baseline154/154)
- API/debt/cutover/privatebot: node --test owner-host/*.test.mjs protected-script/offline-human-check.test.js protected-script/offline-full-runtime.test.js ในprivate-api
- private runtime browser: node protected-script/offline-browser-runtime.e2e.js ใช้testkeysและofflineEdge/Chrome ตรวจsource/payloadversionจริงที่เตรียมปล่อย
- หน้าadmin: node --test owner-host/admin-dashboard-ui.test.mjs owner-host/debt-policy.test.mjs cloudflare/test/admin_mutations.test.mjs; node owner-host/admin-dashboard-ui-pilot.mjs ตรวจภาพdesktop/mobileจากfixtures
- Manager/browser UI ทดสอบสำเนาport3899แยกปิดupdatersและใช้test_isolationตามAGENTS ไม่ปิดManagerEXEจริง
- node --check ทีละไฟล์JS/MJSที่แก้; builderตรวจpins/signature/hash/size/chunks; ZIPตรวจallowlist/entryhash/noCustomerFiles

หลังdeployใช้health/manifest/signedchunks/สถานะManagerตรวจแบบread-only; รักษาpendingACK/idempotency/accountscope/negativebalance ไม่ทดสอบหักเงินด้วยเหตุการณ์fixtureในproduction

ผลreview/cutoverที่ปิดแล้วเก็บในtrash/hub-history ไม่ใช้candidatechecklistเก่าเป็นสถานะlive
