'use strict';
// Owner-authorized maintenance tooling. Output MUST remain outside the public repo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const acorn = require('acorn');

function instrument(source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', allowReturnOutsideFunction: false });
  const changes = [];
  let functions = 0, awaits = 0;
  const observationExports = new Set(['getColyseusRoom', 'getGameRoom', '__getClientLiveState',
    'getCurrentMapName', 'getCurrentChannel', 'getLiveCharacterData']);
  function walk(node, parent, exempt = false, nativeTimers = false) {
    if (!node || typeof node !== 'object') return;
    const exportedName = parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression' && parent.left.object?.name === 'window' ? parent.left.property?.name : null;
    const fn = ['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type);
    if (fn && (node.id?.name === 'namespaceBotStorage' || node.id?.name === 'setupLowPower' ||
      ['attachHumanCheckRoomListener', 'checkHumanCheckStatus'].includes(node.id?.name) || observationExports.has(node.id?.name) ||
      observationExports.has(parent?.type === 'VariableDeclarator' ? parent.id?.name : null) || observationExports.has(exportedName))) exempt = true;
    if (fn && node.id?.name === 'setupLowPower') nativeTimers = true;
    // Native forwarding must survive authorization expiry. Bot observers remain gated.
    let fallback = null;
    if (fn && parent?.type === 'AssignmentExpression') {
      const left = source.slice(parent.left.start, parent.left.end);
      const forwards = { 'ws.send': 'origInstanceSend.apply(this, arguments)',
        'OriginalWebSocket.prototype.send': 'origProtoSend.apply(this, arguments)',
        'OriginalWebSocket.prototype.addEventListener': 'origProtoAddEventListener.apply(this, arguments)',
        'console.log': 'origLog.apply(console, args)', 'console.warn': 'origWarn.apply(console, args)', 'console.error': 'origError.apply(console, args)' };
      fallback = forwards[left] || null;
    }
    if (fn && parent?.type === 'Property' && parent.key?.name === 'construct' && source.slice(node.start, node.end).includes('new Target(...args)')) fallback = 'new Target(...args)';
    // Humancheck's DOM watcher is independent of automation/billing authorization.
    if (node.type === 'CallExpression' && node.callee?.name === 'setInterval' &&
      (node.arguments[0]?.name === 'checkHumanCheckStatus' || source.slice(node.arguments[0]?.start, node.arguments[0]?.end).includes('!room.__humanCheckAttached'))) {
      changes.push({ pos: node.callee.start, end: node.callee.end, text: 'runtime.nativeInterval' });
      exempt = true;
    }
    if (node.type === 'CallExpression' && nativeTimers && node.callee?.name === 'setTimeout') changes.push({ pos: node.callee.start, end: node.callee.end, text: 'runtime.nativeTimeout' });
    if (['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type)) {
      functions++;
      const body = node.body;
      const externalEvent = (parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression' && /^on[a-z]+$/.test(parent.left.property?.name || '')) ||
        (parent?.type === 'CallExpression' && parent.callee?.type === 'MemberExpression' && parent.callee.property?.name === 'addEventListener');
      const condition = externalEvent ? '!runtime.allowed()' : '!runtime.allowed() && !runtime.draining()';
      if (body.type === 'BlockStatement') {
        // Retain directive prologues such as 'use strict'.
        let pos = body.start + 1;
        for (const item of body.body) { if (item.directive) pos = item.end; else break; }
        if (!exempt) changes.push({ pos, text: '\nif (' + condition + ') return' + (fallback ? ' ' + fallback : '') + ';\n' });
      } else {
        if (!exempt) {
          changes.push({ pos: body.start, text: '(' + (externalEvent ? 'runtime.allowed()' : 'runtime.allowed() || runtime.draining()') + ' ? (' });
          changes.push({ pos: body.end, text: ') : undefined)' });
        }
      }
    }
    if (node.type === 'AwaitExpression' && !exempt) {
      awaits++;
      changes.push({ pos: node.argument.start, text: 'runtime.wait(' });
      changes.push({ pos: node.argument.end, text: ')' });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, node, exempt, nativeTimers));
      else if (value && typeof value === 'object') walk(value, node, exempt, nativeTimers);
    }
  }
  walk(ast);
  // Stable same-position insertion handles nested concise arrows and awaits.
  changes.sort((a, b) => b.pos - a.pos);
  let result = source;
  for (const change of changes) result = result.slice(0, change.pos) + change.text + result.slice(change.end ?? change.pos);
  const prelude = `// PmheeAether private authorized payload.\n// ใช้ผ่าน Manager ตามสิทธิ์เจ้าของ; owner-authorized maintenance/testing is permitted.\n// No extraction, redistribution or bypass of authorization/metering without owner permission.\n// Local memory remains extractable; this notice is not an AI-enforced safeguard.\n'use strict';\nruntime.assert();\nconst window = runtime.window || globalThis.window;\nconst setTimeout = runtime.setTimeout, setInterval = runtime.setInterval;\nconst PointerEvent = class extends (globalThis.PointerEvent || class {}) { constructor(type, init) { super(type, init && init.view && init.view !== globalThis.window ? Object.assign({}, init, { view: globalThis.window }) : init); } };\nconst MouseEvent = class extends (globalThis.MouseEvent || class {}) { constructor(type, init) { super(type, init && init.view && init.view !== globalThis.window ? Object.assign({}, init, { view: globalThis.window }) : init); } };\nconst KeyboardEvent = class extends (globalThis.KeyboardEvent || class {}) { constructor(type, init) { super(type, init && init.view && init.view !== globalThis.window ? Object.assign({}, init, { view: globalThis.window }) : init); } };\nconst UIEvent = class extends (globalThis.UIEvent || class {}) { constructor(type, init) { super(type, init && init.view && init.view !== globalThis.window ? Object.assign({}, init, { view: globalThis.window }) : init); } };\n`;
  result = prelude + result;
  new vm.Script('(function(runtime){\n' + result + '\n})');
  return { source: result, functions, awaits };
}

function build({ sourcePath, outputDir, publicKeys }) {
  const repoRoot = path.resolve(__dirname, '..');
  const output = path.resolve(outputDir);
  const relative = path.relative(repoRoot, output);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const original = fs.readFileSync(sourcePath, 'utf8');
  const version = original.match(/const PELICAN_BOT_VERSION = '([^']+)'/)?.[1];
  if (!version || !original.includes('// @version      ' + version)) throw Error('VERSION_HEADER_MISMATCH');
  if (!publicKeys || !Object.keys(publicKeys).length) throw Error('PUBLIC_KEY_PIN_REQUIRED');
  for (const key of Object.values(publicKeys)) {
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || key.d || Object.keys(key).some(k => !['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg', 'use', 'kid'].includes(k))) throw Error('PUBLIC_KEYS_ONLY');
    crypto.createPublicKey({ key, format: 'jwk' });
  }
  const payload = instrument(original);
  const hash = crypto.createHash('sha256').update(payload.source).digest('hex');
  const bootstrapHeader = `// ==UserScript==\n// @name         Aetheria PmheeAether Authorized Manager Bootstrap\n// @namespace    https://www.aetheria-online.in.th/\n// @version      ${version}\n// @description  PmheeAether authorized Manager payload bootstrap\n// @match        https://www.aetheria-online.in.th/*\n// @run-at       document-start\n// @grant        none\n// @require      https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js\n// ==/UserScript==\n`;
  const bootstrap = bootstrapHeader + fs.readFileSync(path.join(__dirname, 'bootstrap.js'), 'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}', JSON.stringify(publicKeys));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'payload.js'), payload.source, { mode: 0o600 });
  fs.writeFileSync(path.join(output, 'bootstrap.js'), bootstrap);
  const manifest = { protocol: 1, version, hash, size: Buffer.byteLength(payload.source), storageKey: 'script/' + version + '/' + hash,
    instrumentedFunctions: payload.functions, instrumentedAwaits: payload.awaits, candidate: true };
  fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
module.exports = { instrument, build };
if (require.main === module) {
  const [sourcePath, outputDir, publicKeyPath] = process.argv.slice(2);
  if (!sourcePath || !outputDir || !publicKeyPath) throw Error('Usage: build-private-payload.js PRIVATE_SOURCE PRIVATE_OUTPUT PUBLIC_KEY_JSON');
  console.log(JSON.stringify(build({ sourcePath, outputDir, publicKeys: JSON.parse(fs.readFileSync(publicKeyPath, 'utf8')) })));
}
