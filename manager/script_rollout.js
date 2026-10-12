'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const productionKeys=require('./script_release_keys');
const STAGING_ORIGIN='https://pmhee-aetheria-staging.pmhee-aetheria-worker.workers.dev';
const PRODUCTION_ORIGIN='https://api.noggunsshop.xyz';
function publicPins(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length>20) throw Error('INVALID_PUBLIC_PINS');
  const keys=Object.create(null);
  for(const [id,jwk] of Object.entries(input)) {
    if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(id) || !jwk || Object.keys(jwk).some(k=>!['kty','crv','x','y'].includes(k)) || jwk.kty!=='EC' || jwk.crv!=='P-256' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x||'') || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y||'')) throw Error('INVALID_PUBLIC_PINS');
    crypto.createPublicKey({key:jwk,format:'jwk'});
    keys[id]=Object.freeze({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y});
  }
  return Object.freeze(keys);
}
function loadScriptRollout({dataDir,serviceOrigin}) {
  const observation=code=>({mode:'observation',pilotProfileIds:Object.freeze([]),trustedKeys:Object.freeze({}),serviceOrigin,configurationCode:code});
  let config;
  try {const text=fs.readFileSync(path.join(dataDir,'script_rollout_v1.json'),'utf8');if(Buffer.byteLength(text)>32768)throw Error('CONFIG_TOO_LARGE');config=JSON.parse(text);}
  catch(error){return observation(error.code==='ENOENT'?'DEFAULT_OBSERVATION':'INVALID_ROLLOUT_CONFIG');}
  try {
    if(!config || config.schema!==1 || !['observation','pilot'].includes(config.mode) || Object.keys(config).some(k=>!['schema','mode','pilotProfileIds','stagingPublicKeys'].includes(k)))throw Error('INVALID_ROLLOUT_CONFIG');
    if(config.mode==='observation')return observation('EXPLICIT_OBSERVATION');
    if(!Array.isArray(config.pilotProfileIds) || !config.pilotProfileIds.length || config.pilotProfileIds.length>100 || config.pilotProfileIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(id)) || new Set(config.pilotProfileIds).size!==config.pilotProfileIds.length)throw Error('INVALID_PILOT_PROFILES');
    let keys;
    if(serviceOrigin===STAGING_ORIGIN) keys=publicPins(config.stagingPublicKeys);
    else if(serviceOrigin===PRODUCTION_ORIGIN) {
      if(Object.hasOwn(config,'stagingPublicKeys'))throw Error('PRODUCTION_LOCAL_PINS_FORBIDDEN');
      keys=publicPins(productionKeys);
    } else throw Error('UNAPPROVED_PILOT_ORIGIN');
    if(!Object.keys(keys).length)throw Error('RELEASE_PUBLIC_PINS_NOT_PROVISIONED');
    return {mode:'pilot',pilotProfileIds:Object.freeze([...config.pilotProfileIds]),trustedKeys:keys,serviceOrigin,configurationCode:'EXPLICIT_PILOT'};
  }catch(error){return observation(error.message);}
}
module.exports={loadScriptRollout,STAGING_ORIGIN,PRODUCTION_ORIGIN};
