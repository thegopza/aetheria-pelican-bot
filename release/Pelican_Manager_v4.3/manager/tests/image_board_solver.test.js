'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrompt, resolveTargetItem, matchTemplateOnBoard } = require('../image_board_solver');

test('normalizePrompt strips Thai and English action words', () => {
  assert.equal(normalizePrompt('เลือก Red Potion'), 'red potion');
  assert.equal(normalizePrompt('กรุณาคลิกที่รูปภาพของ Poring Hat'), 'poring hat');
  assert.equal(normalizePrompt('กดที่ภาพ Guard ภายในเวลา 30 วินาที'), 'guard');
  assert.equal(normalizePrompt('Please click the picture of Blue Potion'), 'blue potion');
  assert.equal(normalizePrompt('choose icon of Phracon'), 'phracon');
});

test('resolveTargetItem finds item in catalog and resolves icon URL', () => {
  const catalog = {
    items: [
      { id: 90301, name: 'Red Potion' },
      { id: 2101, name: 'Guard' }
    ],
    manifest: {
      items: {
        '90301': 'items/red-potion.webp',
        '2101': 'items/rogear-guard.webp'
      }
    }
  };

  const res = resolveTargetItem('เลือก Red Potion', catalog);
  assert.ok(res);
  assert.equal(res.id, 90301);
  assert.equal(res.name, 'Red Potion');
  assert.equal(res.iconPath, 'items/red-potion.webp');
  assert.equal(res.iconUrl, '/art/icons/items/red-potion.webp');

  const guardRes = resolveTargetItem('กรุณากดรูป Guard', catalog);
  assert.ok(guardRes);
  assert.equal(guardRes.id, 2101);

  const unknown = resolveTargetItem('เลือก NonExistentItem', catalog);
  assert.equal(unknown, null);
});

test('matchTemplateOnBoard finds exact coordinate on synthetic RGBA buffer', () => {
  const bw = 200, bh = 150;
  const boardBuffer = Buffer.alloc(bw * bh * 4, 30); // dark gray background

  // Create a 20x20 template with a distinct red circle/square
  const tw = 20, th = 20;
  const templateBuffer = Buffer.alloc(tw * th * 4, 0); // transparent background

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const idx = (y * tw + x) * 4;
      if (Math.hypot(x - 10, y - 10) <= 8) {
        templateBuffer[idx] = 240;     // R
        templateBuffer[idx + 1] = 20;  // G
        templateBuffer[idx + 2] = 20;  // B
        templateBuffer[idx + 3] = 255; // Alpha
      }
    }
  }

  // Draw template onto board at target position (x: 84, y: 52)
  const targetX = 84, targetY = 52;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const tIdx = (y * tw + x) * 4;
      if (templateBuffer[tIdx + 3] > 120) {
        const bIdx = ((targetY + y) * bw + (targetX + x)) * 4;
        boardBuffer[bIdx] = templateBuffer[tIdx];
        boardBuffer[bIdx + 1] = templateBuffer[tIdx + 1];
        boardBuffer[bIdx + 2] = templateBuffer[tIdx + 2];
        boardBuffer[bIdx + 3] = 255;
      }
    }
  }

  const match = matchTemplateOnBoard(
    { width: bw, height: bh, data: boardBuffer },
    { width: tw, height: th, data: templateBuffer }
  );

  assert.ok(match, 'match result should exist');
  assert.equal(match.bestX, targetX);
  assert.equal(match.bestY, targetY);
  assert.equal(match.centerX, targetX + 10);
  assert.equal(match.centerY, targetY + 10);
  assert.ok(match.confidence >= 95, `confidence should be high, got ${match.confidence}`);
});

test('matchTemplateOnBoard returns low confidence when item is missing', () => {
  const bw = 100, bh = 100;
  const boardBuffer = Buffer.alloc(bw * bh * 4, 30); // blank dark board

  const tw = 16, th = 16;
  const templateBuffer = Buffer.alloc(tw * th * 4, 255); // solid white template

  const match = matchTemplateOnBoard(
    { width: bw, height: bh, data: boardBuffer },
    { width: tw, height: th, data: templateBuffer }
  );

  assert.ok(match);
  assert.ok(match.confidence < 50, `confidence should be low for missing item, got ${match.confidence}`);
});
