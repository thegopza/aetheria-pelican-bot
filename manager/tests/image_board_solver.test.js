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

test('solveFrameChallenge detects golden frame and finds identical duplicate item', () => {
  const { findGoldenFrame, solveFrameChallenge } = require('../image_board_solver');
  const bw = 480, bh = 330;
  const data = Buffer.alloc(bw * bh * 4, 30); // dark background

  // Golden frame at x: 200..280, y: 50..130
  const fx = 200, fy = 50, fw = 80, fh = 80;
  for (let y = fy; y <= fy + fh; y++) {
    for (let x = fx; x <= fx + fw; x++) {
      if (x === fx || x === fx + fw || y === fy || y === fy + fh) {
        const idx = (y * bw + x) * 4;
        data[idx] = 210; data[idx + 1] = 180; data[idx + 2] = 60; data[idx + 3] = 255;
      }
    }
  }

  // Draw item in frame: red cross at x: 232..248, y: 82..98 (center at 240, 90)
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (Math.abs(dx) <= 2 || Math.abs(dy) <= 2) {
        const idx = ((90 + dy) * bw + (240 + dx)) * 4;
        data[idx] = 240; data[idx + 1] = 40; data[idx + 2] = 40; data[idx + 3] = 255;
      }
    }
  }

  // Draw distractor item at bottom: green cross at x: 100, y: 240
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (Math.abs(dx) <= 2 || Math.abs(dy) <= 2) {
        const idx = ((240 + dy) * bw + (100 + dx)) * 4;
        data[idx] = 40; data[idx + 1] = 240; data[idx + 2] = 40; data[idx + 3] = 255;
      }
    }
  }

  // Draw identical matching item at bottom: red cross at x: 320, y: 250
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (Math.abs(dx) <= 2 || Math.abs(dy) <= 2) {
        const idx = ((250 + dy) * bw + (320 + dx)) * 4;
        data[idx] = 240; data[idx + 1] = 40; data[idx + 2] = 40; data[idx + 3] = 255;
      }
    }
  }

  const frame = findGoldenFrame({ width: bw, height: bh, data });
  assert.ok(frame, 'should detect frame');
  assert.equal(frame.x, fx);
  assert.equal(frame.y, fy);

  const solution = solveFrameChallenge({ width: bw, height: bh, data });
  assert.ok(solution, 'should solve challenge');
  assert.equal(solution.targetX, 320);
  assert.equal(solution.targetY, 250);
  assert.ok(solution.confidence >= 95, `confidence should be >= 95, got ${solution.confidence}`);
});

test('solveFrameChallenge matches rotated, mirrored, and scaled sprite over background circles', () => {
  const { solveFrameChallenge, findBottomCandidates } = require('../image_board_solver');
  const bw = 480, bh = 330;
  const data = Buffer.alloc(bw * bh * 4);
  for (let i = 0; i < bw * bh; i++) {
    data[i * 4] = 25;
    data[i * 4 + 1] = 22;
    data[i * 4 + 2] = 37;
    data[i * 4 + 3] = 255;
  }

  // Draw golden frame at x: 175..305, y: 20..137
  for (let y = 20; y <= 137; y++) {
    for (let x = 175; x <= 305; x++) {
      if (x < 179 || x > 301 || y < 24 || y > 133) {
        const idx = (y * bw + x) * 4;
        data[idx] = 210; data[idx + 1] = 175; data[idx + 2] = 60;
      }
    }
  }

  // Helper to draw a background circle
  function drawCircle(cx, cy, rad, r, g, b) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < bw && y >= 0 && y < bh) {
            const idx = (y * bw + x) * 4;
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b;
          }
        }
      }
    }
  }

  // Helper to draw an L-shaped hammer sprite with rotation, flip, scale, and shading
  function drawHammer(cx, cy, angleDeg, flipX, scale, baseR, baseG, baseB) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let sy = -30; sy <= 30; sy += 0.5) {
      for (let sx = -30; sx <= 30; sx += 0.5) {
        const ux = (sx / scale) * flipX;
        const uy = sy / scale;
        // Handle: ux in [-4..4], uy in [-18..22]; Head: ux in [-16..12], uy in [-22..-10]
        const inHandle = Math.abs(ux) <= 4 && uy >= -18 && uy <= 22;
        const inHead = ux >= -16 && ux <= 12 && uy >= -22 && uy <= -10;
        if (inHandle || inHead) {
          const rx = Math.round(cx + sx * cos - sy * sin);
          const ry = Math.round(cy + sx * sin + sy * cos);
          if (rx >= 0 && rx < bw && ry >= 0 && ry < bh) {
            const idx = (ry * bw + rx) * 4;
            const shade = inHead ? 1.25 : 0.85;
            data[idx] = Math.min(255, Math.round(baseR * shade));
            data[idx + 1] = Math.min(255, Math.round(baseG * shade));
            data[idx + 2] = Math.min(255, Math.round(baseB * shade));
          }
        }
      }
    }
  }

  // Draw background circles
  drawCircle(240, 78, 32, 65, 55, 68);
  drawCircle(68, 240, 30, 45, 52, 42);
  drawCircle(180, 240, 30, 38, 52, 60);
  drawCircle(300, 235, 30, 52, 38, 55);
  drawCircle(415, 240, 30, 55, 52, 40);

  // Top frame: Hammer at (240, 78), angle +25 deg, flip=1, scale=1.0
  drawHammer(240, 78, 25, 1, 1.0, 160, 175, 210);

  // Slot 1: Solid disc distractor at (68, 240)
  drawCircle(68, 240, 18, 190, 120, 80);

  // Slot 2: Thin rod distractor at (180, 240)
  for (let dy = -26; dy <= 26; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const idx = ((240 + dy) * bw + (180 + dx)) * 4;
      data[idx] = 200; data[idx + 1] = 90; data[idx + 2] = 110;
    }
  }

  // Slot 3: Matching Hammer at (300, 235), rotated -40 deg, horizontally flipped (-1), scaled 0.9x, slight hue shift
  drawHammer(300, 235, -40, -1, 0.9, 170, 165, 220);

  // Slot 4: Wide square distractor at (415, 240)
  for (let dy = -16; dy <= 16; dy++) {
    for (let dx = -16; dx <= 16; dx++) {
      const idx = ((240 + dy) * bw + (415 + dx)) * 4;
      data[idx] = 120; data[idx + 1] = 190; data[idx + 2] = 140;
    }
  }

  const cands = findBottomCandidates({ width: bw, height: bh, data });
  assert.equal(cands.length, 4);

  const sol = solveFrameChallenge({ width: bw, height: bh, data });
  assert.ok(sol, 'should solve transformed frame challenge');
  assert.equal(sol.slot, 3, `expected slot 3, got slot ${sol.slot}`);
  assert.ok(Math.abs(sol.x - 300) <= 10 && Math.abs(sol.y - 235) <= 10, `expected near (300, 235), got (${sol.x}, ${sol.y})`);
  assert.ok(sol.confidence >= 65, `expected confidence >= 65, got ${sol.confidence}`);
});


