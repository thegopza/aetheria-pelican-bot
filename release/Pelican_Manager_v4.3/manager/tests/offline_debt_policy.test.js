'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createOfflineJournal}=require('../offline_journal');
const {createOfflineCoordinator}=require('../offline_coordinator');
const {createOfflinePayloadCache}=require('../offline_payload_cache');
function fixture(t){const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-debt-policy-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));return {dataDir,accountId:'a',initialBalanceUnits:1000,protect:v=>v,unprotect:v=>v,now:()=>Date.UTC(2026,9,13,1)};}
const policy=(enabled,revision)=>({enabled,revision,effectiveAt:revision*1000});
function ack(j,batch,debtPolicy,walletRevision=1){return j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:batch.events.map(e=>e.eventId),unitScale:100,rateUnits:100,balanceUnits:1000,walletRevision,...(debtPolicy?{debtPolicy,billingEnabled:debtPolicy.enabled,debtPolicyRevision:debtPolicy.revision}:{})});}
test('switch has its own revision; disabled cache persists encrypted across restart and an old host cannot reset it',t=>{
 const f=fixture(t),j=createOfflineJournal(f);ack(j,j.snapshot(),policy(false,2),1);
 assert.equal(j.debtPolicy().enabled,false);assert.equal(j.walletRevision(),1);
 const next=createOfflineJournal(f);assert.deepEqual(next.debtPolicy(),policy(false,2));
 assert.equal(next.observe({profileId:'p'}),null);assert.ok(next.slot('p'));
 ack(next,next.snapshot(),undefined,2);assert.equal(next.debtPolicy().enabled,false);
 const file=path.join(f.dataDir,'offline',crypto.createHash('sha256').update('a').digest('hex'),'index.dat');assert.equal(fs.readFileSync(file,'utf8').includes('debtPolicy'),false);
});
test('policy updates with equal wallet revision and re-enable charges a slot once on that same Bangkok day',t=>{
 const j=createOfflineJournal(fixture(t));ack(j,j.snapshot(),policy(false,1),1);
 assert.equal(j.observe({profileId:'p'}),null);assert.equal(j.history().length,0);
 const result=ack(j,j.snapshot(),policy(true,2),1);assert.equal(result.applied,false);assert.equal(result.policyApplied,true);
 assert.ok(j.observe({profileId:'p'}));assert.equal(j.observe({profileId:'p'}),null);assert.equal(j.pendingCount(),1);assert.equal(j.balance(),900);
});
test('turning off preserves pre-switch immutable debt and its ACK, while no new slot creates debt',t=>{
 const j=createOfflineJournal(fixture(t));j.observe({profileId:'already-running'});const batch=j.snapshot();
 // Server accepts the prior event and returns the new switch atomically.
 j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:batch.events.map(e=>e.eventId),unitScale:100,rateUnits:100,balanceUnits:900,walletRevision:2,debtPolicy:policy(false,1)});
 assert.equal(j.pendingCount(),0);assert.equal(j.history()[0].acknowledged,true);assert.equal(j.balance(),900);
 assert.equal(j.observe({profileId:'new-running'}),null);assert.equal(j.history().length,1);
});
test('malformed or conflicting policy rejects before ACK clearing even at equal wallet revision',t=>{
 const j=createOfflineJournal(fixture(t));ack(j,j.snapshot(),policy(true,2),1);j.observe({profileId:'p'});const batch=j.snapshot();
 for(const p of [policy(false,2),{enabled:'false',revision:3,effectiveAt:3},{enabled:false,revision:3,effectiveAt:-1}]){
   assert.throws(()=>ack(j,batch,p,1),/SYNC_DEBT_POLICY/);assert.equal(j.pendingCount(),1);assert.deepEqual(j.snapshot(),batch);assert.deepEqual(j.debtPolicy(),policy(true,2));
 }
 ack(j,batch,policy(false,3),1);assert.equal(j.pendingCount(),0);assert.equal(j.debtPolicy().enabled,false);
});
test('valid stale policy cannot roll back the cached switch but still clears a valid delayed ACK',t=>{
 const j=createOfflineJournal(fixture(t));j.observe({profileId:'p'});const batch=j.snapshot();
 // A separate empty response establishes a newer policy without touching that pending event.
 ack(j,{batchId:'newer-policy',events:[]},policy(false,3),2);
 assert.equal(j.pendingCount(),1);assert.equal(j.debtPolicy().enabled,false);
 ack(j,batch,policy(true,2),2);assert.equal(j.pendingCount(),0);assert.deepEqual(j.debtPolicy(),policy(false,3));
});
function coordinatorFixture(t){const f=fixture(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),source='/* isolated fixture */';const claims={protocol:2,mode:'friends-offline',version:'4.38.0',payloadHash:crypto.createHash('sha256').update(source).digest('hex'),size:Buffer.byteLength(source),issuedAt:Date.now()};const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url'),envelope={keyId:'test',claims:encoded,signature:crypto.sign('sha256',Buffer.from('PmheeAether.offline-release.v1\n'+encoded),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};Object.assign(f,{trustedKeys:{test:keys.publicKey.export({format:'jwk'})}});createOfflinePayloadCache(f).save({source,envelope});return f;}
test('coordinator polls one request per online minute, tracks disabled sessions, obeys cached switch offline and retries failures after two minutes',async t=>{
 const f=coordinatorFixture(t);let time=f.now(),current=policy(false,1),calls=[],online=true,running=false;
 const service={serviceOrigin:'https://fixture.invalid',loadSettings:()=>({accountId:'a',balanceUnits:1000}),setOfflineWallet(){},async serviceRequest(route,body){if(!route.endsWith('/sync'))throw Error('NO_MANIFEST_IN_FIXTURE');calls.push({time,body});if(!online)throw Error('OWNER_OFFLINE');return {success:true,batchId:body.batchId,ackEventIds:body.events.map(e=>e.eventId),unitScale:100,rateUnits:100,balanceUnits:1000,walletRevision:1,debtPolicy:current};}};
 const c=createOfflineCoordinator({...f,now:()=>time,service,loadProfiles:()=>[{id:'p',debugPort:1}],evalProfilePort:async()=>({success:true,result:{version:'4.38.0',existingRuntime:true,running,busy:[],bootstrap:{protocol:2}}})});t.after(()=>c.stop());
 await c.cycle();assert.equal(c.status().billingEnabled,false);running=true;
 time+=30000;await c.cycle();assert.equal(calls.length,1);assert.equal(c.status().pendingEvents,0);
 time+=30000;await c.cycle();assert.equal(calls.length,2);assert.equal(calls[1].body.sessions[0].running,true);assert.equal(c.statement().billingEnabled,false);
 online=false;time+=60000;await c.cycle();assert.equal(calls.length,3);
 time+=60000;await c.cycle();assert.equal(calls.length,3);assert.equal(c.status().pendingEvents,0);
 time+=60000;online=true;current=policy(true,2);await c.cycle();assert.equal(calls.length,4);assert.equal(c.statement().billingEnabled,true);
 time+=30000;await c.cycle();assert.equal(c.status().pendingEvents,1);assert.equal(c.statement().usedSlotsToday,1);
});

test('reconciliation removes offline estimates during disabled interval from history; invalid charges never clear debt',t=>{
 const f=fixture(t),j=createOfflineJournal(f);const event=j.observe({profileId:'p'}),batch=j.snapshot();
 const response={success:true,batchId:batch.batchId,ackEventIds:[event.eventId],unitScale:100,rateUnits:100,balanceUnits:1000,walletRevision:1,debtPolicy:policy(false,1)};
 for(const eventCharges of [[],[{eventId:'foreign',rateUnits:0}],[{eventId:event.eventId,rateUnits:-1}]]){
  assert.throws(()=>j.acknowledge(batch,{...response,eventCharges}),/INVALID_SYNC_EVENT_CHARGES/);assert.equal(j.pendingCount(),1);assert.equal(j.balance(),900);
 }
 j.acknowledge(batch,{...response,eventCharges:[{eventId:event.eventId,rateUnits:0}]});
 assert.equal(j.balance(),1000);assert.equal(j.history()[0].rateUnits,0);assert.equal(j.pendingCount(),0);
 assert.equal(createOfflineJournal(f).history()[0].rateUnits,0);
 const service={loadSettings:()=>({accountId:'a'}),setOfflineWallet(){}};
 const c=createOfflineCoordinator({...f,service,loadProfiles:()=>[],trustedKeys:{}});
 const statement=c.statement();assert.equal(statement.estimatedUnits,0);assert.equal(statement.billableSlotsToday,0);assert.equal(statement.usage[0].billable,0);assert.equal(statement.ledger[0].delta_units,0);
});

test('offline free observation can become a paid observation on the same day after re-enable; UI slot totals dedupe',t=>{
 const f=fixture(t),j=createOfflineJournal(f);const free=j.observe({profileId:'p'}),batch=j.snapshot();
 j.acknowledge(batch,{success:true,batchId:batch.batchId,ackEventIds:[free.eventId],unitScale:100,rateUnits:100,balanceUnits:1000,walletRevision:1,debtPolicy:policy(false,1),eventCharges:[{eventId:free.eventId,rateUnits:0}]});
 ack(j,j.snapshot(),policy(true,2),1);const paid=j.observe({profileId:'p'});assert.ok(paid);assert.notEqual(paid.eventId,free.eventId);assert.equal(j.balance(),900);assert.equal(j.observe({profileId:'p'}),null);
 const c=createOfflineCoordinator({...f,service:{loadSettings:()=>({accountId:'a'}),setOfflineWallet(){}},loadProfiles:()=>[],trustedKeys:{}});
 const s=c.statement();assert.equal(s.usedSlotsToday,1);assert.equal(s.billableSlotsToday,1);assert.equal(s.estimatedUnits,100);assert.equal(s.usage.length,1);assert.equal(s.usage[0].billable,1);assert.equal(s.ledger.length,1);assert.equal(s.ledger[0].delta_units,-100);
});
