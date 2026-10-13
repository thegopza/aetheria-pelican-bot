'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAllowlist, safePath } = require('./publish-manager-updates');
const files = require('./manager-distribution-files.json');
test('distribution contains Manager bootstrap and updater, never private bot or user state', () => {
  assert.doesNotThrow(() => validateAllowlist(files));
  for (const required of ['manager/server.js', 'manager/github_check.js', 'manager/manager_self_update.js', 'manager/script_release_keys.js', 'manager/game_loader/main.js']) assert.ok(files.includes(required));
  for (const name of ['manager/public/bot.js', 'manager/profiles.json', 'manager/settings.json', 'manager/data/credentials.json', 'manager/data/offline-cache/payload.js', 'manager/tests/fixture.js', '../private.js']) assert.throws(() => validateAllowlist([name]));
});
test('manifest paths reject traversal, absolute paths and duplicate records', () => {
  for (const name of ['../secret', 'manager/../secret', 'C:/private.js', 'manager\\private.js', 'protected-script/bot.source.js']) assert.equal(safePath(name), false);
  assert.throws(() => validateAllowlist(['manager/server.js', 'manager/server.js']));
});
