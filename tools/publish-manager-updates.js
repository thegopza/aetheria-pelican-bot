'use strict';
// Publish reviewed, COMMITTED Manager files only. Never copy the working tree or private payload.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const SOURCE = path.resolve(__dirname, '..');
const REPO = 'thegopza/aetheria-manager-updates';
const ALLOWLIST = require('./manager-distribution-files.json');
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
function publish(destination, upload = false) {
  validateAllowlist(ALLOWLIST);
  if (!destination || !path.isAbsolute(destination)) throw new Error('Use an absolute distribution checkout path');
  const dest = fs.realpathSync(destination);
  if (dest === SOURCE || dest.startsWith(SOURCE + path.sep)) throw new Error('Distribution must be outside the source checkout');
  if (fs.realpathSync(git(['rev-parse', '--show-toplevel'], dest).trim()) !== dest) throw new Error('Use the checkout root');
  const remote = git(['remote', 'get-url', 'origin'], dest).trim();
  if (remote !== `https://github.com/${REPO}.git` && remote !== `git@github.com:${REPO}.git`) throw new Error('Unexpected distribution remote');
  if (git(['status', '--porcelain'], dest).trim()) throw new Error('Distribution checkout has pending changes');
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-manager-distribution-'));
  const written = [];
  function write(name, bytes) {
    if (!safePath(name)) throw new Error(`Unsafe path: ${name}`);
    const target = path.join(dest, name);
    for (let current = target; current !== dest; current = path.dirname(current)) {
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Distribution symlink is forbidden');
    }
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
  const zipInput = path.join(temp, 'source.zip');
  fs.writeFileSync(zipInput, git(['show', `${sourceCommit}:release/Pelican_Manager_v4.3.zip`], SOURCE, true));
  const zipOutput = path.join(temp, 'manager.zip');
  // Keep only launcher/runtime assets from the old package; Manager files come from the same commit.
  const zipCommand = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$inputZip = [IO.Compression.ZipFile]::OpenRead($env:PMHEE_DIST_INPUT)
$outZip = [IO.Compression.ZipFile]::Open($env:PMHEE_DIST_OUTPUT, [IO.Compression.ZipArchiveMode]::Create)
try {
  $assets = @('main.js','package.json','pelican.ico','PelicanManager.exe','Start_Pelican.bat','คู่มือการใช้งาน.txt','bin/node.exe','manager/data/item_catalog.json')
  foreach ($asset in $assets) {
    $entry = $inputZip.Entries | Where-Object { $_.FullName.Replace('\\','/') -eq ('Pelican_Manager_v4.3/' + $asset) }
    if (!$entry) { throw ('Missing package asset: ' + $asset) }
    $created = $outZip.CreateEntry('Pelican_Manager_v4.3/' + $asset)
    $from = $entry.Open(); $to = $created.Open()
    try { $from.CopyTo($to) } finally { $from.Dispose(); $to.Dispose() }
  }
  $files = Get-Content -LiteralPath $env:PMHEE_DIST_LIST -Raw | ConvertFrom-Json
  foreach ($name in $files) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($outZip, (Join-Path $env:PMHEE_DIST_DEST $name), ('Pelican_Manager_v4.3/' + $name)) | Out-Null
  }
} finally { $inputZip.Dispose(); $outZip.Dispose() }
$verifiedZip = [IO.Compression.ZipFile]::OpenRead($env:PMHEE_DIST_OUTPUT)
try {
  if ($verifiedZip.Entries.Count -ne ($files.Count + $assets.Count)) { throw 'Package entry count mismatch' }
  foreach ($name in $files) {
    $entry = $verifiedZip.GetEntry('Pelican_Manager_v4.3/' + $name)
    if (!$entry) { throw ('Missing runtime entry: ' + $name) }
    $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ne (Get-FileHash -LiteralPath (Join-Path $env:PMHEE_DIST_DEST $name) -Algorithm SHA256).Hash) { throw ('Runtime hash mismatch: ' + $name) }
  }
} finally { $verifiedZip.Dispose() }
`;
  const listFile = path.join(temp, 'files.json');
  fs.writeFileSync(listFile, JSON.stringify(ALLOWLIST));
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', zipCommand], {
    env: { ...process.env, PMHEE_DIST_INPUT: zipInput, PMHEE_DIST_OUTPUT: zipOutput, PMHEE_DIST_DEST: dest, PMHEE_DIST_LIST: listFile }, stdio: 'pipe'
  });
  write('release/Pelican_Manager_v4.3.zip', fs.readFileSync(zipOutput));
  write('README.md', '# PmheeAether Manager updates\n\nPublic distribution channel. Generated from reviewed, committed Manager runtime files; do not edit this checkout as development source.\n\nDownload [Manager ZIP](release/Pelican_Manager_v4.3.zip). Private bot payloads are obtained through the owner API and signed local cache, and are not included here. Legacy clients must migrate before the old source repository becomes private.\n');
  const previous = path.join(dest, 'distribution.json');
  const stale = fs.existsSync(previous) ? JSON.parse(fs.readFileSync(previous, 'utf8')).files.map(f => f.path).filter(n => !written.includes(n)) : [];
  for (const name of stale) {
    if (!safePath(name)) throw new Error('Unsafe previous manifest path');
    const target = path.join(dest, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Distribution symlink is forbidden');
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
module.exports = { validateAllowlist, safePath, publish };
if (require.main === module) {
  try { console.log(JSON.stringify(publish(process.argv[2], process.argv.includes('--publish')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
