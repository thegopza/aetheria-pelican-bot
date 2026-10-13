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
  const hv=(source.match(/\/\/ @version\s+(\d+\.\d+\.\d+)/)||[])[1], cv=(source.match(/const PELICAN_BOT_VERSION = '(\d+\.\d+\.\d+)'/)||[])[1];
  assert.ok(hv&&cv,'version markers missing'); assert.equal(hv,cv);
  assert.ok(source.indexOf('    // END EMBEDDED HUMAN CHECK HOTFIX') < source.indexOf('    // AUTO JOB CHANGE ENGINE'));
});

test('embedded bot solves image board with coordinates and sends room packet', async () => {
  const f = fixture();
  const roomMessages = [];
  const room = { send: (msg, data) => roomMessages.push({ msg, data }) };
  f.window.getColyseusRoom = () => room;
  f.window.__latestHumanCheck = {
    id: 'uuid-board-1',
    prompt: 'เลือก Red Potion',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 480,
    height: 330,
    timestamp: Date.now()
  };
  f.setPrompt('เลือก Red Potion');

  const boardClicks = [];
  const boardEl = {
    classList: { contains: c => c === 'human-check-board' },
    tagName: 'DIV',
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 330 }),
    dispatchEvent: ev => boardClicks.push(ev),
    querySelector: () => null
  };
  const hcWithBoard = {
    querySelector: sel => sel === '.human-check-board' ? boardEl : (sel === '.human-check-prompt' ? { innerText: 'เลือก Red Potion' } : null),
    querySelectorAll: () => []
  };
  vm.runInContext('document.querySelector = (sel) => sel === ".human-check" ? hcBoard : null', vm.createContext({ ...f.context, hcBoard: hcWithBoard }));

  f.window.__mockImageBoardMatcher = () => ({
    x: 112,
    y: 92,
    confidence: 98,
    matchedName: 'Red Potion'
  });

  f.tick();
  // Allow async board promise to settle
  await new Promise(r => setTimeout(r, 20));
  f.run();

  assert.equal(roomMessages.length, 1);
  assert.equal(roomMessages[0].msg, 'human_check_answer');
  assert.equal(roomMessages[0].data.id, 'uuid-board-1');
  assert.equal(roomMessages[0].data.x, 112);
  assert.equal(roomMessages[0].data.y, 92);

  const events = f.window.__pmGetHumanCheckEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].x, 112);
  assert.equal(events[0].y, 92);
  assert.equal(events[0].matchedName, 'Red Potion');
  assert.equal(events[0].confidence, 98);
});

test('failsafe triggers stop-all if challenge format is completely unknown', () => {
  const fetchCalls = [];
  const f = fixture();
  f.context.fetch = url => { fetchCalls.push(url); return Promise.resolve(); };
  f.window.__latestHumanCheck = {
    id: 'uuid-unknown-format',
    prompt: 'ตอบคำถามแปลกๆ',
    items: null,
    image: null,
    timestamp: Date.now()
  };
  f.setPrompt('ตอบคำถามแปลกๆ');
  const emptyHc = {
    querySelector: sel => sel === '.human-check-prompt' ? { innerText: 'ตอบคำถามแปลกๆ' } : null,
    querySelectorAll: () => []
  };
  vm.runInContext('document.querySelector = () => emptyHc', vm.createContext({ ...f.context, emptyHc }));

  f.tick();
  assert.ok(fetchCalls.some(url => url.includes('/api/stop-all')), 'Should trigger /api/stop-all for unknown format');
});

test('embedded bot solves frame-based prompt (กดรูปด้านล่างที่เหมือนกับรูปในกรอบ)', async () => {
  const f = fixture();
  const roomMessages = [];
  const room = { send: (msg, data) => roomMessages.push({ msg, data }) };
  f.window.getColyseusRoom = () => room;

  const bw = 480, bh = 330;
  const boardBuffer = Buffer.alloc(bw * bh * 4, 30);
  // Golden frame at x: 200..280, y: 50..130
  const fx = 200, fy = 50, fw = 80, fh = 80;
  for (let y = fy; y <= fy + fh; y++) {
    for (let x = fx; x <= fx + fw; x++) {
      if (x === fx || x === fx + fw || y === fy || y === fy + fh) {
        const idx = (y * bw + x) * 4;
        boardBuffer[idx] = 210; boardBuffer[idx + 1] = 180; boardBuffer[idx + 2] = 60; boardBuffer[idx + 3] = 255;
      }
    }
  }
  // Target item in frame at (240, 90)
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const idx = ((90 + dy) * bw + (240 + dx)) * 4;
      boardBuffer[idx] = 240; boardBuffer[idx + 1] = 40; boardBuffer[idx + 2] = 40; boardBuffer[idx + 3] = 255;
    }
  }
  // Matching item at bottom at (165, 235)
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const idx = ((235 + dy) * bw + (165 + dx)) * 4;
      boardBuffer[idx] = 240; boardBuffer[idx + 1] = 40; boardBuffer[idx + 2] = 40; boardBuffer[idx + 3] = 255;
    }
  }

  const promptText = 'กดรูปด้านล่างที่เหมือนกับรูปในกรอบ';
  f.window.__latestHumanCheck = {
    id: 'uuid-frame-challenge',
    prompt: promptText,
    image: 'data:image/png;base64,synthetic',
    width: 480,
    height: 330,
    timestamp: Date.now()
  };
  f.setPrompt(promptText);

  // Mock canvas getImageData in context
  const mockCtx = {
    drawImage: () => {},
    getImageData: () => ({ width: bw, height: bh, data: boardBuffer })
  };
  const mockCanvas = {
    getContext: () => mockCtx,
    width: bw,
    height: bh
  };

  const boardClicks = [];
  const imgEl = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 330 }),
    dispatchEvent: ev => boardClicks.push(ev),
    click: () => boardClicks.push({ type: 'click' })
  };
  const boardEl = {
    classList: { contains: c => c === 'human-check-board' },
    tagName: 'DIV',
    querySelector: sel => sel === 'img' ? imgEl : null,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 330 }),
    dispatchEvent: ev => boardClicks.push(ev),
    click: () => boardClicks.push({ type: 'click' })
  };
  const hcWithBoard = {
    querySelector: sel => sel === '.human-check-board' ? boardEl : (sel === '.human-check-prompt' ? { innerText: promptText } : null),
    querySelectorAll: () => []
  };

  vm.runInContext('document.querySelector = (sel) => sel === ".human-check" ? hcBoard : null', vm.createContext({ ...f.context, hcBoard: hcWithBoard }));
  vm.runInContext('document.createElement = (tag) => tag === "canvas" ? mockCanvas : null', vm.createContext({ ...f.context, mockCanvas }));
  f.context.Image = class {
    constructor() {
      setTimeout(() => this.onload && this.onload(), 1);
    }
  };

  f.tick();
  await new Promise(r => setTimeout(r, 40));
  f.run();

  assert.equal(roomMessages.length, 1, 'should send 1 room packet');
  assert.equal(roomMessages[0].msg, 'human_check_answer');
  assert.equal(roomMessages[0].data.id, 'uuid-frame-challenge');
  assert.equal(roomMessages[0].data.x, 165);
  assert.equal(roomMessages[0].data.y, 235);
  assert.ok(boardClicks.length > 0, 'should dispatch click to img element');
});


