'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
function fixture(protectedMode=false){
 const timers=[],requests=[],writes=[],expressions=[],pages=[];let win,handler;
 const source="window.__runs=(window.__runs||0)+1;window.__pelicanBotVersion='4.36.0';"+' '.repeat(1100);
 function page(id){const document={getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}},window={};const context=vm.createContext({window,document,performance:{timeOrigin:id}});pages.push(context);return context;}
 let current=page(1);
 class BrowserWindow extends EventEmitter{constructor(){super();win=this;this.webContents=new EventEmitter();Object.assign(this.webContents,{getURL:()=> 'https://www.aetheria-online.in.th/play',executeJavaScript:async code=>{expressions.push(code);return vm.runInContext(code,current);},setWindowOpenHandler(){},setAudioMuted(){}});}show(){}focus(){}loadURL(){}isVisible(){return true;}isMinimized(){return false;}}
 const app={setPath(){},requestSingleInstanceLock:()=>true,quit(){},on(){},whenReady:()=>({then:fn=>fn()})};
 const fakeFs={existsSync:()=>true,mkdirSync(){},readFileSync:()=>source,writeFileSync:(_,value)=>writes.push(value)};
 const fakeHttps={get(url,callback){const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>{};requests.push({callback,req});return req;}};
 const fakeHttp={createServer(fn){handler=fn;return {on(){},listen(){}};}};
 const context={require:name=>name==='electron'?{app,BrowserWindow,Menu:{setApplicationMenu(){}},shell:{}}:name==='fs'?fakeFs:name==='https'?fakeHttps:name==='http'?fakeHttp:require(name),console:{log(){},warn(){},error(){}},process:{argv:protectedMode?['node','--pmhee-protected-script']:['node'],resourcesPath:'fixture'},URL,setTimeout:(fn,ms)=>timers.push({fn,ms}),clearTimeout(){},Buffer};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8'),context);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 return {source,requests,writes,pages,expressions,handler,async load(){win.webContents.emit('did-finish-load');await settle();},async fallback(){for(const timer of timers.splice(0))if(timer.ms===1500)timer.fn();await settle();},async remote(index=0){const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};requests[index].callback(response);response.emit('data',source);response.emit('end');await settle();},reload(){current=page(pages.length+1);},get current(){return current;}};
}
test('protected Electron loader leaves a fresh document empty for Manager POST bootstrap and never fetches/caches public bot',async()=>{
 const f=fixture(true);await f.load();await f.fallback();assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);assert.equal(f.current.window.__pelicanBotVersion,undefined);
 const req={url:'/api/loader-status',method:'GET'},res={setHeader(){},writeHead(){},end(text){const status=JSON.parse(text);assert.equal(status.protectedScriptMode,true);assert.equal(status.protocol,1);assert.equal(status.postEval,true);}};f.handler(req,res);
 f.reload();await f.load();await f.fallback();assert.equal(f.requests.length,0);
});
test('compatibility Electron fallback then delayed remote never starts duplicate full bot',async()=>{
 const f=fixture();await f.load();assert.equal(f.requests.length,1);await f.fallback();assert.equal(f.current.window.__runs,1);await f.remote();assert.equal(f.current.window.__runs,1);
});
test('Electron stale remote response cannot inject into a new document; existing bootstrap wins guard',async()=>{
 const f=fixture();await f.load();f.reload();await f.load();await f.remote(0);assert.equal(f.current.window.__runs,undefined);f.current.window.__pmScriptBootstrap={};await f.remote(1);await f.fallback();assert.equal(f.current.window.__runs,undefined);
});
