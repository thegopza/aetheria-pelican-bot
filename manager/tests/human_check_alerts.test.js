// Capture Discord JSON using offline transports; never contact Discord or a game.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');

async function alert(t, reply, {free = true, gameSuccess = true} = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-alert-fixture-'));
  t.after(() => fs.rmSync(dataDir, {recursive:true, force:true}));
  fs.writeFileSync(path.join(dataDir, 'discord_settings.json'), JSON.stringify({enabled:true,botToken:'test-token',channelId:'test-channel',autoAnswer:true,autoBringToFront:false}));
  const sent = [], gameCalls = [];
  const fakeHttp = {request(url, options, receive) {
    assert.equal(url.hostname, 'discord.com');
    assert.equal(options.headers.Authorization, 'Bot test-token');
    const req = new EventEmitter(); let payload = '';
    req.write = bytes => {payload += bytes.toString('utf8');};
    req.end = () => {
      sent.push(JSON.parse(payload));
      queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; receive(res); res.emit('data', '{"id":"fixture-message"}'); res.emit('end'); });
    };
    req.destroy = () => {};
    return req;
  }};
  const module = {exports:{}};
  new Function('require','module','exports','setTimeout','WebSocket', fs.readFileSync(path.join(__dirname,'../discord_bot.js'),'utf8'))(name => {
    if (name === 'http' || name === 'https') return fakeHttp;
    if (name.startsWith('.')) return require(path.join(__dirname,'..',name));
    return require(name);
  }, module, module.exports, cb => {queueMicrotask(cb);return 0;}, undefined);
  const solver = {isRemoteService:true,loadSettings:()=>({autoAnswer:true,pointSystemEnabled:true,points:0,pointsPerSolve:free ? 0 : 1,answerDelayMs:800}),async solveHumanCheck(prompt,options,items,requestId) {
    if (reply === 'throw') throw new Error('fixture connection unavailable');
    return typeof reply === 'function' ? reply(requestId) : reply;
  }};
  const profile = {id:'fixture-profile',name:'fixture',debugPort:9999};
  const service = module.exports.createDiscordBotService({dataDir,loadProfiles:()=>[profile],humanCheckSolver:solver,evalProfilePort:async code=>{gameCalls.push(code);return {result:{success:gameSuccess}};}});
  await service.notifyHumanCheck({profile,check:{id:'fixture-check',prompt:'เลือก Hammer',options:[{index:0,itemId:1},{index:1,itemId:2}]}});
  assert.equal(sent.length, 1);
  return {text:JSON.stringify(sent[0]),gameCalls};
}
test('free zero-balance successful solve reports free success and answers game', async t => {
  const result = await alert(t,id=>({success:true,charged:0,remaining:0,requestId:id,pickIndex:0,matchedName:'Hammer'}));
  assert.equal(result.gameCalls.length,1);
  assert.match(result.text,/ไม่หักส่วนบุญ/);
  assert.doesNotMatch(result.text,/ส่วนบุญหมด|ส่วนบุญไม่พอ|ส่วนบุญไม่เพียงพอ/);
});
test('free zero balance with API maintenance/outage never claims insufficient points', async t => {
  for (const reply of [{success:false,code:'MAINTENANCE',status:503},{success:false,code:'SERVICE_UNAVAILABLE'},'throw']) {
    const result = await alert(t,reply);
    assert.equal(result.gameCalls.length,0);
    assert.doesNotMatch(result.text,/ส่วนบุญหมด|ส่วนบุญไม่พอ|ส่วนบุญไม่เพียงพอ/);
    assert.match(result.text,/API|การเชื่อมต่อ/);
  }
});
test('only server payment rejection identifies insufficient points', async t => {
  const result = await alert(t,{success:false,code:'INSUFFICIENT_POINTS',status:402},{free:false});
  assert.equal(result.gameCalls.length,0);
  assert.match(result.text,/ส่วนบุญไม่เพียงพอ/);
});
test('no-match and game transport failure show their actual cause', async t => {
  const noMatch = await alert(t,{success:false,code:'NO_MATCH'});
  assert.match(noMatch.text,/จับคู่คำตอบไม่สำเร็จ/);
  const transport = await alert(t,id=>({success:true,charged:0,remaining:0,requestId:id,pickIndex:0,matchedName:'Hammer'}),{gameSuccess:false});
  assert.match(transport.text,/ส่งคำตอบเข้าเกมไม่สำเร็จ/);
  assert.doesNotMatch(transport.text,/ส่วนบุญหมด|ส่วนบุญไม่เพียงพอ/);
});
