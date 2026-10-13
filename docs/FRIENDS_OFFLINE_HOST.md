# Owner-hosted friends mode

## Status — 2026-10-13

Implementation candidates were created and partially tested, then the owner requested that this turn stop implementation/cutover and leave a task draft for another agent to implement and Codex to review. Read `FRIENDS_OFFLINE_TASKS.md` and `FRIENDS_OFFLINE_TEST_PLAN.md` before continuing. Candidate code remains uncommitted and unreleased. The deployed authority is still Cloudflare until a verified cutover is recorded here. The stopped legacy PMheeAetheriaApi SQLite wallet must not be reactivated as-is.

## Workspace

Open `D:\MyProject\PmheeAether` as the project entry. `manager-project` is a junction to this public repository, `D:\MyProject\aetheria`; `private-api` is a junction to `D:\MyProject\PMheeSuite\PMheePlatform_Src\Server\PMhee.AetheriaApi`. There is one source copy for each component. The hub AGENTS.md describes boundaries; read the canonical repository instructions before editing.

Public source owns Manager, bootstrap verification, local encrypted caches/journals and release packaging. Private source owns `owner-host/`, payment/central wallet, `protected-script/bot.source.js` and built payload artifacts. Do not place private source or built payload in the public repository or distributable ZIP.

## User-approved behavior

- Existing `PMheeAetheriaApi` is the intended dedicated Windows service; PmheeSuite Licensing remains separate.
- After a first authenticated download, a verified cached payload runs while the owner's host is unavailable. Friends mode does not renew per-screen online runtime leases.
- The private payload contains the local Humancheck solver and catalog. Solving does not require a balance or online billing authorization. Ambiguous answers require manual input; per-profile statistics remain in Manager.
- The daily price remains 100 integer units (1 ส่วนบุญ / 1 Baht) for each actually used stable slot per Bangkok day. Reload and repeated events do not add another daily charge.
- Local pending events are stored by day in encrypted application-owned files. The displayed balance uses the last confirmed server balance minus outstanding usage and continues normally while offline.
- Sync at most hourly while healthy, at Bangkok midnight and after reconnect. Send pending records before clearing them. Clear only explicit successful acknowledgements; uncertain requests remain queued. Retried submissions must not debit again.
- The owner can see machines, their last reported sessions and balances, and adjust balances centrally. Disconnected machine counts are last-reported data, not a live count.
- Topups require the owner host to be online and must be verified centrally before credit. This does not make uncertain provider results safe to redeem again.
- The mode trusts friends. Local deletion/tampering of unsent events cannot be prevented completely. Encrypted payloads impede casual reading, not determined memory extraction.

## Cutover requirements

Preserve customer tokens, accounts, wallet units, transactions, receipts, locked daily rates and usage history from the latest D1 export. Freeze only Aetheria writes, reconcile pending receipts, verify the restored SQLite ledger, test the owner host, and change only `api.noggunsshop.xyz/v1/aetheria/*`. Do not restart Licensing, the Manager launcher or customer games. Keep old signed release verification for existing running protected games until a safe refresh loads friends mode.

Never activate two wallets at once. After the owner host receives new transactions, rollback requires the latest ledger, not the pre-cutover snapshot. Record the final deployment, tests and exact authority here.
