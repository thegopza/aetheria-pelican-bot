'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createScriptCoordinator}=require('../script_coordinator');
test('rollout changes apply only after in-flight delivery and reject simultaneous credential rebind',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-race-'));
 // Keep the tiny owned fixture for diagnostics; no deletion of credentials or customer files.
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=keys.publicKey.export({format:'jwk'}),source='runtime.assert();',hash=crypto.createHash('sha256').update(source).digest('hex');
 let selected={mode:'pilot',serviceOrigin:'https://stage.test',pilotProfileIds:['p1'],trustedKeys:{test:jwk},configurationCode:'PILOT'};
 let releaseDownload,notifyDownload;const downloadStarted=new Promise(r=>notifyDownload=r),downloadGate=new Promise(r=>releaseDownload=r);
 let activated=false,deliveries=0,apiCalls=0;
 const service={serviceOrigin:'https://stage.test',async serviceRequest(route,body){apiCalls++;
  if(route.endsWith('/device'))return {success:true};if(route.endsWith('/slot'))return {success:true,slotId:'stable-slot',bindingVersion:1};
  if(route.endsWith('/lease')){const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'a',deviceId:body.deviceId,slotId:body.slotId,managerInstanceId:body.managerInstanceId,runtimeNonce:body.runtimeNonce,bindingVersion:1,leaseId:'l',issuedAt:1000000,expiresAt:1300000,graceUntil:1600000,version:'4.37.0',payloadHash:hash})).toString('base64url');return {success:true,leaseId:'l',ticket:{keyId:'test',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.ticket.v1\n'+claims),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}};}
  if(route.endsWith('/payload')){notifyDownload();await downloadGate;return {success:true,chunked:true,chunkCount:1,size:Buffer.byteLength(source),version:'4.37.0',hash};}
  if(route.endsWith('/payload-chunk'))return {success:true,version:'4.37.0',hash,chunks:[{ordinal:0,source}]};
  throw Error('UNEXPECTED_ROUTE');
 }};
 const c=createScriptCoordinator({dataDir,now:()=>1000000,service,loadProfiles:()=>[{id:'p1',debugPort:1}],protect:v=>v,unprotect:v=>v,reloadRollout:()=>selected,evalProfilePort:async(_,code)=>{
  if(code.includes('.accept(')){deliveries++;activated=true;return {success:true,result:{success:true}};}
  return {success:true,result:{version:activated?'4.37.0':null,running:false,busy:[],bootstrap:{activated,runtimeNonce:'nonce',protocol:1}}};
 }});
 const instance=JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json'))).managerInstanceId;
 const cycle=c.cycle();await downloadStarted;
 selected={mode:'observation',serviceOrigin:'https://stage.test',pilotProfileIds:[],trustedKeys:{},configurationCode:'OBSERVATION'};
 await assert.rejects(c.prepareCredentialChange({id:'p1',debugPort:1}),/กำลังตรวจสิทธิ์/);
 await c.cycle();assert.deepEqual(c.status().pilotProfileIds,['p1']);assert.equal(deliveries,0);
 releaseDownload();await cycle;assert.equal(deliveries,1);assert.equal(c.status().clients.p1.state,'authorized');
 const before=apiCalls;await c.cycle();assert.equal(apiCalls,before);assert.deepEqual(c.status().pilotProfileIds,[]);assert.equal(c.profileScriptSource('p1'),null);assert.equal(c.status().billingEnabled,false);
 const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'script_coordinator_v1.json')));assert.equal(saved.managerInstanceId,instance);assert.equal(saved.slots.p1.slotId,'stable-slot');assert.equal(saved.queue.length,0);
});
