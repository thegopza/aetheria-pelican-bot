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

test('embedded bot retries up to 3 attempts when triesLeft decrements on same image or new image arrives', async () => {
  const f = fixture();
  const roomMessages = [];
  const room = { send: (msg, data) => roomMessages.push({ msg, data }) };
  f.window.getColyseusRoom = () => room;

  let currentMeta = 'เวลา 89 วิ · ตอบผิดได้อีก 3 ครั้ง';
  let currentSrc = 'data:image/png;base64,' + 'A'.repeat(120);
  const promptText = 'กดรูปด้านล่างที่เหมือนกับรูปในกรอบ';
  f.window.__latestHumanCheck = {
    id: 'uuid-retry-3',
    prompt: promptText,
    image: currentSrc,
    width: 480,
    height: 330,
    timestamp: Date.now()
  };
  f.setPrompt(promptText);

  const imgEl = {
    getAttribute: name => name === 'src' ? currentSrc : null,
    get src() { return currentSrc; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 330 }),
    dispatchEvent: () => {},
    click: () => {}
  };
  const boardEl = {
    classList: { contains: c => c === 'human-check-board' },
    tagName: 'DIV',
    querySelector: sel => sel === 'img' ? imgEl : null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 330 }),
    dispatchEvent: () => {},
    click: () => {}
  };
  const hcWithBoard = {
    querySelector: sel => {
      if (sel === '.human-check-board') return boardEl;
      if (sel === '.human-check-prompt') return { innerText: promptText };
      if (sel === '.human-check-meta') return { innerText: currentMeta };
      return null;
    },
    querySelectorAll: () => []
  };
  vm.runInContext('document.querySelector = (sel) => sel === ".human-check" ? hcBoard : null', vm.createContext({ ...f.context, hcBoard: hcWithBoard }));

  const slotCoords = { 1: { x: 68, y: 240 }, 2: { x: 185, y: 240 }, 3: { x: 295, y: 240 }, 4: { x: 405, y: 240 } };
  let pickedSlots = [];
  f.window.__mockImageBoardMatcher = (snap) => {
    // Pick first untried slot in order [3, 2, 1, 4] based on snap.triesLeft or internal state
    const order = [3, 2, 1, 4];
    const slot = order[pickedSlots.length] || 3;
    pickedSlots.push({ slot, triesLeft: snap.triesLeft, imageSig: snap.imageSig });
    return { x: slotCoords[slot].x, y: slotCoords[slot].y, slot, confidence: 90, matchedName: 'รูปในกรอบ (ช่องที่ ' + slot + ')' };
  };

  // Attempt 1 (triesLeft = 3)
  f.tick();
  await new Promise(r => setTimeout(r, 20));
  f.run();
  assert.equal(roomMessages.length, 1);
  assert.equal(roomMessages[0].data.x, 295);

  // Attempt 2 on SAME image (triesLeft decrements to 2)
  currentMeta = 'เวลา 85 วิ · ตอบผิดได้อีก 2 ครั้ง';
  f.tick();
  await new Promise(r => setTimeout(r, 20));
  f.run();
  assert.equal(roomMessages.length, 2);
  assert.equal(roomMessages[1].data.x, 185);

  // Attempt 3 on NEW image (triesLeft decrements to 1, image changes)
  currentMeta = 'เวลา 80 วิ · ตอบผิดได้อีก 1 ครั้ง';
  currentSrc = 'data:image/png;base64,' + 'B'.repeat(120);
  f.window.__latestHumanCheck.image = currentSrc;
  f.tick();
  await new Promise(r => setTimeout(r, 20));
  f.run();
  assert.equal(roomMessages.length, 3);
  assert.equal(roomMessages[2].data.x, 68);
});

test('applyPelicanSettings configures all 3 settings tabs once on initial character load', async () => {
  const botSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8');
  const startIdx = botSrc.indexOf('function writeOptimalGameSettingsToStorage()');
  const endMarker = '// Plan Script loop (every 4 s)';
  const endIdx = botSrc.indexOf(endMarker, startIdx);
  assert.ok(startIdx > 0 && endIdx > startIdx, 'Could not locate applyPelicanSettings block in bot.js');
  const codeBlock = botSrc.slice(startIdx, endIdx);

  const storage = new Map();
  const sentPackets = [];
  let settingsClosed = false;
  const clickedTabs = [];
  const toggledSwitches = [];
  const selectedRadios = [];

  const makeSwitchRow = (title, initialChecked) => {
    const cb = {
      checked: initialChecked,
      click() {
        this.checked = !this.checked;
        toggledSwitches.push({ title, checked: this.checked });
      }
    };
    return {
      innerText: title,
      textContent: title,
      querySelector: (s) => s === 'input[type="checkbox"]' ? cb : null
    };
  };

  const makeRadioBlock = (title, options, activeIdx) => {
    const btns = options.map((opt, idx) => ({
      innerText: opt,
      textContent: opt,
      _active: idx === activeIdx,
      getAttribute(attr) { return attr === 'aria-checked' ? (this._active ? 'true' : 'false') : null; },
      classList: { contains(c) { return c === 'active' ? this._active : false; } },
      click() {
        btns.forEach(b => { b._active = false; });
        this._active = true;
        selectedRadios.push({ title, option: opt });
      }
    }));
    return {
      innerText: title,
      querySelector: (s) => s === '.set-text b' ? { textContent: title } : null,
      querySelectorAll: () => btns
    };
  };

  const navBtns = ['การแสดงผล', 'กราฟิกและความลื่น', 'ตัวละคร'].map((t, i) => ({
    innerText: t,
    textContent: t,
    _on: i === 0,
    classList: { contains(c) { return c === 'on' ? this._on : false; } },
    click() {
      navBtns.forEach(b => { b._on = false; });
      this._on = true;
      clickedTabs.push(t);
    }
  }));

  const switchRows = [
    makeSwitchRow('แสดงประกาศบนจอ', true),
    makeSwitchRow('เปิดหน้าข่าวสารเองเมื่อเข้าเกม', true),
    makeSwitchRow('แสดงหลอด HP มอนสเตอร์ทุกตัว', true),
    makeSwitchRow('หมวกขยับตามจังหวะเดิน', true),
    makeSwitchRow('ประกายวิบที่หมวก', true),
    makeSwitchRow('ให้ผู้เล่นอื่นตรวจสอบอุปกรณ์และสเตตัสของฉันได้', true)
  ];

  const radioBlocks = [
    makeRadioBlock('ตัวเลขดาเมจ', ['ปกติ', 'ย่อ', 'ปิด'], 0),
    makeRadioBlock('ชื่อผู้เล่นอื่น', ['แสดงตลอด', 'ซ่อน', 'ชี้เมาส์'], 0),
    makeRadioBlock('ความคมชัด', ['ลื่นสุด', 'ปกติ', 'ชัดสุด'], 1),
    makeRadioBlock('ผู้เล่นอื่นที่แสดงบนจอ', ['ไม่จำกัด', '50 คน', '30 คน', '20 คน', '10 คน'], 0),
    makeRadioBlock('เอฟเฟกต์สกิลและการโจมตี', ['แสดงทั้งหมด', 'เฉพาะตัวเอง', 'ปิด'], 0),
    makeRadioBlock('เฟรมเรต', ['60 FPS', '30 FPS', '20 FPS'], 0),
    makeRadioBlock('พื้นแผนที่', ['พิกเซล', 'ภาพวาด'], 0)
  ];

  let settingsWinOpen = false;
  const settingsWin = {
    querySelectorAll(sel) {
      if (sel === '.set-nav button') return navBtns;
      if (sel.includes('label.set-row')) return switchRows;
      if (sel === '.set-row.set-block') return radioBlocks;
      return [];
    },
    querySelector(sel) {
      if (sel === '.win-close') return { click() { settingsClosed = true; settingsWinOpen = false; } };
      return null;
    }
  };

  const sandboxWindow = {
    __autoMuteDisplayEnabled: true,
    __latestCharacterData: { name: 'TesterHero', inspectHidden: false },
    getCharacterName: () => 'TesterHero',
    getLiveCharacterData: () => sandboxWindow.__latestCharacterData,
    getGameRoom: () => ({
      send(type, payload) { sentPackets.push({ type, payload }); }
    })
  };

  const ctx = vm.createContext({
    window: sandboxWindow,
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v)
    },
    document: {
      querySelector(sel) {
        if (sel === '.settings-window') return settingsWinOpen ? settingsWin : null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'button.menu-btn') {
          return [{
            querySelector: () => ({ textContent: 'ตั้งค่า' }),
            click() { settingsWinOpen = true; }
          }];
        }
        return [];
      }
    },
    planBusyReason: () => null,
    setTimeout,
    console: { log() {}, warn() {} }
  });

  vm.runInContext(codeBlock, ctx);
  sandboxWindow.applyPelicanSettings();

  await new Promise(r => setTimeout(r, 650));

  const cam = JSON.parse(storage.get('webgame.camera'));
  assert.equal(cam.render, 1);
  assert.equal(cam.maxPlayers, 10);
  assert.equal(cam.effects, 'off');
  assert.equal(cam.fpsLimit, 30);
  assert.equal(cam.ground, 'painted');
  assert.equal(cam.hatBob, false);
  assert.equal(cam.hatSparkle, false);
  assert.equal(cam.banners, false);
  assert.equal(cam.damageNumbers, 'off');
  assert.equal(cam.monsterHp, 'hit');
  assert.equal(cam.playerNames, 'hover');

  const mob = JSON.parse(storage.get('webgame.mobile'));
  assert.equal(mob.newsOnEnter, false);

  assert.equal(sentPackets.length, 1);
  assert.equal(sentPackets[0].type, 'inspect_privacy');
  assert.equal(sentPackets[0].payload.hidden, true);
  assert.equal(toggledSwitches.length, 6);
  assert.equal(selectedRadios.length, 7);
  assert.equal(settingsClosed, true);
  assert.equal(sandboxWindow.__pmDisplaySettingsSynced, true);
  assert.equal(sandboxWindow.__pmDisplaySettingsSyncedChar, 'TesterHero');

  // Calling applyPelicanSettings() again for the same character should not re-open settings
  settingsClosed = false;
  sandboxWindow.applyPelicanSettings();
  await new Promise(r => setTimeout(r, 250));
  assert.equal(settingsWinOpen, false);
  assert.equal(sandboxWindow.__pmDisplaySettingsTries, 1);
});




