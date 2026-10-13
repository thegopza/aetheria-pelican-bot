'use strict';
// Review R6: the real outbound guard used by PELICAN_TEST_INSTANCE managers.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const https = require('https');
const net = require('net');
const { installTestIsolation, createFixtureRequestJSON } = require('../test_isolation');

test('guard refuses non-fixture destinations (http, https, net, fetch) and allows only listed loopback ports', async t => {
  const fixture = http.createServer((req, res) => {
    let body = ''; req.setEncoding('utf8'); req.on('data', c => { body += c; });
    req.on('end', () => { res.writeHead(req.url === '/bad' ? 409 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/bad' ? { success: false, code: 'FIXTURE_REJECT' } : { success: true, echo: body ? JSON.parse(body) : null, auth: req.headers.authorization || null })); });
  });
  await new Promise(r => fixture.listen(0, '127.0.0.1', r));
  const port = fixture.address().port;
  t.after(() => fixture.close());
  const guard = installTestIsolation({ allowedPorts: [port] });

  const get = (mod, url) => new Promise(resolve => { const r = mod.get(url, res => { res.resume(); resolve('STATUS ' + res.statusCode); }); r.on('error', e => resolve(e.code)); });
  assert.equal(await get(https, 'https://api.github.com/'), 'TEST_OUTBOUND_BLOCKED');
  assert.equal(await get(https, 'https://api.noggunsshop.xyz/v1/aetheria/health'), 'TEST_OUTBOUND_BLOCKED');
  assert.equal(await get(http, 'http://127.0.0.1:49876/api/state'), 'TEST_OUTBOUND_BLOCKED'); // real game debug port
  assert.equal(await get(http, { host: '127.0.0.1', port: 3888, path: '/' }), 'TEST_OUTBOUND_BLOCKED'); // real Manager
  assert.equal(await new Promise(resolve => { const s = net.connect(443, 'example.com'); s.on('error', e => resolve(e.code)); s.on('connect', () => resolve('CONNECTED')); }), 'TEST_OUTBOUND_BLOCKED');
  await assert.rejects(fetch('https://example.com/'), e => e.code === 'TEST_OUTBOUND_BLOCKED');
  assert.equal(await get(http, `http://127.0.0.1:${port}/ok`), 'STATUS 200');
  assert.deepEqual(guard.blocked().map(b => b.host + ':' + b.port + '/' + b.via), [
    'api.github.com:443/https', 'api.noggunsshop.xyz:443/https', '127.0.0.1:49876/http', '127.0.0.1:3888/http', 'example.com:443/net', 'example.com:443/fetch',
  ]);

  // fixture requestJSON keeps the real requestJSON contract
  const request = createFixtureRequestJSON(port);
  assert.deepEqual(await request('/v1/aetheria/offline/sync', { a: 'ภาษาไทย' }, 'f'.repeat(64)), { success: true, echo: { a: 'ภาษาไทย' }, auth: 'Bearer ' + 'f'.repeat(64) });
  await assert.rejects(request('/bad', {}, null), e => e.code === 'FIXTURE_REJECT' && e.status === 409);
});
