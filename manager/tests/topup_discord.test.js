'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiscordBotService } = require('../discord_bot.js');

describe('Merit Top-up Discord Notification (Flex Receipt & Monk Blessing)', () => {
  it('builds structured Flex-style Embed with account merit summary and monk blessing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-topup-discord-'));
    try {
      const discord = createDiscordBotService({
        dataDir: tmpDir,
        loadProfiles: () => [],
        evalProfilePort: async () => ({}),
        getDeviceNickname: () => 'PC-Main-Farm'
      });

      const payload = discord.buildMeritTopupPayload({
        amount: 100,
        pointsAdded: 100,
        previousPoints: 45.5,
        totalPoints: 145.5,
        accountId: 'acc_1234567890abcdef',
        machineHwid: '9F8E7D6C5B4A3210',
        blessingIndex: 0
      });

      assert.ok(payload.content.includes('เจริญพร! โยม `PC-Main-Farm`'));
      assert.ok(payload.content.includes('+100.00 บาท'));
      assert.ok(Array.isArray(payload.embeds) && payload.embeds.length === 1);

      const embed = payload.embeds[0];
      assert.ok(embed.title.includes('+100.00 บาท'));
      assert.ok(embed.description.includes('กองบุญผ้าป่าสามัคคี'));
      assert.equal(embed.color, 0xFBBF24);

      const summaryField = embed.fields.find(f => f.name.includes('สรุปยอดส่วนบุญในบัญชี'));
      assert.ok(summaryField, 'Should include account merit summary field');
      assert.ok(summaryField.value.includes('45.50 ส่วนบุญ'), 'Should show previous balance');
      assert.ok(summaryField.value.includes('+100.00 ส่วนบุญ'), 'Should show added merit');
      assert.ok(summaryField.value.includes('145.50 ส่วนบุญ'), 'Should show net balance');

      const blessingField = embed.fields.find(f => f.name.includes('พรจากเณรอัลเบิร์ต'));
      assert.ok(blessingField, 'Should include monk blessing field');
      assert.ok(blessingField.value.includes('เจริญพร โยม **PC-Main-Farm**'), 'Should include เจริญพร โยม blessing');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('accurately summarizes debt settlement when previous balance was negative', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-topup-debt-'));
    try {
      const discord = createDiscordBotService({
        dataDir: tmpDir,
        loadProfiles: () => [],
        evalProfilePort: async () => ({}),
        getDeviceNickname: () => 'Rig-02'
      });

      const payload = discord.buildMeritTopupPayload({
        amount: 50,
        pointsAdded: 50,
        previousPoints: -20,
        totalPoints: 30,
        accountId: 'acc_debt_settle_test'
      });

      const embed = payload.embeds[0];
      const summaryField = embed.fields.find(f => f.name.includes('สรุปยอดส่วนบุญในบัญชี'));
      assert.ok(summaryField.value.includes('-20.00 ส่วนบุญ'), 'Should show negative previous balance');
      assert.ok(summaryField.value.includes('ปลดหนี้ครบ'), 'Should indicate full debt settlement');
      assert.ok(summaryField.value.includes('30.00 ส่วนบุญ'), 'Should show net positive balance after debt deduction');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('posts webhook payload via notifyMeritTopup when custom webhookUrl is provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmhee-topup-http-'));
    let receivedBody = null;
    const server = http.createServer((req, res) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        receivedBody = JSON.parse(raw);
        res.writeHead(204);
        res.end();
      });
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const discord = createDiscordBotService({
        dataDir: tmpDir,
        loadProfiles: () => [],
        evalProfilePort: async () => ({}),
        getDeviceNickname: () => 'Test-Machine'
      });

      const res = await discord.notifyMeritTopup({
        amount: 300,
        pointsAdded: 300,
        previousPoints: 10,
        totalPoints: 310
      }, {
        webhookUrl: `http://127.0.0.1:${port}/api/webhooks/test`
      });

      assert.equal(res.success, true);
      assert.ok(receivedBody, 'Webhook server should receive payload');
      assert.equal(receivedBody.embeds[0].color, 0xA855F7);
      assert.ok(receivedBody.embeds[0].description.includes('กองบุญมหากฐินสามัคคี'));
    } finally {
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
