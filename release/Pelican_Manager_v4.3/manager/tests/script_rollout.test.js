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
test('production has no editable trust-anchor overrides and unprovisioned release fails observation',t=>{
 const f=fixture(t);f.save({schema:1,mode:'pilot',pilotProfileIds:['p1']});assert.equal(f.load(PRODUCTION_ORIGIN).configurationCode,'RELEASE_PUBLIC_PINS_NOT_PROVISIONED');
 f.save({schema:1,mode:'pilot',pilotProfileIds:['p1'],trustedKeys:{anything:{d:'private'}}});const rejected=f.load(PRODUCTION_ORIGIN);assert.equal(rejected.mode,'observation');assert.deepEqual(rejected.trustedKeys,{});assert.ok(!JSON.stringify(rejected).includes('private'));
});
