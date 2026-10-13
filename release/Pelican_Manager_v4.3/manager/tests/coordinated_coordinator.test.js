'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { createHumanCheckSolver } = require('../human_check_solver');
const { createOfflineCoordinator } = require('../offline_coordinator');
const { createScriptCoordinator } = require('../script_coordinator');
const { createOfflinePayloadCache } = require('../offline_payload_cache');
const { createCoordinatedScriptCoordinator } = require('../coordinated_coordinator');

function generateFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-coord-test-'));
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const source = '/* signed runtime source fixture */\nwindow.__pmTestLoaded = true;';
  const claims = {
    protocol: 2,
    mode: 'friends-offline',
    version: '4.38.0',
    payloadHash: crypto.createHash('sha256').update(source).digest('hex'),
    size: Buffer.byteLength(source),
    issuedAt: Date.now()
  };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const envelope = {
    keyId: 'test-key',
    claims: encoded,
    signature: crypto.sign('sha256', Buffer.from('PmheeAether.offline-release.v1\n' + encoded), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363'
    }).toString('base64url')
  };
  const trustedKeys = {
    'test-key': keys.publicKey.export({ format: 'jwk' })
  };
  return { dataDir, keys, source, claims, envelope, trustedKeys };
}

test('R6.1: health route passes serviceRequest whitelist while unknown routes are rejected', async () => {
  const { dataDir } = generateFixture();
  let requestedRoute = null;

  const mockRequestJSON = async (route, payload, token) => {
    requestedRoute = route;
    if (route === '/v1/aetheria/enroll') {
      return { success: true, accountId: 'acc-1', token: 'a'.repeat(64) };
    }
    if (route === '/v1/aetheria/health') {
      return { success: true, schemaVersion: 'owner-v1' };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  // 1. /v1/aetheria/health must be allowed
  const healthRes = await solver.serviceRequest('/v1/aetheria/health');
  assert.equal(requestedRoute, '/v1/aetheria/health');
  assert.equal(healthRes.schemaVersion, 'owner-v1');

  // 2. Unsupported route without proper prefix/subpath must throw
  assert.throws(() => {
    solver.serviceRequest('/v1/aetheria/unsupported-endpoint');
  }, /Unsupported coordinator route/);

  assert.throws(() => {
    solver.serviceRequest('/v1/aetheria/health/extra');
  }, /Unsupported coordinator route/);
});

test('R6.2: starts before host is ready, then detects owner host later via periodic cycle', async () => {
  const fixture = generateFixture();
  let hostReady = false;
  let healthChecks = 0;

  const mockRequestJSON = async (route, payload, token) => {
    if (route === '/v1/aetheria/enroll') {
      return { success: true, accountId: 'acc-test', token: 'b'.repeat(64) };
    }
    if (route === '/v1/aetheria/health') {
      healthChecks++;
      if (!hostReady) {
        throw new Error('ECONNREFUSED');
      }
      return { success: true, schemaVersion: 'owner-v1' };
    }
    if (route === '/v1/aetheria/balance') {
      return { success: true, schemaVersion: 2, unitScale: 100, balanceUnits: 15000, points: 150 };
    }
    if (route === '/v1/aetheria/offline/manifest') {
      return {
        success: true,
        envelope: fixture.envelope,
        chunked: true,
        chunkCount: 1,
        version: fixture.claims.version,
        hash: fixture.claims.payloadHash,
        size: fixture.claims.size
      };
    }
    if (route === '/v1/aetheria/offline/payload-chunk') {
      return {
        success: true,
        version: fixture.claims.version,
        hash: fixture.claims.payloadHash,
        chunks: [{ ordinal: 0, source: fixture.source }]
      };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  const legacyCoordinator = createScriptCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver
  });

  const offlineCoordinator = createOfflineCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver,
    trustedKeys: fixture.trustedKeys,
    legacyCoordinator,
    autoBindWallet: false
  });

  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-test' }),
    dataDir: fixture.dataDir,
    intervalMs: 100
  });

  // Initially host is not ready
  assert.equal(coordinated.determineMode(), 'legacy');
  await coordinated.cycle();
  assert.equal(coordinated.determineMode(), 'legacy');
  assert.equal(healthChecks, 1);

  // Now host becomes ready
  hostReady = true;
  await coordinated.cycle();
  assert.equal(healthChecks, 2);
  assert.equal(coordinated.determineMode(), 'offline');

  coordinated.stop();
});

test('R6.2: maintenance mode does not activate offline coordinator', async () => {
  const fixture = generateFixture();

  const mockRequestJSON = async (route) => {
    if (route === '/v1/aetheria/enroll') {
      return { success: true, accountId: 'acc-maint', token: 'c'.repeat(64) };
    }
    if (route === '/v1/aetheria/health') {
      // In maintenance mode, health indicates maintenance: true or error
      return { success: true, schemaVersion: 'owner-v1', maintenance: true };
    }
    if (route === '/v1/aetheria/balance') {
      return { success: true, points: 50 };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  const legacyCoordinator = createScriptCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver
  });

  const offlineCoordinator = createOfflineCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver,
    trustedKeys: fixture.trustedKeys,
    legacyCoordinator,
    autoBindWallet: false
  });

  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-maint' }),
    dataDir: fixture.dataDir
  });

  await coordinated.cycle();
  // Maintenance must NOT activate offline mode
  assert.equal(coordinated.determineMode(), 'legacy');
  assert.equal(coordinated.status().coordinatorMode, 'legacy');
});

test('R6.2: mode transition creates no duplicate timers and stop shuts down cleanly', async () => {
  const fixture = generateFixture();
  let hostReady = false;

  const mockRequestJSON = async (route) => {
    if (route === '/v1/aetheria/enroll') return { success: true, accountId: 'acc-timer', token: 'd'.repeat(64) };
    if (route === '/v1/aetheria/health') {
      return hostReady ? { success: true, schemaVersion: 'owner-v1' } : { success: false };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  let legacyStarts = 0, legacyStops = 0;
  const legacyCoordinator = {
    start() { legacyStarts++; },
    stop() { legacyStops++; },
    cycle: async () => {},
    status: () => ({ success: true, mode: 'observation' })
  };

  let offlineStarts = 0, offlineStops = 0;
  const offlineCoordinator = {
    start() { offlineStarts++; },
    stop() { offlineStops++; },
    cycle: async () => {},
    status: () => ({ success: true, mode: 'friends-offline' }),
    bindWallet() {},
    detachWallet() {}
  };

  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-timer' }),
    dataDir: fixture.dataDir,
    intervalMs: 50
  });

  // 1. Initial cycle when host is not ready
  await coordinated.cycle();
  assert.equal(coordinated.determineMode(), 'legacy');

  // 2. Start the coordinated wrapper
  coordinated.start();
  // The wrapper must drive cycles itself; it MUST NOT call underlying start() which would spawn duplicate timers!
  assert.equal(legacyStarts, 0, 'legacyCoordinator.start() must NOT be called by wrapper');
  assert.equal(offlineStarts, 0, 'offlineCoordinator.start() must NOT be called by wrapper');

  // 3. Transition to offline mode while running
  hostReady = true;
  for (let i = 0; i < 30 && coordinated.determineMode() !== 'offline'; i++) {
    await new Promise(r => setTimeout(r, 20));
  }
  assert.equal(coordinated.determineMode(), 'offline');
  assert.equal(offlineStarts, 0, 'No underlying timer spawned on transition');

  // 4. Stop shuts down cleanly
  coordinated.stop();
  assert.equal(legacyStops, 1);
  assert.equal(offlineStops, 1);
});

test('R6.2: restart while host is offline retains verified signed cache and offline debt mode', async () => {
  const fixture = generateFixture();

  // Save signed payload in cache beforehand
  createOfflinePayloadCache(fixture).save({
    source: fixture.source,
    envelope: fixture.envelope
  });

  const mockRequestJSON = async (route) => {
    if (route === '/v1/aetheria/enroll') return { success: true, accountId: 'acc-persist', token: 'e'.repeat(64) };
    if (route === '/v1/aetheria/health') {
      // Host is offline!
      throw new Error('NETWORK_DOWN');
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  // Simulate that activation was previously recorded when host was online
  const activationFile = path.join(fixture.dataDir, 'script_coordinator_activation.json');
  fs.writeFileSync(activationFile, JSON.stringify({
    accountId: 'acc-persist',
    serviceOrigin: 'https://api.test.example',
    schemaVersion: 'owner-v1',
    activatedAt: Date.now() - 60000
  }), 'utf8');

  const legacyCoordinator = createScriptCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver
  });

  const offlineCoordinator = createOfflineCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver,
    trustedKeys: fixture.trustedKeys,
    legacyCoordinator,
    autoBindWallet: false
  });

  // Verify that offline release is loaded from cache
  const release = offlineCoordinator.release();
  assert.ok(release && release.version === '4.38.0');

  // Create fresh coordinated coordinator (simulating restart)
  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-persist' }),
    dataDir: fixture.dataDir
  });

  // Even though host is offline, it remembers activation and retains offline mode
  assert.equal(coordinated.determineMode(), 'offline');
  assert.equal(coordinated.status().coordinatorMode, 'offline');

  // Bot source is available from offline coordinator
  const src = coordinated.profileScriptSource('p1');
  assert.ok(src && src.includes('__pmScriptBootstrap'));

  // If credentials change (different accountId), it must NOT use old activation
  const mismatchCoordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-DIFFERENT' }),
    dataDir: fixture.dataDir
  });
  assert.equal(mismatchCoordinated.determineMode(), 'legacy');

  // If forced legacy via settings, it must stay legacy
  const forcedLegacyCoordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-persist', offlineCoordinatorEnabled: false }),
    dataDir: fixture.dataDir
  });
  assert.equal(forcedLegacyCoordinated.determineMode(), 'legacy');
});

test('R6.3: legacy balance and topup are not hijacked by offlineWallet before activation', async () => {
  const fixture = generateFixture();
  let balanceCalled = 0;
  let topupCalled = 0;
  let syncCalled = 0;
  let currentBalanceUnits = 25000;

  const mockRequestJSON = async (route, payload) => {
    if (route === '/v1/aetheria/enroll') return { success: true, accountId: 'acc-wallet', token: 'f'.repeat(64) };
    if (route === '/v1/aetheria/balance') {
      balanceCalled++;
      return { success: true, schemaVersion: 2, unitScale: 100, balanceUnits: currentBalanceUnits, points: currentBalanceUnits / 100 };
    }
    if (route === '/v1/aetheria/topup') {
      topupCalled++;
      currentBalanceUnits = 30000;
      return { success: true, schemaVersion: 2, unitScale: 100, balanceUnits: 30000, points: 300 };
    }
    if (route === '/v1/aetheria/offline/sync') {
      syncCalled++;
      return { success: true, batchId: 'b1', ackEventIds: [], balanceUnits: 30000, unitScale: 100, rateUnits: 100, walletRevision: 1 };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  const legacyCoordinator = createScriptCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver
  });

  // Offline coordinator created with autoBindWallet: false (as in server.js)
  const offlineCoordinator = createOfflineCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver,
    trustedKeys: fixture.trustedKeys,
    legacyCoordinator,
    autoBindWallet: false
  });

  // Coordinated coordinator starts in legacy mode
  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-wallet', offlineCoordinatorEnabled: false }),
    dataDir: fixture.dataDir
  });

  assert.equal(coordinated.determineMode(), 'legacy');

  // 1. refreshBalance in legacy mode must call /v1/aetheria/balance
  await solver.refreshBalance();
  assert.equal(balanceCalled, 1, 'Legacy balance must call /v1/aetheria/balance');
  assert.equal(solver.loadSettings().balanceUnits, 25000);

  // 2. topup in legacy mode must NOT call offline/sync
  const topupRes = await solver.redeemTrueMoneyVoucher('https://gift.truemoney.com/campaign/?v=voucher123');
  assert.equal(topupRes.success, true);
  assert.equal(topupCalled, 1);
  assert.equal(syncCalled, 0, 'Legacy topup must NOT trigger offline/sync');
  assert.equal(solver.loadSettings().balanceUnits, 30000);

  // 3. Journal updates when inactive must NOT corrupt legacy points/balance
  solver.applyOfflineBalance(99999);
  assert.equal(solver.loadSettings().balanceUnits, 30000, 'Inactive offline journal must not overwrite balance');
});

test('R6.2: stop during in-flight health request does not restart timer or resume cycle', async () => {
  const fixture = generateFixture();
  let healthResolve = null;
  let inFlightHealthPromise = false;

  const mockRequestJSON = async (route) => {
    if (route === '/v1/aetheria/enroll') return { success: true, accountId: 'acc-stop', token: 'f'.repeat(64) };
    if (route === '/v1/aetheria/health') {
      if (!inFlightHealthPromise) return { success: true, schemaVersion: 'owner-v1' };
      return new Promise((resolve) => {
        healthResolve = resolve;
      });
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  // Pre-enroll to ensure health request is dispatched immediately on cycle
  await solver.serviceRequest('/v1/aetheria/health');

  let cycleCount = 0;
  const legacyCoordinator = {
    start() {},
    stop() {},
    cycle: async () => { cycleCount++; },
    status: () => ({ success: true, mode: 'observation' })
  };

  const offlineCoordinator = {
    start() {},
    stop() {},
    cycle: async () => { cycleCount++; },
    status: () => ({ success: true, mode: 'friends-offline' }),
    bindWallet() {},
    detachWallet() {}
  };

  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ accountId: 'acc-stop' }),
    dataDir: fixture.dataDir,
    intervalMs: 50
  });

  // Arm in-flight health promise
  inFlightHealthPromise = true;

  // Start wrapper — this initiates cycle which waits on health request
  coordinated.start();

  // Wait for health request to be in-flight
  for (let i = 0; i < 50 && !healthResolve; i++) {
    await new Promise(r => setTimeout(r, 10));
  }

  assert.ok(healthResolve, 'Health request should be in-flight');

  // Stop wrapper while health request is in flight
  coordinated.stop();

  // Now resolve the in-flight health request
  healthResolve({ success: true, schemaVersion: 'owner-v1' });

  // Wait a short time to verify timer is not restarted
  await new Promise(r => setTimeout(r, 120));

  // Cycle count should not continue ticking
  const countAfterStop = cycleCount;
  await new Promise(r => setTimeout(r, 120));
  assert.equal(cycleCount, countAfterStop, 'No cycles should run after stop');
});
test('R7.1: server wiring shape without accountId in installer settings saves durable activation and restores offline mode', async () => {
  const fixture = generateFixture();

  // Save signed payload in cache beforehand
  createOfflinePayloadCache(fixture).save({
    source: fixture.source,
    envelope: fixture.envelope
  });

  let hostOnline = true;
  let currentEnrolledAccountId = 'acc-server-wiring-real';

  const mockRequestJSON = async (route, payload) => {
    if (route === '/v1/aetheria/enroll') {
      return { success: true, accountId: currentEnrolledAccountId, token: 'a'.repeat(64) };
    }
    if (route === '/v1/aetheria/health') {
      if (!hostOnline) throw new Error('OFFLINE_NETWORK');
      return { success: true, schemaVersion: 'owner-v1' };
    }
    if (route === '/v1/aetheria/balance') {
      return { success: true, points: 100 };
    }
    return { success: true };
  };

  const solver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });

  // Pre-enroll solver so humanCheckSolver.loadSettings().accountId exists
  await solver.refreshBalance();
  assert.equal(solver.loadSettings().accountId, 'acc-server-wiring-real');

  // Exact installer settings shape from installer.loadSettings(): NO accountId!
  const installerSettings = {
    gamePath: 'C:\\Users\\golf\\AppData\\Local\\Programs\\Aetheria Online',
    launchMode: 'browser'
  };
  assert.equal(installerSettings.accountId, undefined, 'installer settings must have no accountId');

  const legacyCoordinator = createScriptCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver
  });

  const offlineCoordinator = createOfflineCoordinator({
    dataDir: fixture.dataDir,
    loadProfiles: () => [],
    evalProfilePort: async () => ({ success: true, result: {} }),
    service: solver,
    trustedKeys: fixture.trustedKeys,
    legacyCoordinator,
    autoBindWallet: false
  });

  // Wiring matching server.js:
  // getSettings: () => ({ ...installer.loadSettings(), accountId: humanCheckSolver.loadSettings()?.accountId || null })
  const coordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ ...installerSettings, accountId: solver.loadSettings()?.accountId || null }),
    dataDir: fixture.dataDir
  });

  // 1. Initial cycle when host is online detects owner host
  await coordinated.cycle();
  assert.equal(coordinated.determineMode(), 'offline');

  // Check that durable activation was saved with accountId and origin
  const activationFile = path.join(fixture.dataDir, 'script_coordinator_activation.json');
  assert.ok(fs.existsSync(activationFile), 'script_coordinator_activation.json must be saved');
  const saved = JSON.parse(fs.readFileSync(activationFile, 'utf8'));
  assert.equal(saved.accountId, 'acc-server-wiring-real');
  assert.equal(saved.serviceOrigin, 'https://api.test.example');
  assert.equal(saved.schemaVersion, 'owner-v1');

  // 2. Restart while host is offline
  hostOnline = false;
  const restartedCoordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => ({ ...installerSettings, accountId: solver.loadSettings()?.accountId || null }),
    dataDir: fixture.dataDir
  });

  assert.equal(restartedCoordinated.determineMode(), 'offline', 'restarted coordinator must retain offline mode while host is offline');

  // Also verify pure installer settings (fallback to service.loadSettings().accountId)
  const fallbackCoordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: solver,
    getSettings: () => installerSettings,
    dataDir: fixture.dataDir
  });
  assert.equal(fallbackCoordinated.determineMode(), 'offline', 'fallback to service.loadSettings() must also retain offline mode');

  // 3. Credential change: changing accountId must reject old activation
  currentEnrolledAccountId = 'acc-different-new-user';
  const accountFile = path.join(fixture.dataDir, 'aetheria_service_account.json');
  fs.writeFileSync(accountFile, JSON.stringify({
    origin: 'https://api.test.example',
    accountId: 'acc-different-new-user',
    token: 'b'.repeat(64)
  }), 'utf8');

  // Solver now reports the new accountId
  const newSolver = createHumanCheckSolver({
    dataDir: fixture.dataDir,
    requestJSON: mockRequestJSON,
    serviceUrl: 'https://api.test.example'
  });
  assert.equal(newSolver.loadSettings().accountId, 'acc-different-new-user');

  const changedAccountCoordinated = createCoordinatedScriptCoordinator({
    legacyCoordinator,
    offlineCoordinator,
    service: newSolver,
    getSettings: () => ({ ...installerSettings, accountId: newSolver.loadSettings()?.accountId || null }),
    dataDir: fixture.dataDir
  });

  assert.equal(changedAccountCoordinated.determineMode(), 'legacy', 'changed account must reject previous account activation');
});
