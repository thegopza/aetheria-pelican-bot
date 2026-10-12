# PmheeAether script authorization and update rollout

## Verified current state — 2026-10-13 (Asia/Bangkok)

Production Worker 03f7e60a-7843-4031-889e-a9eaffc2e8a0 delivers private signed payload 4.37.1 (cf9360cf1ad728f58734c30c3e9f946992ba68075988944781ddeb5953c0a440). Compatibility bot in public Git remains 4.36.2. Immutable lease release pins preserve 4.37.0 runtimes across deployment; a fresh document receives 4.37.1. No full hot injection or fleet refresh was performed.

Production daily billing was already enabled by the prior rollout (activation day 2026-10-13). The owner explicitly set 1 Baht / actually used screen / Bangkok day during this repair: default and today's dated revision are 100 units = 1 ส่วนบุญ. Actual server statement verified 17 used slots = 17 ส่วนบุญ estimated. Local Humancheck remains free and independent.

API tests 60/60; Security 12/12; Manager 92/92; actual isolated Edge/Chrome 4.37.1 delivery/renew/reconnect/reload/expiry passed and screenshots reviewed. Production payload smoke passed without execution/usage/topup. Provider connectivity passed with an invalid fixture, but no real voucher was redeemed; valid payment end-to-end remains unverified.

Proxy exposed credential literals were removed from current source/release; owner explicitly declined credential rotation; existing locally stored credentials are permitted, never restored to distributed source. Reservations now use atomic quota/funds admission and exact retry ACKs, sticky IP sessions, bounded deadlines and durable ambiguous-result review. UI uses actual slot/ledger fields, honors zero usage, and does not invent balance or debt from open-game counts.

For operational updates follow AGENTS.md / agent.md and the private API cloudflare/DEPLOYMENT_STATUS.md. GitHub updates Manager/bootstrap/tooling; private payload requires explicit build + D1 import + Worker deploy. Rollback must preserve latest financial ledger and both lease-pinned releases. The sections below are the historical 2026-10-12 preparation record, not the current deployment state.

## Historical preparation record


Status 2026-10-12: implementation is available in isolated staging/shadow.
No production authorization enforcement or daily billing has been enabled.
Existing production Cloudflare API remains free. Public `bot.js` is still the
v4.36.0 compatibility snapshot; the new v4.37.0 source is private in the API
repository, not in Manager public files or the release ZIP.

See [SCRIPT_TRANSITION_READINESS.md](SCRIPT_TRANSITION_READINESS.md) for the
actual build, test evidence, staged delivery contract and activation boundaries.

## User experience and compatibility evidence

The intended user flow remains Open Manager -> Open screen -> Start Bot.
No new account/password prompt per window, ZIP extraction or EXE restart is
part of the ordinary supported update flow. Preserve all existing profiles,
passwords, plans, settings and stable screen identities.

Source inspection: current main.js fetches bot.js from GitHub and supports
POST /api/eval; browser_mode.js can inject script and supplies __pmProfileId;
manager_self_update.js updates manager JS/UI and restarts the server child.
Read-only live probe of three currently running screens confirmed POST eval,
bot version 4.36.0, profile ID and live-state hook. This proves those sampled
installations, not every old customer loader. Inventory capabilities before
enforcement. main.js and launcher EXE do not update through ordinary self-update.

## Components and trust boundary

1. Central script bootstrap, before starting any timers, handlers or plan IIFEs.
   Keep settings/HUD migration separate from activation of automated actions.
2. Manager session coordinator maps existing local profiles to stable server
   slot IDs, requests tickets, supplies them through POST eval/CDP and restores
   mappings after Manager restart/refresh. No new slot on reconnect.
3. Workers owns device/slot registration, ticket signing, active lease tracking,
   revoked bindings, pricing and immutable usage/wallet ledger.
4. Billing synchronizer records first actual automation use per slot/Bangkok day,
   persists retry-safe event IDs and queues offline reports. Price and balances
   never come from an authoritative client flag.
5. Local Humancheck matcher/catalog cache remains independent of billing network.

Ticket binds account/device/slot, Manager instance and script runtime nonce,
protocol version, expiry and binding revision. Script has public verification
keys only. Private signing keys and wallet/administrator authority remain on
server. Device private key stays protected locally, not in public/release config.
Neither a Boolean, profile name, __pmProfileId, port number nor HWID alone proves
Manager authorization. Revoke previous runtime when replacing a screen lease.

Authorization must cover every script entry point, including standalone userscript,
Electron remote/local injection, browser injection, exported automation functions,
automatic resume, auth/register and external Plan Script IIFEs. Do not just
disable the Start button while timers or window exports remain functional.
Reject duplicate bootstrap initialization so local fallback followed by delayed
GitHub response cannot create another set of timers or another usage event.

Local code remains modifiable. Signed tickets stop forged tickets in the official
client, but do not prove an unmodified client or stop an attacker removing checks
from copied/old public script. Fully local automation/offline Humancheck cannot
be made absolutely unavailable outside Manager using client checks alone. State
this limitation; do not market encryption/obfuscation/HWID as a complete solution.

## Rollout sequence

### A. Server and Manager preparation

Add versioned capability/slot/ticket/usage interfaces while retaining existing
Humancheck/account endpoints. Deploy new schema in shadow mode without debits.
Manager self-update installs new files, registers/reconnects existing screens
and publishes readiness per profile. Do not modify/reinstall main.js or EXE
unless live capability inventory demonstrates it is necessary.

### B. Script compatibility release

Ship bootstrap in observation mode. It reports presence/absence of Manager
authorization but does not block legacy clients or bill them. Keep the old
behavior temporarily; collect missing bridge/version/readiness causes. Manager
must be able to deliver tickets before script automation gates are enforced.
Refresh through existing safe bot auto-update, never inject full bot.js into
a running page. New busy flags must also be in bot_auto_update CLIENT_PROBE_JS.

### C. Verification and small pilot

Test browser and Electron paths, old installed loader, standalone invocation,
offline catalog, duplicate/expired/revoked tickets, copied slot, refresh, Start
Bot/Stop Bot, Manager child restart, delayed GitHub/local fallback, map travel,
shop/refine/storage/job-change/consolidation busy states and startup races.
Confirm settings and credentials survive updates. Begin with an explicitly
selected pilot, then enable official Manager authorization for ready clients.

### D. Enforce authorization separately from billing

Readiness is a real protocol/ticket exchange, not an untrusted version string.
An unready existing installation receives a specific recoverable update state,
not silent loss of automation or deletion/re-enrollment of its account. Use an
agreed transition deadline to avoid keeping old versions unrestricted forever.
An official script launched without Manager waits for Manager authorization;
normal game play remains usable. After ready clients are verified, enforce.

### E. Usage billing activation

Expose pricing terms and acceptance, today's unique used screens/estimated
total, statement history, offline-report status and administrator-selected
rate. Only after the announced boundary activate midnight settlement. No charges
for earlier observation/free days. Read the current API BILLING_DESIGN.md: usage
first, signed debt, fractional integer units and rate frozen at Bangkok midnight.

## Outages, restart and rollback

- Define a bounded cached-ticket grace policy for existing authorized runtimes.
  A brief Manager self-update or server outage must not suddenly stop safe work.
  Offline queue does not prove complete honest usage; reconcile sequence gaps.
- Humancheck continues with the last-good local catalog independently. Missing
  or ambiguous catalog matches fall back to manual; no Point shortage message
  for a network failure.
- On authorization expiry, prevent new automation and pause at a safe boundary;
  do not close the game or interrupt an in-flight payment/trade/refine operation.
- Roll back an authorization policy/worker version independently of the ledger.
  Never restore an old wallet snapshot after new financial entries exist.
- If a loader feature really is missing, prefer the existing one-click script
  installer update. Explain affected installations; do not promise zero manual
  action for unsupported loaders or disabled/broken auto-update.

## Release acceptance

All changed JS must pass syntax/security/concurrency/compatibility tests and
project review. Mirror Manager files into release and rebuild/verify ZIP for
new downloads even though existing users receive automatic updates. Keep
AGENTS.md and agent.md identical. Do not restart PelicanManager.exe, close live
games, activate fees, or enable blocking policy merely to validate this design.
