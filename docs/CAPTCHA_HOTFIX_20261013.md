# Embedded Humancheck hotfix — 2026-10-13

Owner requested a bot-only question-solving update before the pending friends/offline migration. This release does not activate owner-host services, the offline wallet or the protocol2 friends runtime.

- Public compatibility bot: **4.36.3**, independently uses the already-public catalog/matcher with 1,160 item names/icons. No private bot source is published.
- Protected protocol1 bot: **4.37.2**, based on deployed4.37.1 with only the embedded solver, remembered answer settings, durable answer-stat events and version change. Source is private `protected-script/releases/bot.4.37.2.source.js`; the separate4.38.0 friends candidate remains unreleased.
- Protected artifact: SHA256 `4c91b39f16b2ad2e17e5af56956911080d8181be4076c0556747081bb5b13c88`, 1,184,675 bytes, 20 private D1 chunks.
- Current production Worker version: `4d616933-a92a-4584-a55c-643279d1d022`; staging `b291bb61-760f-49f4-a4d7-e1d4fdf110dc`. Both retain exact immutable4.37.0 and4.37.1 releases in the bounded previous-release allowlist, preserving active old leases.
- Manager release contains only a local event/config bridge, durable-stat dedupe/atomic ACK, Discord automated-click guard and updated protocol1 verification bootstrap. The server/Discord release files were prepared from committed stable HEAD rather than the pending friends-mode working tree.
- Question matches execute locally without balance/solve API checks. Unsupported or ambiguous matches remain manual. Main farming/Plan lease enforcement is unchanged; the independent local question observer remains usable after lease expiry once a valid payload has initialized.
- Manager retains per-profile answer counts and answer settings; records events before ACK and prevents automated Discord and embedded solver from clicking twice. First installation without remembered preferences uses default auto-answer until Manager supplies preferences; subsequent reloads restore the remembered setting.
- Verification: 28 scoped Manager/security tests passed against the exact release server files; private allowlist/security16 passed; full signed4.37.2 actual browser fixtures passed Edge andChrome including local answer after expiry, durable eventACK, safe pause, reconnect and reload. Production smoke8 passed without execution, usage records or money redemption.
- Production maintenance0, billing enabled1, walletUnitsReady1, daily rate100units and ledger entry count1 were unchanged across this release's payload/Worker operations. No owner-host cutover or paid-plan upgrade occurred.
- Release ZIP: 65 allowlisted entries, SHA256 `5A582CAE059047126323387133CD008FA61CD6E5AF75AD123BDACDA042B0EB3A`; entry bytes verified against mirrors; no private payload, signing keys, customer configs, daily debts or session data.

Public push distributes the compatibility bot and stable Manager hotfix. Protected clients receive4.37.2 on a new safe page load; existing pinned leases keep their verified old release until that reload. Do not hot-inject either full bot into running games. No launcher/game fleet was closed to perform this release.

Future agents: continue reading hub TASKS/TEST_PLAN/FIX_REPORT for the separate owner-host migration. Do not treat this hotfix as approval to publish the remaining dirty Manager/API candidate changes.
