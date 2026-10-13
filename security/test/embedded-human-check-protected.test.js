'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {webcrypto,createHash}=require('node:crypto');
const {instrument}=require('../build-private-payload');

test('real signed protected payload answers locally after expiry; automation denied; durable events ACK works',async()=>{
  // CI uses the public compatibility source; release validation supplies private path externally.
  const privatePath=process.env.PMHEE_HOTFIX_PRIVATE_SOURCE;
  const original=fs.readFileSync(privatePath || path.join(__dirname,'../../bot.js'),'utf8');
  const version=original.match(/const PELICAN_BOT_VERSION = '([^']+)'/)[1];
  assert.equal(version,privatePath ? '4.37.2' : '4.36.3');
  const payload=instrument(original).source;
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.aetheria-online.in.th/play',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  try {
    const win=dom.window,intervals=[],timeouts=[];
    let clock=1800000000000,apiCalls=0,clicks=0;
    win.Date.now=()=>clock;
    win.__pmProfileId='profile_fixture';
    win.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};
    win.clearInterval=()=>{};
    win.setTimeout=(fn,ms)=>{timeouts.push({fn,ms});return timeouts.length;};
    win.clearTimeout=()=>{};
    win.fetch=()=>{apiCalls++;return Promise.resolve({ok:false,json:async()=>({})});};
    Object.defineProperty(win,'crypto',{value:webcrypto});
    win.TextEncoder=TextEncoder;win.TextDecoder=TextDecoder;
    win.eval(fs.readFileSync(path.join(__dirname,'../bootstrap.js'),'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}',JSON.stringify({fixture:jwk})));
    const api=win.__pmScriptBootstrap;
    const claims=Buffer.from(JSON.stringify({protocol:1,accountId:'fixture-account',deviceId:'fixture-device',slotId:'fixture-slot',leaseId:'fixture-lease',managerInstanceId:'fixture-manager',runtimeNonce:api.status().runtimeNonce,bindingVersion:1,version,payloadHash:createHash('sha256').update(payload).digest('hex'),issuedAt:clock,expiresAt:clock+60000,graceUntil:clock+120000})).toString('base64url');
    const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode('PmheeAether.ticket.v1\n'+claims))).toString('base64url');
    const admitted=await api.accept({ticket:{keyId:'fixture',claims,signature},payload});
    assert.equal(admitted.success,true,admitted.code);
    assert.equal(win.__pmEmbeddedHumanCheckSolver,true);
    clock+=121000;
    intervals.at(-1).fn();
    assert.equal(api.status().phase,'expired');
    assert.notEqual(win.__isBotRunning,true);
    assert.throws(()=>win.startMasterBot(),/SCRIPT_AUTHORIZATION_REQUIRED/);
    assert.throws(()=>win.__applyScriptPlan({id:'denied'},true),/SCRIPT_AUTHORIZATION_REQUIRED/);
    const hc=win.document.createElement('div');hc.className='human-check';
    const prompt=win.document.createElement('div');prompt.className='human-check-prompt';prompt.innerText='เลือก Red Potion';hc.append(prompt);
    for(let i=0;i<2;i++){const b=win.document.createElement('button');b.className='human-check-pick';b.onclick=()=>{clicks++;b.disabled=true;};hc.append(b);}
    win.document.body.append(hc);
    win.__latestHumanCheck={id:'fixture-question',prompt:'เลือก Red Potion',items:[90301,90304],timestamp:clock};
    win.__pmHumanCheckSolverConfig={autoAnswer:true,answerDelayMs:800};
    const beforeNetwork=apiCalls;
    const watcher=intervals.find(x=>x.ms===1000 && /tickEmbeddedHumanCheck/.test(String(x.fn)));
    assert.ok(watcher,'Native Humancheck watcher is present');
    watcher.fn();
    const answer= timeouts.filter(x=>x.ms===800).at(-1);
    assert.ok(answer,'Answer timeout schedules after lease expiry');
    clock+=800; answer.fn();
    assert.equal(clicks,1);
    assert.equal(apiCalls,beforeNetwork,'Answer uses no network');
    const events=win.__pmGetHumanCheckEvents();
    assert.equal(events.length,1);assert.equal(events[0].charged,0);assert.equal(events[0].profileId,'profile_fixture');
    assert.ok(win.localStorage.getItem('pelican_human_check_events_v1'));
    watcher.fn();assert.equal(clicks,1);
    assert.equal(win.__pmAckHumanCheckEvents([events[0].eventId]),true);
    assert.equal(win.__pmGetHumanCheckEvents().length,0);
    assert.equal(win.__isBotRunning,false);
  } finally {dom.window.close();}
});
