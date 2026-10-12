'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {loadScriptRollout,STAGING_ORIGIN,PRODUCTION_ORIGIN}=require('../script_rollout');
function fixture(t){const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-rollout-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));return {load:serviceOrigin=>loadScriptRollout({dataDir,serviceOrigin}),save:body=>fs.writeFileSync(path.join(dataDir,'script_rollout_v1.json'),typeof body==='string'?body:JSON.stringify(body))};}
test('missing, corrupt and explicit observation configuration never selects pilots',t=>{
 const f=fixture(t);assert.equal(f.load(PRODUCTION_ORIGIN).mode,'observation');f.save('{bad json');assert.deepEqual(f.load(STAGING_ORIGIN).pilotProfileIds,[]);f.save({schema:1,mode:'observation',pilotProfileIds:[]});assert.equal(f.load(PRODUCTION_ORIGIN).configurationCode,'EXPLICIT_OBSERVATION');
});
test('local staging pilot requires exact pinned origin and public-only immutable P256 pins',t=>{
 const f=fixture(t),keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicJwk=keys.publicKey.export({format:'jwk'});
 f.save({schema:1,mode:'pilot',pilotProfileIds:['p1'],stagingPublicKeys:{stage:publicJwk}});const result=f.load(STAGING_ORIGIN);assert.equal(result.mode,'pilot');assert.deepEqual(result.pilotProfileIds,['p1']);assert.ok(Object.isFrozen(result.trustedKeys.stage));assert.equal(result.trustedKeys.stage.d,undefined);
 assert.equal(f.load(STAGING_ORIGIN+'.attacker.test').mode,'observation');assert.equal(f.load(PRODUCTION_ORIGIN).configurationCode,'PRODUCTION_LOCAL_PINS_FORBIDDEN');
 f.save({schema:1,mode:'pilot',pilotProfileIds:['p1'],stagingPublicKeys:{stage:keys.privateKey.export({format:'jwk'})}});assert.equal(f.load(STAGING_ORIGIN).configurationCode,'INVALID_PUBLIC_PINS');
});
test('production has no editable trust-anchor overrides and uses only shipped release pins',t=>{
 const f=fixture(t);f.save({schema:1,mode:'pilot',pilotProfileIds:['p1']});const shipped=require('../script_release_keys');const selected=f.load(PRODUCTION_ORIGIN);assert.equal(selected.configurationCode,Object.keys(shipped).length?'EXPLICIT_PILOT':'RELEASE_PUBLIC_PINS_NOT_PROVISIONED');if(Object.keys(shipped).length)assert.deepEqual(JSON.parse(JSON.stringify(selected.trustedKeys)),JSON.parse(JSON.stringify(shipped)));
 f.save({schema:1,mode:'pilot',pilotProfileIds:['p1'],trustedKeys:{anything:{d:'private'}}});const rejected=f.load(PRODUCTION_ORIGIN);assert.equal(rejected.mode,'observation');assert.deepEqual(rejected.trustedKeys,{});assert.ok(!JSON.stringify(rejected).includes('private'));
});

test('owner profile selection reuses prepared staging pins and rejects arbitrary keys, unknown slots or missing acknowledgement',t=>{
 const {saveScriptRolloutSelection}=require('../script_rollout'),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-select-'));
 t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 fs.writeFileSync(path.join(dataDir,'script_rollout_v1.json'),JSON.stringify({schema:1,mode:'observation',stagingPublicKeys:{stage:keys.publicKey.export({format:'jwk'})}}));
 const args={dataDir,serviceOrigin:STAGING_ORIGIN,profiles:[{id:'p1'}],mode:'pilot',pilotProfileIds:['p1'],acknowledgePilot:true};
 assert.throws(()=>saveScriptRolloutSelection({...args,acknowledgePilot:false}),/ACKNOWLEDGEMENT/);
 assert.throws(()=>saveScriptRolloutSelection({...args,pilotProfileIds:['p2']}),/UNKNOWN_PILOT/);
 const selected=saveScriptRolloutSelection(args);assert.equal(selected.mode,'pilot');assert.deepEqual(selected.pilotProfileIds,['p1']);
 const stopped=saveScriptRolloutSelection({...args,mode:'observation',pilotProfileIds:[]});assert.equal(stopped.mode,'observation');assert.deepEqual(loadScriptRollout({dataDir,serviceOrigin:STAGING_ORIGIN}).pilotProfileIds,[]);assert.equal(saveScriptRolloutSelection(args).mode,'pilot');
});
