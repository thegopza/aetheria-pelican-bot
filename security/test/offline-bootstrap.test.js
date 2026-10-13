'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
async function fixture(){
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const publicKey=pair.publicKey.export({format:'jwk'});
 let clock=Date.now();const intervals=[];
 const window={crypto:crypto.webcrypto,setTimeout:fn=>fn,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){}};
 const context=vm.createContext({window,TextEncoder,TextDecoder,atob,Date:{now:()=>clock}});
 const source=fs.readFileSync(path.join(__dirname,'../offline_bootstrap.js'),'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}',JSON.stringify({test:publicKey}));
 vm.runInContext(source,context);
 const payload='runtime.assert(); window.loaded=(window.loaded||0)+1; window.action=()=>++window.called; window.called=0;';
 const sign=(body=payload,overrides={})=>{const claims=Buffer.from(JSON.stringify({protocol:2,mode:'friends-offline',version:'4.38.0',payloadHash:crypto.createHash('sha256').update(body).digest('hex'),size:Buffer.byteLength(body),issuedAt:clock,...overrides})).toString('base64url');return{keyId:'test',claims,signature:crypto.sign('sha256',Buffer.from('PmheeAether.offline-release.v1\n'+claims),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};};
 return{window,api:window.__pmScriptBootstrap,intervals,payload,sign,reload:()=>vm.runInContext(source,context),advance:ms=>clock+=ms};
}
test('offline release verifies once and remains active offline, no lease watchdog or duplicate runtime',async()=>{
 const f=await fixture();const envelope=f.sign();const results=await Promise.all([f.api.accept({envelope,payload:f.payload}),f.api.accept({envelope,payload:f.payload})]);
 assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.window.loaded,1);assert.equal(f.intervals.length,0);
 f.advance(365*86400000);assert.equal(f.window.action(),1);assert.equal(f.api.status().phase,'ready');assert.equal(f.api.status().protocol,2);f.reload();assert.equal(f.window.loaded,1);
});
test('signature, size, hash, mode and legacy runtime are rejected before executing source',async()=>{
 for(const kind of ['signature','size','hash','mode','legacy']){
  const f=await fixture();let envelope=f.sign(f.payload,kind==='size'?{size:2}:kind==='mode'?{mode:'other'}:{});
  if(kind==='signature')envelope.signature=Buffer.alloc(64).toString('base64url');if(kind==='legacy')f.window.__pelicanBotVersion='4.36.2';
  assert.equal((await f.api.accept({envelope,payload:f.payload+(kind==='hash'?' ': '')})).success,false,kind);assert.equal(f.window.loaded,undefined);
 }
});
test('partial initialization can never be retried into duplicate timers',async()=>{
 const f=await fixture();const body='window.loaded=1; throw Error("partial")';assert.equal((await f.api.accept({envelope:f.sign(body),payload:body})).success,false);
 assert.equal(f.api.status().phase,'failed');assert.equal((await f.api.accept({envelope:f.sign(),payload:f.payload})).success,false);
});
test('offline builder pins signing identity, keeps output private and signs exact artifact metadata',()=>{
 const {buildOffline}=require('../build-offline-payload');const os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-offline-builder-'));
 const pair=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const publicKeys={test:pair.publicKey.export({format:'jwk'})};
 const sourcePath=path.join(dir,'input.js');fs.writeFileSync(sourcePath,"// @version      4.38.0\nconst PELICAN_BOT_VERSION = '4.38.0'; window.sample=()=>42;");
 const options={sourcePath,outputDir:path.join(dir,'out'),publicKeys,signingJwk:pair.privateKey.export({format:'jwk'}),keyId:'test'};
 assert.throws(()=>buildOffline({...options,outputDir:path.join(__dirname,'bad-output')}),/PRIVATE_OUTPUT_REQUIRED/);
 const other=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});assert.throws(()=>buildOffline({...options,signingJwk:other.privateKey.export({format:'jwk'})}),/PIN_MISMATCH/);
 const result=buildOffline(options);const claims=JSON.parse(Buffer.from(result.release.claims,'base64url'));const payload=fs.readFileSync(path.join(options.outputDir,'payload.js'));
 assert.equal(claims.size,payload.length);assert.equal(claims.payloadHash,crypto.createHash('sha256').update(payload).digest('hex'));
 assert.equal(crypto.verify('sha256',Buffer.from('PmheeAether.offline-release.v1\n'+result.release.claims),{key:pair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(result.release.signature,'base64url')),true);
 assert.equal(fs.readFileSync(path.join(options.outputDir,'bootstrap.js'),'utf8').includes(options.signingJwk.d),false);
});
