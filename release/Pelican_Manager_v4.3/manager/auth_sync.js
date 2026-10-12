// manager/auth_sync.js — keep each game client's Auto-login in line with its Manager profile.
//
// - profile with ID + password: the client's Auto-login gets them (and is switched on) whenever its saved
//   ID/password differ from the profile's.
// - profile created without a password (profile.autoRegister): the Manager generates the missing ID and
//   password, saves them in the profile FIRST, then tells the bot to sign up (authConfig.register) and
//   to create a character. If the bot had to pick another ID (taken), that ID is copied back here.
//   When the bot reports registerDone the profile becomes a normal ID + password profile.
// Passwords never leave the Manager except to the profile's own game client.

const crypto = require('crypto');

const SYNC_MS = 10 * 1000;
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const pick = (chars, n) => Array.from(crypto.randomBytes(n), b => chars[b % chars.length]).join('');
const genUserId = () => 'pm' + pick(ALNUM, 8);   // 10 chars, a-z 0-9 (game: 3-16, a-z 0-9 _)
const genPassword = () => pick('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', 12);

const READ_JS = `(() => {
  const c = window.__authConfig;
  if (!c || typeof window.executeAutoLogin !== 'function') return null;
  return { username: c.username || '', password: c.password || '', enabled: !!c.enabled, register: !!c.register, registerDone: !!c.registerDone, registerError: c.registerError || '' };
})()`;

const pushJs = cfg => `(() => {
  const c = window.__authConfig || (window.__authConfig = {});
  Object.assign(c, ${JSON.stringify(cfg)});
  try { localStorage.setItem('pelican_auth_cfg', JSON.stringify(c)); } catch (e) {}
  const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } };
  set('p-auth-enabled', c.enabled); set('p-auth-user', c.username || ''); set('p-auth-pass', c.password || '');
  return { success: true };
})()`;

function createAuthSync({ loadProfiles, saveProfiles, evalProfilePort, credentials, proxyRegister }) {
  // passwords live in data/credentials.json (git-ignored), not in profiles.json
  const pw = p => credentials.getPassword(p.id);
  function updateProfile(id, patch) {
    const profiles = loadProfiles();
    const p = profiles.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    saveProfiles(profiles);
    return p;
  }

  // Generate whatever an auto-register profile is still missing (saved before anything is sent)
  function ensureRegisterCredentials(profile) {
    if (!pw(profile)) credentials.setPassword(profile.id, genPassword());
    if (!profile.account) return updateProfile(profile.id, { account: genUserId(), generatedAccount: true });
    return profile;
  }
  async function syncProxyRegistration(profile) {
    try {
      const result=await proxyRegister.registerAccountWithProxy({profileId:profile.id,username:profile.account,password:pw(profile)});
      if(result?.success===true) {
        // Persist the known signup outcome before delivering login settings; a lost game ACK cannot sign up again.
        updateProfile(profile.id,{autoRegister:false,registeredAt:Date.now(),proxyRegistrationState:'done',registerError:'',loginSyncPending:true});
        const delivered=await evalProfilePort(profile.debugPort,pushJs({enabled:true,autoResumeBot:true,username:profile.account,password:pw(profile),register:false,registerDone:true,autoCreateChar:true}),3000);
        if(!delivered?.success||delivered.result?.success!==true) updateProfile(profile.id,{registerError:'สมัครสำเร็จแล้ว แต่ยังส่งค่าล็อกอินเข้าจอไม่ได้ รอซิงค์อีกครั้ง'});
        else updateProfile(profile.id,{loginSyncPending:false});
      } else if(result?.code==='USERNAME_TAKEN' && profile.generatedAccount) {
        updateProfile(profile.id,{account:genUserId(),generatedAccount:true,proxyRegistrationState:'known-rejected',registerError:''});
      } else if(result?.pending) {
        updateProfile(profile.id,{proxyRegistrationState:'review-required',registerError:result.error||'รายการสมัครยังรอตรวจสอบ'});
      } else {
        updateProfile(profile.id,{autoRegister:false,proxyRegistrationState:'known-rejected',registerError:result?.error||'Proxy ไม่อนุมัติรายการสมัคร'});
      }
    } catch(_) {updateProfile(profile.id,{proxyRegistrationState:'retry-pending',registerError:'ยังยืนยันผล Proxy ไม่ได้ เก็บรายการเดิมไว้ก่อนลองใหม่'});}
  }

  async function syncOne(profile) {
    if (!profile.debugPort) return;
    if (!profile.autoRegister && !(profile.account && pw(profile))) return;
    const r = await evalProfilePort(profile.debugPort, READ_JS, 3000);
    const cur = r && r.success ? r.result : null;
    if (!cur) return;   // offline or bot not loaded yet

    if (profile.autoRegister) {
      profile = ensureRegisterCredentials(profile) || profile;
      if(proxyRegister?.hasPending?.(profile.id)){await syncProxyRegistration(profile);return;}
      if (cur.registerDone && cur.username) {
        if (cur.password && cur.password !== pw(profile)) credentials.setPassword(profile.id, cur.password);
        updateProfile(profile.id, { account: cur.username, autoRegister: false, registeredAt: Date.now() });
        console.log(`[AuthSync] ✅ ${profile.name}: สมัครบัญชี "${cur.username}" สำเร็จ`);
        return;
      }
      if (cur.register) {
        // the bot switched to another ID because ours was taken: keep the profile in step
        if (cur.username && cur.username !== profile.account) updateProfile(profile.id, { account: cur.username });
        return;
      }
      if (cur.registerError) {
        // sign-up refused for a user-given ID: the bot now logs in with it instead -> normal profile
        updateProfile(profile.id, { autoRegister: false, registerError: cur.registerError });
        return;
      }

      // If Proxy Registration is enabled, sign up directly through proxy tunnel
      if (proxyRegister && typeof proxyRegister.isEnabled === 'function' && proxyRegister.isEnabled()) {
        await syncProxyRegistration(profile);return;
      }

      await evalProfilePort(profile.debugPort, pushJs({
        enabled: true, autoResumeBot: true, username: profile.account, password: pw(profile),
        register: true, registerDone: false, autoCreateChar: true, generatedUser: !!profile.generatedAccount
      }), 3000);
      console.log(`[AuthSync] 📝 ${profile.name}: ส่งคำสั่งสมัครบัญชี "${profile.account}" ไปที่จอ`);
      return;
    }

    if (profile.loginSyncPending || cur.username !== profile.account || cur.password !== pw(profile)) {
      const delivered=await evalProfilePort(profile.debugPort, pushJs({ enabled: true, username: profile.account, password: pw(profile), register: false,...(profile.loginSyncPending?{registerDone:true,autoCreateChar:true,autoResumeBot:true}:{}) }), 3000);
      if(delivered?.success&&delivered.result?.success===true)updateProfile(profile.id,{loginSyncPending:false,registerError:''});
    }
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const p of loadProfiles()) {
        try { await syncOne(p); } catch (e) {}
      }
    } finally {
      running = false;
    }
  }

  function start() {
    setTimeout(() => { tick(); setInterval(tick, SYNC_MS); }, 8000);
  }

  return { start, tick };
}

module.exports = { createAuthSync };
