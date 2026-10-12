'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events'),{PassThrough}=require('stream');
const SOURCE="window.__sourceRuns=(window.__sourceRuns||0)+1;window.__pelicanBotVersion='4.36.0';document.hud=true;window.__getClientLiveState=()=>({inGame:false});window.__isBotRunning=false;/*"+'x'.repeat(1200)+'*/';
function fixture(options={}) {
 let timerId=0,sessionId=0,documentId=1,sourceCalls=0,fullEvaluations=0;const timers=new Map(),sessions=new Map(),sockets=[],servers=[],calls=[],targets=new Map(),deferred=[];
 function document(targetId,profileId,existing=false){const document={readyState:'complete',hud:existing,getElementById:id=>id==='pelican-hud'&&document.hud?{}:null,createElement:()=>({}),head:{appendChild(){} }};const window={__pmProfileId:profileId};if(existing){window.__pelicanBotVersion='4.36.0';window.__getClientLiveState=()=>({inGame:false});window.__isBotRunning=false;}const context=vm.createContext({window,document,location:{href:'https://www.aetheria-online.in.th/play'},performance:{timeOrigin:documentId++}});const target={targetId,profileId,context};targets.set(targetId,target);return target;}
 const initial=document('target','p1',options.existing);
 const setTimeoutFake=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};
 function get(url,opts,callback){const req=new EventEmitter();req.destroy=e=>req.emit('error',e);const respond=text=>{const res=new PassThrough();res.statusCode=200;callback(res);res.end(text);};process.nextTick(()=>{
  if(url.includes('/json/version'))respond(JSON.stringify({webSocketDebuggerUrl:'ws://fake'}));
  else {sourceCalls++;if(options.failSource)req.emit('error',Error('fake network failure'));else if(options.deferSource)deferred.push(()=>respond(SOURCE));else respond(SOURCE);}
 });return req;}
 const http={get,createServer(handler){const s={handler,listen(){},on(){},close(){s.closed=true;},closeAllConnections(){}};servers.push(s);return s;}};
 class Socket {constructor(){this.readyState=0;sockets.push(this);process.nextTick(()=>{this.readyState=1;this.onopen?.();});}close(){this.readyState=3;this.onclose?.();}send(raw){const command=JSON.parse(raw);calls.push(command);process.nextTick(async()=>{
   let result={};try {
    switch(command.method){
     case 'Target.getTargets':result={targetInfos:[...targets.values()].map(t=>({targetId:t.targetId,type:'page',url:t.context.location.href}))};break;
     case 'Target.attachToTarget':{const id='s'+(++sessionId);sessions.set(id,targets.get(command.params.targetId));result={sessionId:id};break;}
     case 'Target.closeTarget':targets.delete(command.params.targetId);result={success:true};break;
     case 'Runtime.evaluate':{const target=sessions.get(command.sessionId);if(!target||!targets.has(target.targetId))throw Error('Session with given id not found');
       const expression=command.params.expression;if(expression.includes('(0,eval)(')){fullEvaluations++;if(options.lateLegacy)target.context.window.__pelicanBotVersion='4.36.0';if(options.throwInjection){target.context.window.__pmBrowserInjectionAttempted=true;result={exceptionDetails:{text:'Script failed',exception:{description:'private exception must not be logged'}}};break;}}
       const value=await vm.runInContext(expression,target.context);result={result:{value}};break;}
    }
    this.onmessage?.({data:JSON.stringify({id:command.id,result})});
   }catch(e){this.onmessage?.({data:JSON.stringify({id:command.id,error:{message:e.message}})});}
  });}}
 const fakeFs={...fs,readFileSync(file,encoding){if(String(file).endsWith('bot.js')){if(options.failLocal)throw Error('local source unavailable');return SOURCE;}return fs.readFileSync(file,encoding);}};
 const module={exports:{}};
 new Function('require','module','WebSocket','setTimeout','clearTimeout','setInterval','clearInterval',fs.readFileSync(path.join(__dirname,'../browser_mode.js'),'utf8'))(name=>name==='http'?http:name==='https'?{get}:name==='fs'?fakeFs:name==='child_process'?{spawn(){assert.fail('recovery must not create or close browser processes');}}:require(name),module,Socket,setTimeoutFake,id=>timers.delete(id),(fn,ms)=>setTimeoutFake(fn,ms),id=>timers.delete(id));
 const client=module.exports.createBrowserMode({rootDir:'fake',sessionsDir:'fake',getSettings:()=>({browserKind:'edge'}),loadProfiles:()=>[{id:'p1',debugPort:49999}]});
 const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
 const advance=async ms=>{const matching=[...timers].filter(([,t])=>t.ms===ms);for(const [id,t]of matching){timers.delete(id);t.fn();}await settle();};
 const event=(method,params={})=>{const session=[...sessions].filter(([,t])=>t?.targetId==='target').at(-1)?.[0];sockets.at(-1).onmessage?.({data:JSON.stringify({method,params,sessionId:session})});};
 return {client,settle,advance,event,options,initial,targets,calls,sockets,servers,deferred,sessions,get sourceCalls(){return sourceCalls;},get fullEvaluations(){return fullEvaluations;},newDocument(){const next=document('target','p1');for(const [id,t]of sessions)if(t?.targetId==='target')sessions.set(id,next);return next;}};
}
test('CDP drop reconnects surviving game proxy and never reinjects an existing runtime',async()=>{
 const f=fixture({existing:true});f.client.start();await f.advance(3000);assert.equal(f.client.isOpen('p1'),true);assert.equal(f.client.status().p1.state,'ready');assert.equal(f.fullEvaluations,0);
 f.sockets.at(-1).close();await f.settle();assert.equal(f.client.isOpen('p1'),false);await f.advance(1000);assert.equal(f.client.isOpen('p1'),true);assert.equal(f.servers.length,2);assert.equal(f.fullEvaluations,0);assert.equal(f.calls.filter(c=>c.method==='Target.closeTarget').length,0);
});
test('fresh document failed source retries at most three; CDP exception leaves partial runtime without reinjection',async()=>{
 const f=fixture({failSource:true,failLocal:true});f.client.start();await f.advance(3000);await f.advance(1000);await f.advance(3000);await f.advance(15000);assert.equal(f.sourceCalls,3);assert.equal(f.fullEvaluations,0);assert.equal(f.client.status().p1.state,'load-failed');
 const error=fixture({throwInjection:true});error.client.start();await error.advance(3000);assert.equal(error.fullEvaluations,1);assert.equal(error.client.status().p1.state,'partial-runtime');error.event('Page.loadEventFired');await error.settle();await error.advance(15000);assert.equal(error.fullEvaluations,1);
});
test('refresh during delayed source fetch cancels old document and injects new document once',async()=>{
 const f=fixture({deferSource:true});f.client.start();await f.advance(3000);assert.equal(f.deferred.length,1);const next=f.newDocument();f.event('Page.frameNavigated',{frame:{id:'main'},type:'Navigation'});f.event('Page.loadEventFired');await f.settle();f.deferred.shift()();await f.settle();assert.equal(f.fullEvaluations,0);await f.advance(0);assert.equal(f.deferred.length,1);f.deferred.shift()();await f.settle();assert.equal(f.fullEvaluations,1);assert.equal(next.context.window.__pelicanBotVersion,'4.36.0');assert.equal(f.client.status().p1.state,'ready');f.event('Page.loadEventFired');await f.settle();assert.equal(f.fullEvaluations,1);
});
test('delayed legacy loader response wins the atomic guard and explicit stop survives rediscovery',async()=>{
 const f=fixture({deferSource:true});f.client.start();await f.advance(3000);f.initial.context.window.__pelicanBotVersion='4.36.0';f.initial.context.window.__isBotRunning=false;f.deferred.shift()();await f.settle();assert.equal(f.fullEvaluations,0);assert.equal(f.client.status().p1.state,'partial-runtime');
 f.sockets.at(-1).close();await f.settle();await f.client.stop('p1');await f.settle();await f.advance(1000);assert.equal(f.client.isOpen('p1'),false);assert.equal(f.client.status().p1.state,'explicitly-stopped');assert.equal(f.fullEvaluations,0);
});
test('legacy response between final probe and eval cannot execute full source; partial stopped runtime also skips',async()=>{
 const f=fixture({lateLegacy:true});f.client.start();await f.advance(3000);assert.equal(f.fullEvaluations,1);assert.equal(f.initial.context.window.__sourceRuns,undefined);assert.equal(f.initial.context.window.__pmBrowserInjectionAttempted,undefined);assert.equal(f.client.status().p1.state,'partial-runtime');
 const partial=fixture();partial.initial.context.window.__isBotRunning=false;partial.client.start();await partial.advance(3000);assert.equal(partial.sourceCalls,0);assert.equal(partial.fullEvaluations,0);assert.equal(partial.client.status().p1.gameAlive,true);assert.equal(partial.client.status().p1.botReady,false);
});
test('character selection keeps game-alive diagnostic separate from the live game state',async()=>{
 const f=fixture({existing:true});f.client.start();await f.advance(3000);const handler=f.servers[0].handler;
 const request={url:'/api/browser-status',method:'GET',setEncoding(){}};let response;
 await handler(request,{setHeader(){},writeHead(){},end(text){response=JSON.parse(text);}});assert.equal(response.gameAlive,true);assert.equal(response.botReady,true);assert.equal(response.state,'ready');
 await handler({...request,url:'/api/state'},{setHeader(){},writeHead(){},end(text){response=JSON.parse(text);}});assert.equal(response.inGame,false);
});
test('a missed detach with surviving target discards stale session and reattaches without full reinjection',async()=>{
 const f=fixture({existing:true});f.client.start();await f.advance(3000);assert.equal(f.client.isOpen('p1'),true);
 f.sessions.clear();await f.advance(15000);assert.equal(f.client.isOpen('p1'),false);assert.equal(f.client.status().p1.state,'transport-disconnected');await f.advance(1000);assert.equal(f.client.isOpen('p1'),true);assert.equal(f.client.status().p1.state,'ready');assert.equal(f.fullEvaluations,0);assert.equal(f.calls.filter(c=>c.method==='Target.closeTarget').length,0);
});
test('a reload while CDP is disconnected reuses known target ownership when the page identity is temporarily absent',async()=>{
 const f=fixture({existing:true});f.client.start();await f.advance(3000);f.sockets.at(-1).close();const next=f.newDocument();delete next.context.window.__pmProfileId;
 await f.advance(1000);assert.equal(f.client.isOpen('p1'),true);assert.equal(next.context.window.__pmProfileId,'p1');assert.equal(f.fullEvaluations,1);assert.equal(f.client.status().p1.state,'ready');
});
