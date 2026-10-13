'use strict';
// Opt-in integration pilot: isolated local pages and staging only, never production games.
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const {createScriptCoordinator}=require('../script_coordinator');
const {createHumanCheckSolver}=require('../human_check_solver');
const {createBrowserMode}=require('../browser_mode');
const privateDir=process.env.PMHEE_PILOT_ARTIFACT_DIR;
if(!privateDir)throw Error('PMHEE_PILOT_ARTIFACT_DIR required (private artifact directory)');
const stage='https://pmhee-aetheria-staging.pmhee-aetheria-worker.workers.dev';
const pins=JSON.parse(fs.readFileSync(path.join(privateDir,'public-keys.json'),'utf8'));
const expectedVersion=JSON.parse(fs.readFileSync(path.join(privateDir,'release.json'),'utf8')).version;
const out=path.join(process.env.PMHEE_PILOT_OUTPUT_DIR||privateDir,'browser-pilot-'+Date.now());fs.mkdirSync(out,{recursive:true});
const results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let adminHtml;
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};return {ws,send(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}};}
async function run(name,exe,cdpPort,bridgePort){
 const dir=path.join(out,name);fs.mkdirSync(dir);let browser,cdp,server,browserMode;
 const account=await (await fetch(stage+'/v1/aetheria/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineHwid:crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),machineName:'ISOLATED-'+name+'-PILOT'})})).json();
 assert.equal(account.success,true);fs.writeFileSync(path.join(dir,'aetheria_service_account.json'),JSON.stringify({origin:stage,accountId:account.accountId,token:account.token}),{mode:0o600});
 const service=createHumanCheckSolver({dataDir:dir,serviceUrl:stage});
 let calls=0,deliveries=0,renewals=0;
 try {
  server=http.createServer(async(req,res)=>{
   if(req.url==='/admin'&&adminHtml){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(adminHtml('isolated-test'));return;}
   if(req.url.startsWith('/v1/aetheria/admin/usage/')){
    req.setEncoding('utf8');let body='';for await(const chunk of req)body+=chunk;
    const action=req.url.split('/').at(-1);let data;
    if(action==='accounts')data={accounts:[{accountId:'isolated-account',deviceName:'Edge เครื่องทดสอบ',balanceUnits:-50000}],nextCursor:null};
    else if(action==='slots')data={slots:[{slotId:'stable-isolated-slot-'+('s'.repeat(50)),profileId:'Client ทดสอบ',deviceId:'isolated-device',bindingVersion:1,lastUsageAt:Date.now()}],devices:[{deviceId:'isolated-device',createdAt:'2026-10-12',revokedAt:null}],nextCursor:null};
    else if(action==='statement')data={billingMode:'shadow',balanceUnits:-50000,usedSlotsToday:15,estimatedUnits:2250,bangkokDay:'2026-10-12',ledger:[{bangkok_day:'2026-10-11',kind:'adjustment',delta_units:-50000,reason:'ตัวอย่างข้อมูลทดสอบ ไม่ใช่บัญชีจริง'}]};
    else {res.statusCode=403;data={success:false,code:'TEST_FIXTURE_MUTATIONS_DISABLED'};}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,...data}));return;
   }
   if(req.url==='/api/eval'&&req.method==='POST'){
    req.setEncoding('utf8');let body='';for await(const chunk of req)body+=chunk;
    try {const {code}=JSON.parse(body);calls++;if(code.includes('.accept('))deliveries++;if(code.includes('.renew('))renewals++;
     const data=await cdp.send('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});
     if(data.exceptionDetails)throw Error(data.exceptionDetails.text+' '+(data.exceptionDetails.exception?.description||''));
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,result:data.result.value}));
    }catch(e){res.end(JSON.stringify({success:false,error:e.message}));}return;
   }
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; style-src 'unsafe-inline'; img-src data:");
   res.end(`<!doctype html><html lang="th"><head><title>PmheeAether isolated ${name} pilot</title></head><body style="background:#101827;color:#eee;font:18px sans-serif"><h1>PmheeAether ${name} — ทดสอบแยก</h1><p>ส่วนบุญ 0 · shadow ไม่มีการหักเงินจริง · เกมจำลอง</p><script>window.__pmProfileId='isolated-${name}';window.__pilotIntervals=0;window.__pilotPackets=[];const nativeInterval=window.setInterval.bind(window);window.setInterval=(f,m,...a)=>{window.__pilotIntervals++;return nativeInterval(f,m,...a)};window.fetch=async()=>({ok:false,json:async()=>({})});window.__pilotNow=Date.now();Date.now=()=>window.__pilotNow;</script></body></html>`);
  });await new Promise((r,j)=>{server.once('error',j);server.listen(bridgePort,'127.0.0.1',r)});
  browser=spawn(exe,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port='+cdpPort,'--user-data-dir='+path.join(dir,'browser-profile'),'http://127.0.0.1:'+bridgePort+'/play'],{windowsHide:true,stdio:'ignore'});
  browser.on('error',()=>{});let targets;
  for(let i=0;i<100;i++){try{targets=await(await fetch('http://127.0.0.1:'+cdpPort+'/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(100);}
  const target=targets?.find(t=>t.type==='page');assert.ok(target,'isolated browser page available');cdp=await connect(target.webSocketDebuggerUrl);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const evaluate=async code=>{const r=await cdp.send('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,r.exceptionDetails?.exception?.description);return r.result.value;};
  const profile={id:'isolated-'+name,debugPort:bridgePort+10};
  const bootstrap=fs.readFileSync(path.join(__dirname,'../script_bootstrap.js'),'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}',JSON.stringify(pins));
  const makeBrowserMode=()=>createBrowserMode({rootDir:path.join(__dirname,'../..'),sessionsDir:path.join(dir,'sessions'),getSettings:()=>({launchMode:'browser',browser:name.toLowerCase()}),loadProfiles:()=>[profile],cdpPort,browserUserDataDir:path.join(dir,'browser-profile'),gameUrl:'http://127.0.0.1:'+bridgePort+'/play',profileScriptSource:()=>bootstrap});
  browserMode=makeBrowserMode();
  browserMode.start();for(let i=0;i<80&&!browserMode.isOpen(profile.id);i++)await pause(100);assert.ok(browserMode.isOpen(profile.id),'actual browser factory rediscovered fixture');
  const bridge=async(_,code)=>{calls++;if(code.includes('.accept('))deliveries++;if(code.includes('.renew('))renewals++;return await(await fetch('http://127.0.0.1:'+profile.debugPort+'/api/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).json();};
  const coordinator=createScriptCoordinator({dataDir:dir,loadProfiles:()=>[profile],evalProfilePort:bridge,service,trustedKeys:pins,pilotProfileIds:[profile.id],protect:v=>v,unprotect:v=>v});
  await pause(300);await coordinator.cycle();await coordinator.cycle();
  assert.equal(coordinator.status().clients[profile.id].state,'authorized',JSON.stringify(coordinator.status().clients));
  assert.equal(await evaluate('window.__pelicanBotVersion'),expectedVersion);
  const timerCount=await evaluate('window.__pilotIntervals');assert.ok(timerCount>10);
  await coordinator.cycle();assert.equal(deliveries,1);assert.equal(await evaluate('window.__pilotIntervals'),timerCount);assert.ok(renewals>0);
  await evaluate('window.startMasterBot(); window.__isBotRunning');await coordinator.cycle();
  assert.equal(coordinator.status().pendingEvents,0);
  const statement=await service.serviceRequest('/v1/aetheria/usage/statement');assert.equal(statement.usedSlotsToday,1);assert.equal(statement.balanceUnits,0);
  await coordinator.cycle();assert.equal((await service.serviceRequest('/v1/aetheria/usage/statement')).usedSlotsToday,1);
  const slot=await evaluate('window.__pmScriptBootstrap.status().slotId');
  const runningTimerCount=await evaluate('window.__pilotIntervals');
  cdp.ws.close();cdp=await connect(target.webSocketDebuggerUrl);await coordinator.cycle();assert.equal(deliveries,1);
  browserMode.dispose();await pause(100);browserMode=makeBrowserMode();browserMode.start();for(let i=0;i<80&&!browserMode.isOpen(profile.id);i++)await pause(100);assert.ok(browserMode.isOpen(profile.id),'fresh Manager browser factory rediscovers surviving runtime');await coordinator.cycle();assert.equal(deliveries,1);assert.equal(await evaluate('window.__pilotIntervals'),runningTimerCount);
  await evaluate('window.__isShopping=true;window.__pilotNow=window.__pmScriptBootstrap.status().graceUntil+1');await pause(1200);
  assert.equal(await evaluate('window.__pmScriptBootstrap.status().phase'),'ready');
  assert.equal(await evaluate("(()=>{try{window.__applyScriptPlan({id:'blocked'},true);return false}catch(e){return e.message}})()"),'SCRIPT_AUTHORIZATION_REQUIRED');
  await evaluate('window.__isShopping=false');await pause(2200);const expiry=await evaluate('JSON.stringify({status:window.__pmScriptBootstrap.status(),flags:Object.keys(window).filter(k=>(k.startsWith("__is")||k.includes("Busy"))&&window[k]===true)})');assert.equal(await evaluate('window.__pmScriptBootstrap.status().phase'),'expired',expiry);assert.equal(await evaluate('window.__isBotRunning'),false);
  if(process.env.PMHEE_PILOT_CAPTCHA==='1'){
    await evaluate(`document.body.insertAdjacentHTML('beforeend','<div class="human-check"><p class="human-check-prompt">เลือก Red Potion</p><button class="human-check-pick">A</button><button class="human-check-pick">B</button></div>');window.__hcFixtureClicks=0;document.querySelectorAll('.human-check-pick').forEach(b=>b.addEventListener('click',()=>window.__hcFixtureClicks++));window.__latestHumanCheck={id:'fixture-hc-after-expiry',prompt:'เลือก Red Potion',items:[90301,90304],timestamp:Date.now()};window.__autoHumanCheckEnabled=true;window.__pmHumanCheckSolverConfig={autoAnswer:true,answerDelayMs:800};`);
    await pause(2800);assert.equal(await evaluate('window.__hcFixtureClicks'),1);assert.equal(await evaluate('window.__isBotRunning'),false);assert.equal(await evaluate('window.__pmGetHumanCheckEvents().at(-1).charged'),0);
    await evaluate('window.__pmAckHumanCheckEvents(window.__pmGetHumanCheckEvents().map(e=>e.eventId));document.querySelector(".human-check").remove()');assert.equal(await evaluate('window.__pmGetHumanCheckEvents().length'),0);
  }
  const before=deliveries;await cdp.send('Page.reload');await pause(600);await coordinator.cycle();await coordinator.cycle();
  assert.equal(coordinator.status().clients[profile.id].state,'authorized',JSON.stringify(coordinator.status().clients));assert.equal(deliveries,before+1);assert.equal(await evaluate('window.__pmScriptBootstrap.status().slotId'),slot);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});const screenshot=path.join(dir,'runtime.png');fs.writeFileSync(screenshot,Buffer.from(shot.data,'base64'));
  let adminScreenshot=null;if(adminHtml){await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+bridgePort+'/admin'});await pause(400);await evaluate('document.querySelector("#accounts button").click()');await pause(400);assert.ok((await evaluate('document.getElementById("summary").textContent')).includes('-500'));const metrics=await cdp.send('Page.getLayoutMetrics');const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:metrics.cssContentSize.height,scale:1}});adminScreenshot=path.join(dir,'admin.png');fs.writeFileSync(adminScreenshot,Buffer.from(shot.data,'base64'));}
  results.push({name,pass:true,checks:['full signed staging payload via real JSON transport and POST eval','CSP initialization','renewal no duplicate timers','actual start shadow usage once','CDP reconnect and fresh Manager factory rediscovery no reinject','expiry waits shop safe boundary then pauses','reload stable slot'],calls,deliveries,screenshot,adminScreenshot});coordinator.stop();
 }finally{
  browserMode?.dispose();
  if(cdp){try{await cdp.send('Browser.close')}catch{}cdp.ws.close();}
  if(browser&&browser.exitCode===null){await Promise.race([new Promise(r=>browser.once('exit',r)),pause(4000)]);if(browser.exitCode===null)browser.kill();}
  if(server)await new Promise(r=>server.close(r));
 }
}
(async()=>{try{if(process.env.PMHEE_PILOT_API_DIR)adminHtml=(await import(require('url').pathToFileURL(path.join(process.env.PMHEE_PILOT_API_DIR,'cloudflare/admin_ui.mjs')))).adminHtml;await run('Edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',9446,3901);await run('Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe',9447,3902);}catch(e){results.push({pass:false,error:e.stack});process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,results},null,2));}})();
