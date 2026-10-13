'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const source = fs.readFileSync(path.resolve(__dirname,'../../bot.js'),'utf8');
const code = source.slice(source.indexOf('    // BEGIN EMBEDDED HUMAN CHECK HOTFIX'), source.indexOf('    // END EMBEDDED HUMAN CHECK HOTFIX'));
function fixture(saved = new Map(), {withLiveConfig=true} = {}) {
  const timers = [], clicks = [];
  const buttons = [90301,90304].map((id,index) => ({disabled:false,querySelector:()=>null,click:()=>clicks.push(index)}));
  let prompt = 'เลือก Red Potion';
  let hc = {querySelector:()=>({innerText:prompt}),querySelectorAll:()=>buttons};
  const window = {__autoHumanCheckEnabled:true,__pmProfileId:'profile_test',__latestHumanCheck:{id:'uuid-check',prompt,items:[90301,90304],timestamp:Date.now()},getLiveCharacterData:()=>({name:'Test Bard'}),crypto:{randomUUID:()=> 'test-event'},__pmHumanCheckSolverConfig:{answerDelayMs:800}};
  if(!withLiveConfig)delete window.__pmHumanCheckSolverConfig;
  const context = vm.createContext({window, document:{querySelector:()=>hc},localStorage:{getItem:k=>saved.get(k) || null,setItem:(k,v)=>saved.set(k,v)},setTimeout:fn=>timers.push(fn),Map,Set,Date,Math,JSON,Number,String,Array});
  vm.runInContext(code,context);
  return {window,context,timers,clicks,saved,tick:()=>vm.runInContext('tickEmbeddedHumanCheck()',context),run:()=>{while(timers.length)timers.shift()();},replaceDom:()=>{hc={...hc};},setPrompt:p=>{prompt=p;},buttons};
}
test('embedded real bot solves offline with zero/negative wallet and records durable scoped event',()=>{
  const f=fixture(); f.window.__pmPoints=-500; f.tick(); f.run();
  assert.deepEqual(f.clicks,[0]);
  const events=f.window.__pmGetHumanCheckEvents(); assert.equal(events.length,1); assert.equal(events[0].charged,0); assert.equal(events[0].character,'Test Bard'); assert.equal(events[0].profileId,'profile_test');
  f.tick(); f.run(); assert.equal(f.clicks.length,1);
  const reload=fixture(f.saved); reload.tick(); reload.run(); assert.equal(reload.clicks.length,0); assert.equal(reload.window.__pmGetHumanCheckEvents().length,1);
  assert.equal(reload.window.__pmAckHumanCheckEvents(['other']),true); assert.equal(reload.window.__pmGetHumanCheckEvents().length,1);
  assert.equal(reload.window.__pmAckHumanCheckEvents(['test-event']),true); assert.equal(reload.window.__pmGetHumanCheckEvents().length,0);
});
test('unknown and ambiguous questions remain manual',()=>{
  const f=fixture(); f.window.__latestHumanCheck.items=[90301,90301]; f.tick(); f.run(); assert.equal(f.clicks.length,0);
  f.window.__latestHumanCheck.items=[999999,999998]; f.tick(); f.run(); assert.equal(f.clicks.length,0);
});
test('stale question/DOM/replaced packet cannot click',()=>{
  const f=fixture(); f.tick(); f.replaceDom(); f.run(); assert.equal(f.clicks.length,0);
  const g=fixture(); g.tick(); g.setPrompt('เลือก Blue Potion'); g.run(); assert.equal(g.clicks.length,0);
  const h=fixture(); h.tick(); h.window.__latestHumanCheck={...h.window.__latestHumanCheck}; h.run(); assert.equal(h.clicks.length,0);
});
test('auto-answer switch and pending delay cancellation are respected',()=>{
  const f=fixture(); f.window.__pmHumanCheckSolverConfig.autoAnswer=false; f.tick(); f.run(); assert.equal(f.clicks.length,0);
  f.window.__pmHumanCheckSolverConfig.autoAnswer=true; f.tick(); f.window.__autoHumanCheckEnabled=false; f.run(); assert.equal(f.clicks.length,0);
});
test('remembered disabled preference restores before first answer; live config wins',()=>{
  const saved=new Map([['pelican_embedded_human_check_cfg',JSON.stringify({autoAnswer:false,answerDelayMs:1500})]]);
  const f=fixture(saved,{withLiveConfig:false});
  assert.equal(f.window.__pmHumanCheckSolverConfig.autoAnswer,false);
  assert.equal(f.window.__pmHumanCheckSolverConfig.answerDelayMs,1500);
  f.tick();f.run();assert.equal(f.clicks.length,0);
  const live=fixture(saved);assert.equal(live.window.__pmHumanCheckSolverConfig.autoAnswer,undefined);
  live.tick();live.run();assert.equal(live.clicks.length,1);
});
test('Manager/manual click before delayed embedded answer suppresses duplicate',()=>{
  const f=fixture(); f.tick(); f.window.__lastHumanCheckSolved={timestamp:Date.now()+1}; f.run(); assert.equal(f.clicks.length,0);
  const g=fixture(); g.tick(); g.buttons[0].disabled=true; g.run(); assert.equal(g.clicks.length,0);
});
test('uncertain click is never retried and ACK failure keeps event',()=>{
  const f=fixture(); let attempts=0; f.buttons[0].click=()=>{attempts++; throw Error('uncertain');}; f.tick(); f.run(); f.tick(); f.run(); assert.equal(attempts,1); assert.equal(f.window.__pmGetHumanCheckEvents().length,0);
  const g=fixture(); g.tick(); g.run(); vm.runInContext('localStorage.setItem=()=>{throw Error("disk full");}',g.context); assert.equal(g.window.__pmAckHumanCheckEvents(['test-event']),false); assert.equal(g.window.__pmGetHumanCheckEvents().length,1);
});
test('hotfix stays inside main IIFE and versions match',()=>{
  assert.match(source,/\/\/ @version\s+4\.36\.3/); assert.match(source,/const PELICAN_BOT_VERSION = '4\.36\.3'/);
  assert.ok(source.indexOf('    // END EMBEDDED HUMAN CHECK HOTFIX') < source.indexOf('    // AUTO JOB CHANGE ENGINE'));
});
