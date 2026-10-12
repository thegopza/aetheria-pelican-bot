'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHumanCheckSolver}=require('../human_check_solver');
test('authenticated proxy unit ACK updates fractional debt even for persisted ACKs without schemaVersion',async()=>{const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pmhee-proxy-wallet-'));const solver=createHumanCheckSolver({dataDir,requestJSON:async route=>route.endsWith('/enroll')?{success:true,accountId:'fixture',token:'c'.repeat(64)}:{success:true,unitScale:100,balanceUnits:-10}});await solver.proxyComplete('fixture-ticket','fixture-user',true);assert.equal(solver.loadSettings().balanceUnits,-10);assert.equal(solver.loadSettings().points,-0.1);});
