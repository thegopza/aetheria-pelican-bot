'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { build } = require('./build-private-payload');

// Private artifacts only. Encryption-at-rest belongs to Manager, never to this public builder.
function buildOffline({ sourcePath, outputDir, publicKeys, signingJwk, keyId, issuedAt = Date.now() }) {
  if (!signingJwk?.d || signingJwk.kty !== 'EC' || signingJwk.crv !== 'P-256' || !publicKeys?.[keyId]) throw Error('SIGNING_KEY_REQUIRED');
  const privateKey = crypto.createPrivateKey({ key: signingJwk, format: 'jwk' });
  const actual = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
  if (actual.x !== publicKeys[keyId].x || actual.y !== publicKeys[keyId].y) throw Error('SIGNING_KEY_PIN_MISMATCH');
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1) throw Error('INVALID_ISSUED_AT');
  const base = build({ sourcePath, outputDir, publicKeys });
  const claims = Buffer.from(JSON.stringify({ protocol: 2, mode: 'friends-offline', version: base.version, payloadHash: base.hash, size: base.size, issuedAt })).toString('base64url');
  const signature = crypto.sign('sha256', Buffer.from('PmheeAether.offline-release.v1\n' + claims), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const release = { keyId, claims, signature };
  const bootstrap = fs.readFileSync(path.join(__dirname, 'offline_bootstrap.js'), 'utf8').replace('/* PMHEE_PUBLIC_KEYS */ {}', JSON.stringify(publicKeys));
  fs.writeFileSync(path.join(outputDir, 'bootstrap.js'), bootstrap);
  fs.writeFileSync(path.join(outputDir, 'offline-release.json'), JSON.stringify(release, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(outputDir, 'release.json'), JSON.stringify({ ...base, protocol: 2, mode: 'friends-offline' }, null, 2));
  return { ...base, protocol: 2, mode: 'friends-offline', release };
}
module.exports = { buildOffline };
if (require.main === module) {
  const [sourcePath, outputDir, publicKeyPath, privateKeyPath, keyId] = process.argv.slice(2);
  if (!keyId) throw Error('Usage: build-offline-payload PRIVATE_SOURCE PRIVATE_OUTPUT PUBLIC_KEYS PRIVATE_KEY KEY_ID');
  const result = buildOffline({ sourcePath, outputDir, publicKeys: JSON.parse(fs.readFileSync(publicKeyPath, 'utf8')), signingJwk: JSON.parse(fs.readFileSync(privateKeyPath, 'utf8')), keyId });
  console.log(JSON.stringify({ protocol: result.protocol, version: result.version, hash: result.hash, size: result.size }));
}
