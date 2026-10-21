'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {createOfflineJournal,bangkokDate}=require('../offline_journal');
const fixtures=()=>({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-offline-journal-')),accountId:'account-a',protect:v=>v,unprotect:v=>v});
test('daily debt deduplicates slots, persists restart and clears only snapshot ACKs',()=>{
 const options=fixtures();let j=createOfflineJournal(options);const time=Date.parse('2026-10-12T18:00:00Z');
 assert.equal(bangkokDate(time),'2026-10-13');j.observe({profileId:'p',observedAt:time});assert.equal(j.observe({profileId:'p',observedAt:time}),null);assert.equal(j.balance(),-100);
 const batch=j.snapshot();j.observe({profileId:'q',observedAt:time});j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:[batch.events[0].eventId],balanceUnits:900,unitScale:100,rateUnits:100,walletRevision:1});assert.equal(j.balance(),800);assert.equal(j.pendingCount(),1);
 j=createOfflineJournal(options);assert.equal(j.balance(),800);assert.equal(j.history().length,2);assert.equal(j.observe({profileId:'p',observedAt:time}),null);
 j.observe({profileId:'p',observedAt:time+86400000});assert.equal(j.balance(),700);
});
test('invalid ACK retains debt and corrupt files never reset debt',()=>{
 const options=fixtures(),j=createOfflineJournal(options);j.observe({profileId:'p'});const batch=j.snapshot();assert.throws(()=>j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:['not-submitted'],balanceUnits:500,unitScale:100,rateUnits:100,walletRevision:1}));assert.equal(j.balance(),-100);
 const dir=path.join(options.dataDir,'offline',require('crypto').createHash('sha256').update(options.accountId).digest('hex'));fs.writeFileSync(path.join(dir,'index.dat'),'corrupt');assert.throws(()=>createOfflineJournal(options),/CORRUPT/);assert.equal(fs.readFileSync(path.join(dir,'index.dat'),'utf8'),'corrupt');
});
test('server admin change establishes fresh base and pending debt is subtracted once',()=>{
 const j=createOfflineJournal(fixtures());const initial=j.snapshot();j.acknowledge(initial,{success:true,batchId:initial.batchId,ackEventIds:[],balanceUnits:1000,unitScale:100,rateUnits:100,walletRevision:1});j.observe({profileId:'p'});const batch=j.snapshot();j.observe({profileId:'q'});j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:batch.events.map(e=>e.eventId),balanceUnits:1900,unitScale:100,rateUnits:100,walletRevision:3});assert.equal(j.balance(),1800);
 const next=j.snapshot();j.acknowledge(next,{success:true,batchId:next.batchId,ackEventIds:next.events.map(e=>e.eventId),balanceUnits:1800,unitScale:100,rateUnits:100,walletRevision:4});assert.equal(j.balance(),1800);assert.equal(j.pendingCount(),0);
});
test('existing account slots are reused during migration and accounts remain isolated',()=>{
 const options=fixtures();fs.writeFileSync(path.join(options.dataDir,'script_coordinator_v1.json'),JSON.stringify({slots:{p:{slotId:'old-slot',accountId:'account-a'}}}));const j=createOfflineJournal(options);assert.equal(j.slot('p'),'old-slot');assert.notEqual(createOfflineJournal({...options,accountId:'account-b'}).slot('p'),'old-slot');
});
test('lost ACK retries identical persisted batch including sessions after restart',()=>{
 const options=fixtures();let j=createOfflineJournal(options);j.observe({profileId:'p'});const batch=j.snapshot(500,[{profileId:'p',slotId:j.slot('p'),running:true}]);j.observe({profileId:'q'});j=createOfflineJournal(options);assert.deepEqual(j.snapshot(500,[]),batch);assert.throws(()=>j.acknowledge(batch,{success:true,batchId:'other',ackEventIds:[],balanceUnits:900,unitScale:100,rateUnits:100,walletRevision:1}),/INVALID_SYNC_ACK/);j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:batch.events.map(e=>e.eventId),balanceUnits:900,unitScale:100,rateUnits:100,walletRevision:2});assert.equal(j.pendingCount(),1);assert.equal(j.balance(),800);assert.notEqual(j.snapshot().batchId,batch.batchId);
 const jRate=createOfflineJournal(fixtures()),tDay=Date.parse('2026-10-21T02:00:00Z');jRate.observe({profileId:'p',observedAt:tDay});const b1=jRate.snapshot();jRate.acknowledge(b1,{success:true,batchId:b1.batchId,ackEventIds:b1.events.map(e=>e.eventId),eventCharges:[{eventId:b1.events[0].eventId,rateUnits:250}],balanceUnits:750,unitScale:100,rateUnits:250,bangkokDay:'2026-10-21',walletRevision:5});assert.equal(jRate.rate(),250);const b2=jRate.snapshot();jRate.acknowledge(b2,{success:true,batchId:b2.batchId,ackEventIds:[],balanceUnits:750,unitScale:100,rateUnits:100,bangkokDay:'2026-10-21',walletRevision:5});assert.equal(jRate.rate(),100);assert.equal(jRate.history()[0].rateUnits,100);
});
