# PmheeAether script authorization and update rollout

Status 2026-10-12: preparation/design only. No authorization enforcement or
daily billing has been enabled. Existing Cloudflare API remains free.

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
