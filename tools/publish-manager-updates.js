'use strict';
// Publish reviewed, COMMITTED Manager files only. Never copy the working tree or private payload.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const SOURCE = path.resolve(__dirname, '..');
const REPO = 'thegopza/aetheria-manager-updates';

function git(args, cwd = SOURCE, binary = false) {
  return execFileSync('git', args, { cwd, encoding: binary ? undefined : 'utf8', maxBuffer: 150 * 1024 * 1024 });
}
function safePath(name) {
  return typeof name === 'string' && !name.includes('..') && !name.includes('\\') &&
    /^(manager\/[A-Za-z0-9_./-]+|release\/Pelican_Manager_v4\.3\.zip|README\.md|distribution\.json)$/.test(name);
}
function validateAllowlist(files) {
  if (new Set(files).size !== files.length) throw new Error('Duplicate distribution path');
  for (const name of files) {
    if (!safePath(name) || !name.startsWith('manager/') ||
        /(^|\/)(bot\.js|data|sessions|tests|profiles\.json|plans\.json|presets\.json|settings\.json|protected-script|offline-cache)(\/|$)/.test(name)) {
      throw new Error(`Forbidden distribution path: ${name}`);
    }
  }
}
function guardedTarget(dest, name) {
  if (!safePath(name)) throw new Error(`Unsafe path: ${name}`);
  const target = path.join(dest, name);
  for (let current = target; current !== dest; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Distribution symlink is forbidden');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
function publish(destination, upload = false) {

  if (!destination || !path.isAbsolute(destination)) throw new Error('Use an absolute distribution checkout path');
  const dest = fs.realpathSync(destination);
  if (dest === SOURCE || dest.startsWith(SOURCE + path.sep)) throw new Error('Distribution must be outside the source checkout');
  if (fs.realpathSync(git(['rev-parse', '--show-toplevel'], dest).trim()) !== dest) throw new Error('Use the checkout root');
  const remote = git(['remote', 'get-url', 'origin'], dest).trim();
  if (remote !== `https://github.com/${REPO}.git` && remote !== `git@github.com:${REPO}.git`) throw new Error('Unexpected distribution remote');
  if (git(['status', '--porcelain'], dest).trim()) throw new Error('Distribution checkout has pending changes');
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  const ALLOWLIST = JSON.parse(git(['show', sourceCommit + ':tools/manager-distribution-files.json']));
  validateAllowlist(ALLOWLIST);
  const written = [];
  function write(name, bytes) {
    const target = guardedTarget(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    written.push(name);
  }
  for (const name of ALLOWLIST) {
    const bytes = git(['show', `${sourceCommit}:${name}`], SOURCE, true);
    if (bytes.includes(Buffer.from('-----BEGIN PRIVATE KEY-----')) || bytes.includes(Buffer.from('-----BEGIN EC PRIVATE KEY-----'))) throw new Error(`Private key detected: ${name}`);
    write(name, bytes);
    if (name.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(dest, name)]);
  }
    write('README.md', '# PmheeAether Manager updates\n\nPublic automatic-update channel. Generated from reviewed, committed Manager runtime files; do not edit this checkout as development source.\n\nThis is not an installer package. Existing Managers receive the transition update from the original repository while it is temporarily public. Offline or outdated clients must obtain the installation ZIP from the owner before that repository becomes private. Private bot source/payloads and customer state are not distributed here. Private bots use the owner API and signed local cache.\n');
const previous = path.join(dest, 'distribution.json');
  guardedTarget(dest, 'distribution.json');
  const stale = fs.existsSync(previous) ? JSON.parse(fs.readFileSync(previous, 'utf8')).files.map(f => f.path).filter(n => !written.includes(n)) : [];
  for (const name of stale) {
    const target = guardedTarget(dest, name);
    fs.rmSync(target, { force: true });
  }
  const manifest = { schema: 1, sourceCommit, files: written.map(name => ({ path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dest, name))).digest('hex') })) };
  write('distribution.json', JSON.stringify(manifest, null, 2) + '\n');
  if (upload) {
    git(['checkout', '-B', 'main'], dest);
    git(['add', '--', ...written, ...stale], dest);
    if (git(['diff', '--cached', '--name-only'], dest).trim()) git(['commit', '-m', `release(manager): distribution from ${sourceCommit.slice(0, 7)}`], dest);
    git(['push', '-u', 'origin', 'main'], dest);
  }
  return { sourceCommit, files: written.length, checkout: dest, uploaded: upload };
}
module.exports = { validateAllowlist, safePath, guardedTarget, publish };
if (require.main === module) {
  try { console.log(JSON.stringify(publish(process.argv[2], process.argv.includes('--publish')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
