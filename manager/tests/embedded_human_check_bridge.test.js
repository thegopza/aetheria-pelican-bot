'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const managerDir=process.env.PMHEE_HC_MANAGER_DIR || path.resolve(__dirname,'..');
const {createEmbeddedHumanCheckBridge}=require(path.join(managerDir,'embedded_human_check_bridge'));
function realStats(dir){
  const source=fs.readFileSync(path.join(managerDir,'server.js'),'utf8');
  if(source.includes('return captchaStats.record')){
    const {createCaptchaStats}=require(path.join(managerDir,'captcha_stats'));
    const stats=createCaptchaStats({file:path.join(dir,'data/captcha_stats.json'),log:{warn(){}}});
    return {recordCaptchaSolved:(id,event)=>stats.record(id,event)};
  }
  const dateFn=source.slice(source.indexOf('function getThaiDateKey('),source.indexOf('function bootstrapDailyFromRequests('));
  const stats=source.slice(source.indexOf('function getCaptchaStats()'),source.indexOf('const discordService ='));
  const context=vm.createContext({fs,path,Date,JSON,Math,Number,Object,console:{warn(){}},__dirname:dir,CAPTCHA_STATS_FILE:path.join(dir,'data/captcha_stats.json'),bootstrapDailyFromRequests:()=>({})});
  vm.runInContext(dateFn+stats,context);return context;
}
function fixture(t,{fallback=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hc-bridge-fixture-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const stats=realStats(dir),profile={id:'p1',debugPort:49991},event={eventId:'fixture-event',timestamp:Date.parse('2026-10-12T23:55:00+07:00'),charged:0};
  let events=[event],failAck=true,recordFailure=false;
  const window={__pmEmbeddedHumanCheckSolver:true};
  const saved=new Map(),localStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)||null};
  if(fallback){Object.defineProperty(window,'__pmLocalHumanCheckEvents',{get:()=>events});window.__pmAckLocalHumanCheckEvents=ids=>{events=events.filter(e=>!ids.includes(e.eventId));return true;};}
  else{window.__pmGetHumanCheckEvents=()=>events;window.__pmAckHumanCheckEvents=ids=>{events=events.filter(e=>!ids.includes(e.eventId));return true;};}
  const calls=[];
  const bridge=createEmbeddedHumanCheckBridge({getConfig:()=>({autoAnswer:false,answerDelayMs:1500}),recordCaptchaSolved:(id,e)=>recordFailure?null:stats.recordCaptchaSolved(id,e),evalProfilePort:async(port,code)=>{
    assert.equal(port,profile.debugPort);calls.push(code);
    if(code.includes('const ids=')&&failAck)return {success:false};
    return {success:true,result:vm.runInNewContext(code,{window,localStorage})};
  }});
  return {dir,stats,profile,bridge,window,calls,saved,setAckFailure:v=>{failAck=v;},setRecordFailure:v=>{recordFailure=v;},events:()=>events,read:()=>JSON.parse(fs.readFileSync(path.join(dir,'data/captcha_stats.json'),'utf8'))};
}
test('lost ACK replay counts once across durable stats reload; prefs and Discord marker set',async t=>{
  const f=fixture(t),state={humanCheck:{active:true}};
  assert.equal(await f.bridge.collect(f.profile,state),true);
  assert.equal(state.humanCheck.embeddedSolver,true);assert.equal(f.window.__pmHumanCheckSolverConfig.autoAnswer,false);assert.equal(f.window.__pmHumanCheckSolverConfig.answerDelayMs,1500);
  assert.equal(JSON.parse(f.saved.get('pelican_embedded_human_check_cfg')).autoAnswer,false);
  assert.equal(f.read().totalSolved,17);assert.equal(f.events().length,1);
  assert.equal(await f.bridge.collect(f.profile,state),true);assert.equal(f.read().totalSolved,17);
  const restarted=realStats(f.dir);assert.ok(restarted.recordCaptchaSolved('p1',f.events()[0]));assert.equal(f.read().totalSolved,17);
  f.setAckFailure(false);await f.bridge.collect(f.profile,state);assert.equal(f.events().length,0);assert.equal(f.read().totalSolved,17);
  assert.equal(f.read().daily['2026-10-12'].byProfile.p1,1);assert.ok(f.read().embeddedEventIds['fixture-event']);
});
test('storage failure never ACKs; retry succeeds; old candidate event API compatible',async t=>{
  const f=fixture(t,{fallback:true});f.setAckFailure(false);f.setRecordFailure(true);
  await f.bridge.collect(f.profile,{});assert.equal(f.events().length,1);assert.equal(f.calls.some(code=>code.includes('const ids=')),false);
  f.setRecordFailure(false);await f.bridge.collect(f.profile,{});assert.equal(f.events().length,0);assert.equal(f.read().totalSolved,17);
});
test('simultaneous polling same profile does not collect duplicate concurrently',async()=>{
  let unblock,calls=0;
  const bridge=createEmbeddedHumanCheckBridge({recordCaptchaSolved:()=>true,evalProfilePort:()=>{calls++;return new Promise(resolve=>{unblock=resolve;});}});
  const first=bridge.collect({id:'p',debugPort:49991},{});
  assert.equal(await bridge.collect({id:'p',debugPort:49991},{}),false);assert.equal(calls,1);
  unblock({success:true,result:{enabled:true,events:[]}});assert.equal(await first,true);
});
