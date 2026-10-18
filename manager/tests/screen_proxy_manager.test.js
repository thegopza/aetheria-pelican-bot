const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createScreenProxyManager,
  parseProxyPoolLines
} = require("../screen_proxy_manager");

test("parseProxyPoolLines parses ip:port:user:pass and URL formats", () => {
  const raw = [
    "# comment line",
    "154.201.10.11:12323:userA:passA",
    "http://userB:passB@154.201.10.12:8080",
    "socks5://userC:passC@154.201.10.13:1080"
  ].join("\n");

  const entries = parseProxyPoolLines(raw);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].proxyHost, "154.201.10.11");
  assert.equal(entries[0].proxyPort, 12323);
  assert.equal(entries[0].proxyUser, "userA");
  assert.equal(entries[0].proxyPass, "passA");
  assert.equal(entries[0].protocol, "http");

  assert.equal(entries[1].proxyHost, "154.201.10.12");
  assert.equal(entries[1].proxyPort, 8080);
  assert.equal(entries[1].protocol, "http");

  assert.equal(entries[2].proxyHost, "154.201.10.13");
  assert.equal(entries[2].proxyPort, 1080);
  assert.equal(entries[2].protocol, "socks5");
});

test("ScreenProxyManager enforces 1 IP : 3 screens queue, sticky slots, and toggle ON/OFF", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "screen-proxy-test-"));
  const mgr = createScreenProxyManager({
    dataDir: tmpDir,
    getDeviceHwid: () => "test-hwid-001",
    log: () => {}
  });

  try {
    // Default must be disabled
    assert.equal(mgr.isEnabled(), false);
    const disabledRes = await mgr.acquireForProfile("p1");
    assert.equal(disabledRes.enabled, false);
    assert.equal(disabledRes.proxyServer, null);

    // Save 2 IPs with maxScreensPerIp = 3 (total 6 slots) in local-pool mode
    await mgr.updateSettings({
      enabled: true,
      mode: "local-pool",
      maxScreensPerIp: 3,
      onlyGameTraffic: true,
      poolText: [
        "154.201.10.11:12323:user01:pass01",
        "154.201.10.12:12323:user01:pass01"
      ].join("\n")
    });

    assert.equal(mgr.isEnabled(), true);
    const pub1 = mgr.publicSettings();
    assert.equal(pub1.poolCount, 2);
    assert.equal(pub1.totalSlots, 6);

    // Allocate 3 screens -> all should land on IP #1 (slots 1, 2, 3)
    const l1 = await mgr.acquireForProfile("p1");
    const l2 = await mgr.acquireForProfile("p2");
    const l3 = await mgr.acquireForProfile("p3");

    assert.equal(l1.proxyHost, "154.201.10.11");
    assert.equal(l1.slotIndex, 1);
    assert.ok(l1.tunnelPort > 0);
    assert.match(l1.proxyServer, /^http:\/\/127\.0\.0\.1:\d+$/);

    assert.equal(l2.proxyHost, "154.201.10.11");
    assert.equal(l2.slotIndex, 2);

    assert.equal(l3.proxyHost, "154.201.10.11");
    assert.equal(l3.slotIndex, 3);

    // Allocate 4th, 5th, 6th screens -> should land on IP #2 (slots 1, 2, 3)
    const l4 = await mgr.acquireForProfile("p4");
    const l5 = await mgr.acquireForProfile("p5");
    const l6 = await mgr.acquireForProfile("p6");

    assert.equal(l4.proxyHost, "154.201.10.12");
    assert.equal(l4.slotIndex, 1);
    assert.equal(l5.proxyHost, "154.201.10.12");
    assert.equal(l5.slotIndex, 2);
    assert.equal(l6.proxyHost, "154.201.10.12");
    assert.equal(l6.slotIndex, 3);

    // Sticky re-acquire for p2 keeps same IP & slot
    const l2Again = await mgr.acquireForProfile("p2");
    assert.equal(l2Again.proxyHost, "154.201.10.11");
    assert.equal(l2Again.slotIndex, 2);

    // 7th screen when all 6 slots are full -> returns error and no proxyServer
    const l7 = await mgr.acquireForProfile("p7");
    assert.equal(l7.proxyServer, null);
    assert.ok(l7.error);

    // Release p2 (slot 2 on IP #1) -> p7 can now take slot 2 on IP #1
    await mgr.releaseProfile("p2");
    const l7AfterRelease = await mgr.acquireForProfile("p7");
    assert.equal(l7AfterRelease.proxyHost, "154.201.10.11");
    assert.equal(l7AfterRelease.slotIndex, 2);

    // Toggle OFF stops tunnels
    await mgr.setEnabled(false);
    assert.equal(mgr.isEnabled(), false);
    const snap = mgr.getProfileLeaseSnapshot("p1");
    assert.equal(snap.active, false);
  } finally {
    await mgr.stopAllTunnels();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Local Asset Cache intercepts .png, .webp, .mp3, .woff2 and serves from disk cache without proxy bandwidth", async () => {
  const { createAssetCache, isCacheableAssetUrl } = require("../asset_cache");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-cache-test-"));
  let upstreamFetchCount = 0;

  const cache = createAssetCache({
    dataDir: tmpDir,
    fetchDirect: async (url) => {
      upstreamFetchCount += 1;
      const ext = path.extname(new URL(url).pathname).toLowerCase();
      return {
        statusCode: 200,
        contentType: ext === ".webp" ? "image/webp" : (ext === ".mp3" ? "audio/mpeg" : (ext === ".woff2" ? "font/woff2" : "image/png")),
        body: Buffer.from(`MOCK_ASSET_PAYLOAD_${ext}_${url}`)
      };
    }
  });

  try {
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/art/sprites/monsters/poring.png"), true);
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/art/icons/sword.webp?v=123"), true);
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/audio/bgm/town.mp3"), true);
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/fonts/kanit.woff2"), true);
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/api/login"), false);
    assert.equal(isCacheableAssetUrl("https://www.aetheria-online.in.th/play"), false);

    const pngUrl = "https://www.aetheria-online.in.th/art/sprites/monsters/poring.png";
    const webpUrl = "https://www.aetheria-online.in.th/art/icons/potion.webp";
    const mp3Url = "https://www.aetheria-online.in.th/audio/bgm/theme.mp3";
    const woff2Url = "https://www.aetheria-online.in.th/fonts/game.woff2";

    // First window fetches -> cache miss (downloaded once directly, saved to disk)
    const r1 = await cache.getOrFetch(pngUrl);
    assert.equal(r1.ok, true);
    assert.equal(r1.fromCache, false);
    assert.equal(upstreamFetchCount, 1);

    // Next 5 windows request the same .png -> served from local cache, 0 upstream requests!
    for (let i = 0; i < 5; i++) {
      const hit = await cache.getOrFetch(pngUrl);
      assert.equal(hit.ok, true);
      assert.equal(hit.fromCache, true);
      assert.deepEqual(hit.body, r1.body);
    }
    assert.equal(upstreamFetchCount, 1);

    // Test .webp, .mp3, .woff2
    await cache.getOrFetch(webpUrl);
    await cache.getOrFetch(webpUrl);
    await cache.getOrFetch(mp3Url);
    await cache.getOrFetch(mp3Url);
    await cache.getOrFetch(woff2Url);
    await cache.getOrFetch(woff2Url);

    assert.equal(upstreamFetchCount, 4); // Only 1 fetch per unique asset URL
    const stats = cache.getStats();
    assert.equal(stats.filesCount, 4);
    assert.equal(stats.misses, 4);
    assert.equal(stats.hits, 8); // 5 png + 1 webp + 1 mp3 + 1 woff2 cache hits
    assert.ok(stats.bytesSaved > 0);
    assert.ok(stats.byGroup.png.bytesSaved > 0);
    assert.ok(stats.byGroup.webp.bytesSaved > 0);
    assert.ok(stats.byGroup.audio.bytesSaved > 0);
    assert.ok(stats.byGroup.font.bytesSaved > 0);
  } finally {
    cache.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

