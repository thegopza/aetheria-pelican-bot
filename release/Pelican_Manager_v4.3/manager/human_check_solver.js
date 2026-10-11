// PmheeAether CAPTCHA client. Wallet, redemption and matching live on the server.
// Never accept a local balance/signature as payment authorization.
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

function getMachineFingerprint() {
  let identity = os.hostname().toUpperCase();
  try {
    const output = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', windowsHide: true });
    identity = output.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)?.[1]?.toUpperCase() || identity;
  } catch (_) {}
  return crypto.createHash('sha256').update('PMhee.MachineFingerprint.v1|' + identity).digest('hex').toUpperCase();
}
function createHumanCheckSolver({ dataDir, requestJSON: testRequest, serviceUrl: testServiceUrl } = {}) {
  const settingsFile = path.join(dataDir, 'human_check_settings.json');
  const accountFile = path.join(dataDir, 'aetheria_service_account.json');
  fs.mkdirSync(dataDir, { recursive: true });
  const base = new URL(testServiceUrl || process.env.PMHEE_AETHERIA_API_URL || 'https://api.noggunsshop.xyz');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('CAPTCHA service requires an HTTPS origin');
  }
  const machineHwid = getMachineFingerprint();
  const machineName = os.hostname();
  const managerSessionId = crypto.randomUUID();
  let points = 0;
  let pointsPerSolve = 1;
  let topupHistory = [];
  let serviceAvailable = false;
  let account = null;
  let enrollment = null;
  try {
    const saved = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
    if (saved.origin === base.origin && /^[a-f0-9]{64}$/.test(saved.token || '') && typeof saved.accountId === 'string') account = saved;
  } catch (_) {}
  function atomicWrite(file, data) {
    fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (_) {}
    return {
      autoAnswer: s.autoAnswer !== false,
      answerDelayMs: Math.max(800, Math.min(10000, parseInt(s.answerDelayMs, 10) || 1800)),
      pointSystemEnabled: true, points, pointsPerSolve, pointsPerBaht: 1,
      machineHwid, topupHistory, serviceAvailable, serviceOrigin: base.origin,
      accountId: account?.accountId || null
    };
  }
  function saveSettings(s) {
    const current = loadSettings();
    // Preserve old local records for support; their balances never authorize a solve.
    let prior = {};
    try { prior = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (_) {}
    atomicWrite(settingsFile, {
      ...prior,
      autoAnswer: typeof s.autoAnswer === 'boolean' ? s.autoAnswer : current.autoAnswer,
      answerDelayMs: Math.max(800, Math.min(10000, parseInt(s.answerDelayMs ?? current.answerDelayMs, 10) || 1800))
    });
    return loadSettings();
  }
  const requestJSON = testRequest || ((route, payload, token) => new Promise((resolve, reject) => {
    const data = payload == null ? null : JSON.stringify(payload);
    const headers = { 'Accept': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request(new URL(route, base), { method: data ? 'POST' : 'GET', headers, timeout: 15000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('error', reject);
      res.on('data', c => {
        body += c;
        if (Buffer.byteLength(body) > 131072) res.destroy(new Error('Service response too large'));
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(typeof result.message === 'string' ? result.message : 'CAPTCHA service rejected request');
            error.status = res.statusCode;
            return reject(error);
          }
          resolve(result);
        } catch (_) { reject(new Error('Invalid CAPTCHA service response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('CAPTCHA service timeout')));
    req.end(data || undefined);
  }));
  async function ensureAccount() {
    if (account) return account;
    if (!enrollment) enrollment = (async () => {
      const result = await requestJSON('/v1/aetheria/enroll', { machineHwid, machineName }, null);
      if (!result?.success || typeof result.accountId !== 'string' || !/^[a-f0-9]{64}$/.test(result.token || '')) throw new Error('Invalid account enrollment');
      const saved = { origin: base.origin, accountId: result.accountId, token: result.token };
      atomicWrite(accountFile, saved);
      account = saved;
      return account;
    })().finally(() => { enrollment = null; });
    return enrollment;
  }
  async function call(route, payload) {
    const credential = await ensureAccount();
    try {
      const result = await requestJSON(route, payload, credential.token);
      serviceAvailable = true;
      return result;
    } catch (e) { serviceAvailable = false; throw e; }
  }
  function updateBalance(result) {
    const balance = result.points ?? result.remaining ?? result.totalPoints;
    if (Number.isSafeInteger(balance) && balance >= 0) points = balance;
    if (result.pointsPerSolve === 0 || result.pointsPerSolve === 1) pointsPerSolve = result.pointsPerSolve;
    if (Array.isArray(result.topupHistory)) topupHistory = result.topupHistory;
  }
  async function refreshBalance() {
    try {
      const result = await call('/v1/aetheria/balance');
      if (!result?.success || !Number.isSafeInteger(result.points) || result.points < 0) throw new Error('Invalid balance');
      updateBalance(result);
    } catch (_) { serviceAvailable = false; }
    return loadSettings();
  }
  async function solveHumanCheck(prompt, options = [], items = null, requestId = crypto.randomUUID()) {
    try {
      const result = await call('/v1/aetheria/solve', { requestId, prompt, options, items });
      if (!result?.success || ![0, 1].includes(result.charged) || result.requestId !== requestId ||
          !Number.isInteger(result.pickIndex) || result.pickIndex < 0 || result.pickIndex > 5 ||
          result.pickIndex >= Math.max(options.length, items?.length || 0) ||
          !Number.isSafeInteger(result.remaining) || result.remaining < 0) {
        return { success: false, reason: 'ไม่สามารถยืนยันคำตอบและการหัก Point จากเซิร์ฟเวอร์' };
      }
      updateBalance(result);
      return result;
    } catch (e) { return { success: false, reason: e.message }; }
  }
  async function reportSecurityEvent(kind, context = {}) {
    if (!['local_credit_override', 'offline_solver_probe'].includes(kind)) return false;
    const clientContext = { machineName, sessionId: managerSessionId };
    if (typeof context.profileId === 'string') clientContext.profileId = context.profileId.slice(0, 128);
    try {
      const result = await call('/v1/aetheria/security/report', { kind, clientContext });
      return result?.success === true;
    } catch (_) { return false; }
  }
  // Retained compatibility entry point for older offline-credit integrations.
  // It never grants local credits; the service rejects unsupported recovery requests.
  async function recoverOfflineCredit(points, context = {}) {
    try {
      await call('/v1/aetheria/admin/add-points', { points, adminToken: 'pmhee-legacy-offline-recovery-v1', clientContext: { machineName, sessionId: managerSessionId, profileId: typeof context.profileId === 'string' ? context.profileId.slice(0, 128) : undefined } });
    } catch (_) {}
    return { success: false, error: 'การกู้ Point แบบออฟไลน์ไม่รองรับ' };
  }
  async function redeemTrueMoneyVoucher(voucherUrl) {
    try {
      const result = await call('/v1/aetheria/topup', { voucherUrl });
      if (result?.success) { updateBalance(result); await refreshBalance(); }
      return result;
    } catch (e) { return { success: false, message: e.message }; }
  }
  return {
    isRemoteService: true, loadSettings, saveSettings,
    publicSettings: (s = loadSettings()) => Object.fromEntries([
      'autoAnswer', 'answerDelayMs', 'pointSystemEnabled', 'points', 'pointsPerSolve',
      'pointsPerBaht', 'machineHwid', 'topupHistory', 'serviceAvailable', 'serviceOrigin', 'accountId'
    ].map(key => [key, s[key]])),
    refreshBalance, solveHumanCheck, redeemTrueMoneyVoucher, getMachineFingerprint, reportSecurityEvent, recoverOfflineCredit,
    // A client must never mint, debit or refund credit locally.
    addPoints: () => ({ success: false, error: 'เติม Point ได้ผ่านเซิร์ฟเวอร์เท่านั้น' }),
    deductPoints: () => ({ success: false, error: 'เซิร์ฟเวอร์เป็นผู้หัก Point' }),
    isReady: () => serviceAvailable
  };
}
module.exports = { createHumanCheckSolver };
