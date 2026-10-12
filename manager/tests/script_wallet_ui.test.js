'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('ส่วนบุญ wallet badges show signed balances without per-image billing language',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=source.indexOf('let lastKnownPointsPerSolve ='),end=source.indexOf('window.updatePointDisplays = updatePointDisplays;',start);
 const elements=new Map(['topup-point-badge','topup-modal-points','hc-points-val','topup-modal-status-badge','topup-modal-rate'].map(id=>[id,{style:{}}])),host={};
 new Function('document','window',source.slice(start,end)+'\nwindow.update=updatePointDisplays;')({getElementById:id=>elements.get(id)},host);
 host.update(600,0,true);assert.equal(elements.get('topup-point-badge').innerText,'ส่วนบุญคงเหลือ 600');
 host.update(-500,0,true);assert.equal(elements.get('topup-point-badge').innerText,'ส่วนบุญ -500');
 host.update(-22.5,0,true);assert.equal(elements.get('topup-modal-points').innerText,'-22.5');
 assert.match(elements.get('topup-modal-rate').innerText,/ไม่มีค่าต่อคำตอบ/);assert.doesNotMatch(elements.get('topup-modal-rate').innerText,/Point|ข้อละ|หัก.*ต่อ.*ครั้ง/);
});
