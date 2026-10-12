'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createScriptCoordinator,fetchApprovedPayload,usageEvidenceData}=require('../script_coordinator');
const {createLocalHumanCheck}=require('../local_human_check');
const {createHumanCheckSolver}=require('../human_check_solver');
const {createDiscordBotService}=require('../discord_bot');
function dir(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-coordinator-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
const catalog={items:[{id:1,name:'Red Potion'},{id:2,name:'Potion'}],manifest:{items:{1:'red.png',2:'potion.png'}}};
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
test('observation never enrolls, delivers payload, counts unused profiles or creates billable events',async t=>{
 const dataDir=dir(t),reads=[];let clock=Date.UTC(2026,9,12,16,59,59);
 const make=()=>createScriptCoordinator({dataDir,now:()=>clock,loadProfiles:()=>[{id:'p1',debugPort:1},{id:'p2',debugPort:2}],evalProfilePort:async(port,code)=>{reads.push(code);return {success:true,result:{version:'4.36.0',running:port===1,busy:[]}};},service:{serviceRequest(){throw Error('UNEXPECTED_NETWORK');}}});
 let c=make();await c.cycle();await c.cycle();assert.equal(c.status().observedSlotsToday,1);assert.equal(c.status().pendingEvents,0);assert.equal(c.status().billingEnabled,null);
 assert.ok(reads.every(code=>!code.includes('.accept(')));c=make();assert.equal(c.status().observedSlotsToday,1);clock+=2000;assert.equal(c.status().observedSlotsToday,0);await c.cycle();assert.equal(c.status().observedSlotsToday,1);
});
test('signed pilot delivery verifies payload, reuses stable slot and renews without duplicate injection',async t=>{
 const dataDir=dir(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),source='runtime.assert();',now=()=>1000000;
 let activated=false,deliveries=0,renewals=0,events=[],failSync=true;const proofs=[];
 const service={async serviceRequest(route,body){
  if(route.endsWith('/device'))return {success:true};
  if(route.endsWith('/slot'))return {success:true,slotId:'stable-slot',bindingVersion:1};
  if(route.endsWith('/lease')){proofs.push(body);const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'a',deviceId:body.deviceId,slotId:body.slotId,managerInstanceId:body.managerInstanceId,runtimeNonce:body.runtimeNonce,bindingVersion:1,leaseId:'lease',issuedAt:now(),expiresAt:now()+300000,graceUntil:now()+600000,version:'4.37.0',payloadHash:hash(source)})).toString('base64url');return {success:true,leaseId:'lease',ticket:{keyId:'key',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+claims),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};}
  if(route.endsWith('/payload'))return {success:true,chunked:true,chunkCount:1,size:Buffer.byteLength(source),version:'4.37.0',hash:hash(source)};
  if(route.endsWith('/payload-chunk'))return {success:true,version:'4.37.0',hash:hash(source),chunks:[{ordinal:0,source}]};
  if(route.endsWith('/record')){events=[body];if(failSync)throw Error('offline');return {success:true,eventId:body.eventId,slotId:body.slotId,bangkokDay:'1970-01-01',ackAnchor:hash(JSON.stringify(['a',body.eventId,body.slotId,'1970-01-01']))};}
  throw Error('unexpected route');
 }};
 const c=createScriptCoordinator({dataDir,now,loadProfiles:()=>[{id:'p1',debugPort:1}],service,pilotProfileIds:['p1'],trustedKeys:{key:keys.publicKey.export({format:'jwk'})},protect:v=>v,unprotect:v=>v,evalProfilePort:async(_,code)=>{
  if(code.includes('.accept(')){deliveries++;activated=true;return {success:true,result:{success:true}};}
  if(code.includes('.renew(')){renewals++;return {success:true,result:{success:true}};}
  return {success:true,result:{running:true,version:activated?'4.37.0':null,busy:activated?['shop']:[],bootstrap:{protocol:1,runtimeNonce:'nonce',activated}}};
 }});
 await c.cycle();assert.equal(c.status().clients.p1.state,'authorized');assert.equal(deliveries,1);assert.equal(c.status().pendingEvents,0);
 await c.cycle();assert.equal(deliveries,1);assert.equal(renewals,1);assert.equal(events.length,1);const firstEvent=events[0].eventId; await c.cycle();assert.equal(events[0].eventId,firstEvent);assert.equal(proofs[0].deviceId,proofs[1].deviceId);
 failSync=false;await c.cycle();assert.equal(c.status().pendingEvents,0);await c.cycle();assert.equal(c.status().pendingEvents,0);
});
test('local last-good catalog works with zero balance and no network; ambiguous answers require manual',async t=>{
 const dataDir=dir(t),local=createLocalHumanCheck({dataDir});local.update(catalog,hash(catalog));
 assert.throws(()=>local.update({...catalog,items:[]},hash(catalog)),/INVALID_CATALOG/);
 const solver=createHumanCheckSolver({dataDir,requestJSON:()=>{throw Error('NETWORK_MUST_NOT_BE_CALLED');}});
 const answer=await solver.solveHumanCheck('เลือกภาพของ Red Potion',[{index:0,icon:'red.png'},{index:1,icon:'potion.png'}]);assert.equal(answer.success,true);assert.equal(answer.charged,0);assert.equal(answer.pickIndex,0);
 const ambiguous=await solver.solveHumanCheck('Red Potion',[{index:0,itemId:1},{index:1,itemId:1}]);assert.equal(ambiguous.code,'MANUAL_REQUIRED');
 assert.equal((await solver.solveHumanCheck('Potion',[{index:0,itemId:1},{index:1,itemId:2}])).pickIndex,1);
});
test('historical offline evidence is held for review rather than billed on server today',async t=>{
 const dataDir=dir(t);fs.writeFileSync(path.join(dataDir,'script_coordinator_v1.json'),JSON.stringify({schema:1,slots:{},observed:{},sequence:1,queue:[{eventId:'old-event',slotId:'stable',bangkokDate:'2026-10-11',leaseId:'expired',runtimeNonce:'old'}]}));
 const c=createScriptCoordinator({dataDir,now:()=>Date.UTC(2026,9,12,12),loadProfiles:()=>[],evalProfilePort:()=>assert.fail('no profiles'),service:{serviceRequest:()=>assert.fail('historical usage must not be posted')}});await c.cycle();assert.equal(c.status().pendingEvents,1);assert.equal(c.status().reconciliationRequired,1);
 const first=JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json'),'utf8')).managerInstanceId;
 const restarted=createScriptCoordinator({dataDir,loadProfiles:()=>[],evalProfilePort:()=>{},service:{}});assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json'),'utf8')).managerInstanceId,first);restarted.stop();
});
test('fresh public seed solves offline and the complete Discord game bridge answers once',async t=>{
 const dataDir=dir(t),solver=createHumanCheckSolver({dataDir,requestJSON:()=>assert.fail('offline seed must not request any API')}),calls=[];
 const profile={id:'seed-test',name:'test',debugPort:49999};solver.saveSettings({answerDelayMs:800});
 assert.equal(solver.loadSettings().pointsPerSolve,0);
 const discord=createDiscordBotService({dataDir,loadProfiles:()=>[profile],humanCheckSolver:solver,evalProfilePort:async(...args)=>{calls.push(args);return {result:{success:true}};}});
 const check={id:'seed-check',prompt:'เลือกภาพของ Buckler',options:[{index:0,itemId:2101},{index:1,itemId:2104}]};
 await discord.notifyHumanCheck({profile,check});assert.equal(calls.length,1);assert.ok(calls[0][1].includes('Buckler'));
 await discord.notifyHumanCheck({profile,check});assert.equal(calls.length,1);
 const ambiguous=await solver.solveHumanCheck('Guard',[{index:0,itemId:2101},{index:1,itemId:2102}]);assert.equal(ambiguous.code,'MANUAL_REQUIRED');
});
test('schema 2 signed unit balances and free remote fallback retain exact fractional debt',async t=>{
 const solver=createHumanCheckSolver({dataDir:dir(t),localCatalogSeed:false,serviceUrl:'https://service.test',requestJSON:async(route,body)=>{
  if(route.endsWith('/enroll'))return {success:true,accountId:'test',token:'a'.repeat(64)};
  if(route.endsWith('/balance'))return {success:true,schemaVersion:2,unitScale:100,balanceUnits:-2250,points:-22.5,pointsPerSolve:0};
  if(route.endsWith('/solve'))return {success:true,schemaVersion:2,unitScale:100,remainingUnits:-2250,remaining:-22.5,charged:0,pickIndex:0,requestId:body.requestId};
  throw Error('catalog unavailable');
 }});
 const balance=await solver.refreshBalance();assert.equal(balance.balanceUnits,-2250);assert.equal(balance.points,-22.5);
 assert.equal((await solver.solveHumanCheck('question',[{index:0},{index:1}])).success,true);
});
test('weight scroll and sender trade busy states are detected by the real game probe',()=>{
 const {PROBE_JS}=require('../script_coordinator');
 for(const flag of ['__isWeightScrollBusy','__senderTradeBusy']){
  const result=new Function('window','document','return '+PROBE_JS)({[flag]:true},{querySelector:()=>null});assert.deepEqual(result.busy,[flag]);
 }
});
test('delivery rejects modified signatures, payload hashes, account and binding claims',t=>{
 const dataDir=dir(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),source='runtime.assert();',publicJwk=keys.publicKey.export({format:'jwk'});
 const c=createScriptCoordinator({dataDir,now:()=>1000000,loadProfiles:()=>[],evalProfilePort:()=>{},service:{loadSettings:()=>({accountId:'account-a'})},trustedKeys:{key:publicJwk}});
 const managerInstanceId=JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json'),'utf8')).managerInstanceId;
 const expected={deviceId:'device',slotId:'slot',runtimeNonce:'nonce',bindingVersion:1};
 const base={...expected,accountId:'account-a',protocol:1,managerInstanceId,issuedAt:1000000,expiresAt:1300000,graceUntil:1600000,version:'4.37.0',payloadHash:hash(source)};
 const ticket=claims=>{const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url');return {claims:encoded,keyId:'key',signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+encoded),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};};
 const payload={source,version:'4.37.0',hash:hash(source)};
 assert.doesNotThrow(()=>c.verifyDelivery(ticket(base),payload,expected));
 for(const changed of [{accountId:'other'},{slotId:'other'},{bindingVersion:2},{expiresAt:999999},{graceUntil:1600001}])assert.throws(()=>c.verifyDelivery(ticket({...base,...changed}),payload,expected));
 assert.throws(()=>c.verifyDelivery({...ticket(base),signature:'A'.repeat(86)},payload,expected),/SIGNATURE/);
 assert.throws(()=>c.verifyDelivery(ticket(base),{...payload,source:'modified'},expected),/HASH/);
});
test('offline credential change requires remote rebind and preserves slot and queued debt evidence',async t=>{
 const dataDir=dir(t),file=path.join(dataDir,'script_coordinator_v1.json');
 fs.writeFileSync(file,JSON.stringify({schema:1,slots:{p:{slotId:'stable-slot',bindingVersion:1}},observed:{},sequence:1,queue:[{eventId:'pending',bangkokDate:'yesterday',slotId:'stable-slot'}]}));
 let online=true,serverUnavailable=false;const requests=[];
 const c=createScriptCoordinator({dataDir,loadProfiles:()=>[],protect:v=>v,unprotect:v=>v,evalProfilePort:async()=>online?{success:true,result:{}}:{success:false},service:{async serviceRequest(route,body){requests.push({route,body});if(serverUnavailable)throw Error('offline API');return {success:true,slotId:body.slotId,bindingVersion:body.expectedBindingVersion+1};}}});
 await assert.rejects(c.prepareCredentialChange({id:'p',debugPort:1}),/ต้องปิด/);assert.equal(requests.length,0);
 online=false;serverUnavailable=true;await assert.rejects(c.prepareCredentialChange({id:'p',debugPort:1}),/offline API/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).slots.p.bindingVersion,1);
 serverUnavailable=false;const result=await c.prepareCredentialChange({id:'p',debugPort:1,password:'never-send'});assert.equal(result.slotId,'stable-slot');const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.slots.p.bindingVersion,2);assert.equal(saved.queue[0].eventId,'pending');
 assert.ok(requests.every(r=>r.route.endsWith('/script/rebind')&&!Object.hasOwn(r.body,'password')));
});
test('authenticated grouped chunks assemble a large Thai payload and reject omissions, ordering and corruption',async()=>{
 const source='// ภาษาไทย🙂\n'.repeat(45000),characters=Array.from(source),pieces=[];
 for(let at=0;at<characters.length;at+=10000)pieces.push(characters.slice(at,at+10000).join(''));
 const metadata={success:true,chunked:true,chunkCount:pieces.length,size:Buffer.byteLength(source),version:'4.37.0',hash:hash(source)};
 let corruption=null;const requested=[];
 const service={async serviceRequest(route,body){assert.ok(route.endsWith('/payload-chunk'));assert.ok(body.count<=3);requested.push(body);const chunks=pieces.slice(body.ordinal,body.ordinal+body.count).map((source,i)=>({ordinal:body.ordinal+i,source}));
  if(corruption==='missing')chunks.pop();if(corruption==='order')chunks[0].ordinal++;if(corruption==='source')chunks[0].source+='bad';return {success:true,version:metadata.version,hash:metadata.hash,chunks};
 }};
 assert.equal((await fetchApprovedPayload(service,metadata,{leaseId:'lease',runtimeNonce:'nonce'})).source,source);assert.equal(requested.length,Math.ceil(pieces.length/3));
 for(const mode of ['missing','order','source']){corruption=mode;await assert.rejects(fetchApprovedPayload(service,metadata,{leaseId:'lease',runtimeNonce:'nonce'}));}
 await assert.rejects(fetchApprovedPayload(service,{...metadata,source,chunked:false},{leaseId:'lease'}),/METADATA/);
});
test('ready runtimes renew before at most three new downloads; device and slots are reused',async t=>{
 const dataDir=dir(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),source='runtime.assert();',activated=new Set(['ready']),apiCalls=[];
 const profiles=['fresh0','fresh1','fresh2','fresh3','ready'].map((id,i)=>({id,debugPort:i+1})),leases=[];
 const service={loadSettings:()=>({accountId:'a'}),async serviceRequest(route,body){apiCalls.push(route);if(route.endsWith('/device'))return {success:true};if(route.endsWith('/slot'))return {success:true,slotId:body.profileId,bindingVersion:1};
  if(route.endsWith('/lease')){leases.push(body.slotId);const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'a',deviceId:body.deviceId,slotId:body.slotId,managerInstanceId:body.managerInstanceId,runtimeNonce:body.runtimeNonce,bindingVersion:1,leaseId:body.slotId,issuedAt:1000000,expiresAt:1300000,graceUntil:1600000,version:'4.37.0',payloadHash:hash(source)})).toString('base64url');return {success:true,leaseId:body.slotId,ticket:{keyId:'key',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+claims),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};}
  if(route.endsWith('/payload'))return {success:true,chunked:true,chunkCount:1,size:Buffer.byteLength(source),version:'4.37.0',hash:hash(source)};
  if(route.endsWith('/payload-chunk'))return {success:true,version:'4.37.0',hash:hash(source),chunks:[{ordinal:0,source}]};throw Error('unexpected');
 }};
 const c=createScriptCoordinator({dataDir,now:()=>1000000,loadProfiles:()=>profiles,service,pilotProfileIds:profiles.map(p=>p.id),protect:v=>v,unprotect:v=>v,trustedKeys:{key:keys.publicKey.export({format:'jwk'})},evalProfilePort:async(port,code)=>{
  const id=profiles.find(p=>p.debugPort===port).id;if(code.includes('.accept(')){activated.add(id);return {success:true,result:{success:true}};}if(code.includes('.renew('))return {success:true,result:{success:true}};
  return {success:true,result:{running:false,version:activated.has(id)?'4.37.0':null,busy:[],bootstrap:{runtimeNonce:id,activated:activated.has(id)}}};
 }});
 await c.cycle();assert.equal(leases[0],'ready');assert.equal(apiCalls.filter(r=>r.endsWith('/payload')).length,3);assert.equal(c.status().clients.fresh3.state,'waiting-download-budget');
 await c.cycle();assert.equal(apiCalls.filter(r=>r.endsWith('/payload')).length,4);assert.equal(apiCalls.filter(r=>r.endsWith('/device')).length,1);assert.equal(apiCalls.filter(r=>r.endsWith('/slot')).length,5);
 await c.cycle();assert.equal(apiCalls.filter(r=>r.endsWith('/slot')).length,5);assert.equal(apiCalls.filter(r=>r.endsWith('/payload')).length,4);
});
test('rebind retries same durable request after server commit and lost response',async t=>{
 const dataDir=dir(t),file=path.join(dataDir,'script_coordinator_v1.json');fs.writeFileSync(file,JSON.stringify({schema:1,slots:{p:{slotId:'stable',bindingVersion:1}},observed:{},queue:[],sequence:0}));
 let committed=null,first=true;const service={async serviceRequest(route,body){assert.ok(route.endsWith('/rebind'));if(first){first=false;committed={...body};throw Error('response lost after commit');}assert.equal(body.requestId,committed.requestId);assert.equal(body.expectedBindingVersion,1);return {success:true,slotId:'stable',bindingVersion:2};}};
 const make=()=>createScriptCoordinator({dataDir,loadProfiles:()=>[],service,protect:v=>v,unprotect:v=>v,evalProfilePort:async()=>({success:false})});
 let c=make();await assert.rejects(c.prepareCredentialChange({id:'p',debugPort:1}),/response lost/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).pendingRebind.p.requestId,committed.requestId);
 c=make();await c.prepareCredentialChange({id:'p',debugPort:1});const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.slots.p.slotId,'stable');assert.equal(saved.slots.p.bindingVersion,2);assert.equal(saved.pendingRebind.p,undefined);
});
test('invalid cached binding triggers authenticated slot reconciliation without replacing immutable slot',async t=>{
 const dataDir=dir(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});let slots=0;
 const service={loadSettings:()=>({accountId:'a'}),async serviceRequest(route,body){
  if(route.endsWith('/device'))return {success:true};
  if(route.endsWith('/slot'))return {success:true,slotId:++slots===1?'stable':'unexpected-new-slot',bindingVersion:1};
  if(route.endsWith('/lease')){const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'a',deviceId:body.deviceId,slotId:'stable',managerInstanceId:body.managerInstanceId,runtimeNonce:'nonce',bindingVersion:2,leaseId:'lease',issuedAt:1000000,expiresAt:1300000,graceUntil:1600000,version:'4.37.0',payloadHash:'a'.repeat(64)})).toString('base64url');return {leaseId:'lease',ticket:{keyId:'key',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+claims),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};}
  throw Error('unexpected route');
 }};
 const c=createScriptCoordinator({dataDir,now:()=>1000000,loadProfiles:()=>[{id:'p',debugPort:1}],service,pilotProfileIds:['p'],protect:v=>v,unprotect:v=>v,trustedKeys:{key:keys.publicKey.export({format:'jwk'})},evalProfilePort:async()=>({success:true,result:{version:'4.37.0',running:false,busy:[],bootstrap:{runtimeNonce:'nonce',activated:true}}})});
 await c.cycle();assert.equal(c.status().clients.p.reason,'INVALID_SCRIPT_TICKET');await c.cycle();assert.equal(slots,2);assert.equal(c.status().clients.p.reason,'SERVER_SLOT_ID_CHANGED_REVIEW_REQUIRED');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json'),'utf8')).slots.p.slotId,'stable');
});
test('signed queued evidence survives restart, validates sequence and stores server anchor before removal',async t=>{
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),day='2026-10-12';
 for(const mutation of [null,'unsigned','sequence','slot','anchor']) {
  const dataDir=dir(t),file=path.join(dataDir,'script_coordinator_v1.json'),deviceId='device';
  fs.writeFileSync(path.join(dataDir,'script_device_v1.json'),JSON.stringify({deviceId,protectedKey:Buffer.from(keys.privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'),publicJwk:keys.publicKey.export({format:'jwk'})}));
  const event={eventId:'event',sequence:1,slotId:'stable',bangkokDate:day,observedAt:Date.UTC(2026,9,12,12),deviceId,leaseId:'lease',runtimeNonce:'nonce',previousAnchor:'b'.repeat(64)};
  event.proof=crypto.sign('sha256',usageEvidenceData(event),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  if(mutation==='unsigned')delete event.proof;if(mutation==='sequence')event.sequence=2;if(mutation==='slot')event.slotId='forged-slot';
  fs.writeFileSync(file,JSON.stringify({schema:1,slots:{},observed:{},queue:[event],sequence:1,lastAckAnchor:'b'.repeat(64)}));let calls=0;
  const ackAnchor=hash(JSON.stringify(['a','event','stable',day]));
  const c=createScriptCoordinator({dataDir,now:()=>Date.UTC(2026,9,12,12),loadProfiles:()=>[],unprotect:v=>v,service:{loadSettings:()=>({accountId:'a'}),async serviceRequest(route,body){if(route.endsWith('/usage/statement'))return {success:true,billingMode:'shadow'};calls++;assert.ok(route.endsWith('/usage/record'));assert.deepEqual(Object.keys(body).sort(),['eventId','leaseId','runtimeNonce','slotId']);return {success:true,eventId:'event',slotId:'stable',bangkokDay:day,ackAnchor:mutation==='anchor'?'a'.repeat(64):ackAnchor};}},evalProfilePort:()=>assert.fail('no game actions')});
  await c.cycle();const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(mutation===null){assert.equal(calls,1);assert.equal(c.status().pendingEvents,0);assert.equal(saved.lastAckAnchor,ackAnchor);assert.equal(saved.lastAckSequence,1);}
  else {assert.equal(c.status().pendingEvents,1);assert.equal(c.status().reconciliationRequired,1);assert.equal(calls,mutation==='anchor'?1:0);assert.equal(saved.lastAckAnchor,'b'.repeat(64));}
 }
});
test('a signed version or hash change reports safe update-required without renewing or reinjecting',async t=>{
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 for(const change of ['version','hash']) {
  const dataDir=dir(t);let gameActions=0;
  const service={loadSettings:()=>({accountId:'a'}),async serviceRequest(route,body){if(route.endsWith('/device'))return {success:true};if(route.endsWith('/slot'))return {success:true,slotId:'slot',bindingVersion:1};
   if(route.endsWith('/lease')){const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'a',deviceId:body.deviceId,slotId:'slot',managerInstanceId:body.managerInstanceId,runtimeNonce:'nonce',bindingVersion:1,leaseId:'lease',issuedAt:1000000,expiresAt:1300000,graceUntil:1600000,version:change==='version'?'4.38.0':'4.37.0',payloadHash:change==='hash'?'b'.repeat(64):'a'.repeat(64)})).toString('base64url');return {leaseId:'lease',ticket:{keyId:'key',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+claims),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};}
   assert.fail('updated payload must wait for safe refresh');
  }};
  const c=createScriptCoordinator({dataDir,now:()=>1000000,loadProfiles:()=>[{id:'p',debugPort:1}],service,pilotProfileIds:['p'],protect:v=>v,unprotect:v=>v,trustedKeys:{key:keys.publicKey.export({format:'jwk'})},evalProfilePort:async(_,code)=>{if(code.includes('.renew(')||code.includes('.accept('))gameActions++;return {success:true,result:{version:'4.37.0',running:true,busy:['refine'],bootstrap:{activated:true,runtimeNonce:'nonce',version:'4.37.0',payloadHash:'a'.repeat(64)}}};}});
  await c.cycle();assert.equal(c.status().clients.p.state,'update-required');assert.deepEqual(c.status().clients.p.busy,['refine']);assert.equal(gameActions,0);
 }
});

test('status reads actual server billing and marks unavailable status unknown without enrolling',async t=>{
 const dataDir=dir(t);let now=1000000,calls=0,fail=false;
 const c=createScriptCoordinator({dataDir,now:()=>now,loadProfiles:()=>[],evalProfilePort:()=>assert.fail('no game action'),service:{loadSettings:()=>({accountId:'existing'}),serviceRequest:async route=>{calls++;assert.equal(route,'/v1/aetheria/usage/statement');if(fail)throw Error('offline');return {success:true,billingMode:'deferred'};}}});
 assert.equal(c.status().billingEnabled,null);await c.cycle();assert.equal(c.status().billingEnabled,true);await c.cycle();assert.equal(calls,1);now+=60001;fail=true;await c.cycle();assert.equal(c.status().billingEnabled,null);
});
