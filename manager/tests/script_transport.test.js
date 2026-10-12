'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os'),{EventEmitter}=require('events'),{PassThrough}=require('stream');
test('real JSON client accepts bounded grouped chunks with split Thai UTF8 while financial responses remain bounded',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-payload-transport-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dataDir,'aetheria_service_account.json'),JSON.stringify({origin:'https://transport.test',accountId:'test',token:'a'.repeat(64)}));
 const source='// ภาษาไทย\n'.repeat(7000),payload={success:true,chunks:[{ordinal:0,source}],version:'4.37.0',hash:'a'.repeat(64)},bytes=Buffer.from(JSON.stringify(payload));
 const fakeHttps={request(url,options,callback){
  const req=new EventEmitter();req.destroy=err=>req.emit('error',err);req.end=()=>process.nextTick(()=>{
   const response=new PassThrough();response.statusCode=200;callback(response);
   // Chunks deliberately end inside three-byte Thai letters.
   for(let at=0;at<bytes.length;at+=65533)response.write(bytes.subarray(at,at+65533));response.end();
  });return req;
 }};
 const module={exports:{}};
 new Function('require','module','exports',fs.readFileSync(path.join(__dirname,'../human_check_solver.js'),'utf8'))(name=>name==='https'?fakeHttps:name==='child_process'?{execSync:()=>''}:name.startsWith('.')?require(path.join(__dirname,'..',name)):require(name),module,module.exports);
 const client=module.exports.createHumanCheckSolver({dataDir,serviceUrl:'https://transport.test',localCatalogSeed:false});
 const received=await client.serviceRequest('/v1/aetheria/script/payload-chunk',{leaseId:'test',runtimeNonce:'test',ordinal:0,count:3});assert.equal(received.chunks[0].source,source);assert.ok(bytes.length>131072);assert.ok(!received.chunks[0].source.includes('\ufffd'));
 await assert.rejects(client.serviceRequest('/v1/aetheria/usage/statement'),/too large/);
});
