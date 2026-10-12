# PmheeAether transition build — 2026-10-12

## Verified current state — 2026-10-13 (Asia/Bangkok)

Production Worker 03f7e60a-7843-4031-889e-a9eaffc2e8a0 delivers private signed payload 4.37.1 (cf9360cf1ad728f58734c30c3e9f946992ba68075988944781ddeb5953c0a440). Compatibility bot in public Git remains 4.36.2. Immutable lease release pins preserve 4.37.0 runtimes across deployment; a fresh document receives 4.37.1. No full hot injection or fleet refresh was performed.

Production daily billing was already enabled by the prior rollout (activation day 2026-10-13). The owner explicitly set 1 Baht / actually used screen / Bangkok day during this repair: default and today's dated revision are 100 units = 1 ส่วนบุญ. Actual server statement verified 17 used slots = 17 ส่วนบุญ estimated. Local Humancheck remains free and independent.

API tests 60/60; Security 12/12; Manager 92/92; actual isolated Edge/Chrome 4.37.1 delivery/renew/reconnect/reload/expiry passed and screenshots reviewed. Production payload smoke passed without execution/usage/topup. Provider connectivity passed with an invalid fixture, but no real voucher was redeemed; valid payment end-to-end remains unverified.

Proxy exposed credential literals were removed from current source/release; owner must rotate the previously published provider credentials. Reservations now use atomic quota/funds admission and exact retry ACKs, sticky IP sessions, bounded deadlines and durable ambiguous-result review. UI uses actual slot/ledger fields, honors zero usage, and does not invent balance or debt from open-game counts.

For operational updates follow AGENTS.md / agent.md and the private API cloudflare/DEPLOYMENT_STATUS.md. GitHub updates Manager/bootstrap/tooling; private payload requires explicit build + D1 import + Worker deploy. Rollback must preserve latest financial ledger and both lease-pinned releases. The sections below are the historical 2026-10-12 preparation record, not the current deployment state.

## Historical preparation record


## Implemented boundaries

The shipped Manager defaults to local observation. Existing screens continue
using public bot v4.36.0. It does not silently enroll them into daily charges,
replace their runtime, reinstall main.js, or restart PelicanManager.exe.

`security/build-private-payload.js` builds a pinned-key bootstrap and guarded
private payload from the canonical private API `protected-script/bot.source.js`
(v4.37.0). The builder refuses output inside the public repository and refuses
private JWKs. Generated source, signing fixtures and packages live under the
restricted private API artifacts directory. The public repository contains the
bootstrap/tooling only; private source stays in the local/private API repository.
The public legacy source/history remains extractable, as does a running payload
in local memory. Ownership notices do not replace the technical ticket checks.

Workers authenticates the existing account credential, registers a device public
key and stable slot, and verifies device proofs before issuing P-256 tickets.
Tickets bind account/device/slot/lease/Manager instance/runtime nonce/revision,
version/hash and expiry. Private signing keys never enter Manager or bootstrap.
Current leases and revision checks protect payload/usage requests and revocation.
Manager child restarts preserve its instance and slot identities. Game passwords
are local; an offline credential change rebinds the existing remote slot and keeps
usage/debt. A lost response retries a persisted identical rebind request ID.

The bootstrap verifies its pinned public key, signature, nonce, timestamp bounds,
version metadata and SHA-256 before any payload IIFE starts. It initializes once
per document and refuses full injection over any existing bot. Partial startup
failure requires a page refresh; it does not create a second timer set.

The private builder instruments function entry points (including external Plan
IIFEs), automation timers and awaited continuations. A private Window facade
keeps already-started internal work separate from exported entry points. External
actions and DOM entries require a current authorization even during draining;
only narrow stop/cleanup, native forwarding, read-only observation and local
Humancheck paths are exempt. Native WebSocket/Storage/rendering continue after
expiry. The full-bot simulated-page regression verifies these boundaries; a real
selected pilot at a safe refresh boundary is still required before fleet use.

Lease lifetime is 5 minutes with a further 5-minute signed grace for an already
admitted runtime. Refresh requires a fresh unexpired ticket. After grace the bot
pauses at a safe boundary without closing the game. Busy coverage includes shop,
refine, storage, travel, job change, consolidation, sender trade, Weight Scroll and
Humancheck. This grace is bounded availability, not proof of complete offline
usage. Renewal cannot replace a running payload version/hash; a new release needs
the existing safe bot-update refresh flow, not reinjection.

## Free-tier delivery

The existing Wrangler login lacks KV write scope. Staging therefore uses private
D1 chunks, not public asset routes or interactive OAuth changes. Each UTF-8 chunk
is at most 60,000 bytes. Metadata and batches of at most 3 chunks require an
authenticated current lease and runtime nonce. Manager checks ordinals, declared
size/version/hash and the SHA-256 of the complete source before execution. Clients
cannot choose an arbitrary storage key or retrieve source through a public GET.

The first full-source delivery measurement used 32 ms CPU for about 1.09 MB, above
the nominal free Worker budget. That path was replaced by bounded chunk delivery;
five measured chunk deliveries used 3–6 ms and succeeded. These are samples, not a
guarantee for fleet traffic. Existing concurrent remote solve samples sometimes
used 12–16 ms; local Humancheck reduces dependence on that older path. Do not enable
a paid plan automatically. Check live error/CPU/D1 quotas during a selected pilot.

Manager renews existing profiles first, starts at most 3 downloads per cycle and
limits coordinator requests to 96 per rolling minute, below the current account
limit of 120. Large payload/catalog response bounds are separate from financial
response bounds, with streaming UTF-8 decoding and final integrity checks.

## Usage and ส่วนบุญ

User-facing wallet text uses **ส่วนบุญ**: `ส่วนบุญคงเหลือ 600` or `ส่วนบุญ -500`.
Internal API/point/localStorage names are retained for compatibility. There is no
per-image fee. A vetted seed catalog of 1,160 public game items supports local
Humancheck from a fresh install; a last-good cache is refreshed asynchronously.
API failure or negative balance does not block a confident local answer. Missing
or ambiguous matches require a manual answer.

Daily billing is deferred for every slot. An unused profile costs nothing; actual
Start/running use records a unique account/slot/Bangkok day. Midnight settlement
uses immutable rate revisions committed strictly before that day's cutoff and
an atomic, idempotent ledger entry. 100 signed integer units equal 1 ส่วนบุญ.
Fifteen used slots at 1.5 settle 2,250 units and may create debt. Shadow history is
never retroactively billable. Prepay is not implemented because the approved
default is deferred for new and existing slots.

Migration preserves account/token/legacy balances and supports the old wallet
while readiness is off. Once v2 wallet readiness is enabled, every solve/topup/
adjustment/usage writer uses authoritative units. Old direct Point writers and
wallet downgrade are rejected. Server rate, terms acceptance and activation day
remain authoritative. Administrative changes require Cloudflare Access JWT
verification and an administrator/MFA application policy; UI submission IDs must
survive retry so a lost response cannot repeat an adjustment.

Offline events stay durable. Historical events are held for review instead of
being charged as today's use. Device signatures and sequences are evidence, not
proof of actual execution: a hostile client can discard its queue. Deleting a
local profile or rebinding does not erase the old wallet ledger. Unlimited debt
and anonymous enrollment still permit a new identity; no unapproved credit limit
or first-payment requirement has been added.

## Test and readiness evidence

Verified implementation evidence: Manager regression suite 69 passed (including
8 browser reconnect/new-document recovery regressions); protected
bootstrap/full-payload simulated-page suite 10 passed; API workerd/D1 suite 34
passed; staging protected-script smoke 12 and legacy/free smoke 8 passed. API
implementation is committed locally as `89ab99c`; that repository has no remote
and was not published. Actual staging version and current source hash are in the
API `cloudflare/DEPLOYMENT_STATUS.md` (staging version
`9c236362-60d4-4e31-abcc-ecb7fdad153a`, private payload SHA-256
`a8061a5b8fcf6b6e0acfee1abdf4129cfc150f5831e75cd223df1a80480ac557`).

Manager wallet UI was inspected with mocked API data on an isolated static test
copy. An earlier admin UI image was inspected and its latest generated script/
labels passed parser/decimal/retry regressions. Automatic approval review rejected
the latest Chrome render command with only `blocked by policy`; it was not retried.
A visual review of the latest admin page remains an activation check, not a claim
that a production admin policy is already configured.

Staging opt-in configuration is documented by
`manager/script_rollout.example.json`; missing/invalid configuration stays in
observation. Editable staging pins are allowed only for the exact approved
staging origin. Production uses shipped frozen public pins and currently has
none provisioned. Configuration is read at Manager child startup; changing a
local file does not silently activate the running child or restart the EXE.

### Intermittent Edge refresh / missing bot investigation

The user reports intermittent Edge refresh returning to character selection,
followed by a missing/nonfunctional bot. A read-only live inventory found all
29 current screens healthy with bot v4.36.0 and HUD; that current browser was
Chrome, so the Edge incident itself was not reproduced or attributed conclusively.
The sampled ports included those visible in the screenshots, but profile names
had changed since the screenshots. The managed port 9339 process was also
confirmed as chrome.exe. Nine screenshot-port samples reported navigation type
`reload` but no stored bot WebGL auto-reload timestamp; this does not establish
what happened earlier in Edge.

Confirmed source gaps: a lost CDP connection dropped Manager proxies without
periodic recovery, and injection did not inspect JavaScript exception details or
verify readiness after evaluation. Page load injection had no bounded retry.
These can leave a surviving browser window reported offline or a new document
without an initialized bot. The existing low-power WebGL recovery may reload a
page, but it is only a possible trigger; no historical evidence establishes why
Edge refreshed. BrowserMode now reconnects/discovers surviving targets with
bounded backoff, repairs stale sessions even when detach events were missed, and
checks JavaScript exceptions and readiness after injection. It cancels stale
downloads when a new document appears and caps fresh-document load retries at 3.
An atomic document/runtime guard prevents duplicate timers if an older loader
finishes late. An initialized or partially initialized runtime is never fully
reinjected. Explicitly stopped screens are not reopened. The read-only proxy
`/api/browser-status` exposes redacted phase, gameAlive and botReady diagnostics
separately from whether a character is in-game. Eight real-source mock CDP tests
verify reconnect, exception, reload/download races and explicit-stop boundaries.

## Required activation sequence

1. Finish the documented staging smoke and independent review; verify release
   mirrors/ZIP and retain their hashes. Keep production solveCost=0.
2. Provision protected production signing and private chunk storage without
   serving payload source through public routes. Apply migrations with before/
   after token/balance/receipt/solve digests and both billing flags off. Provision
   the approved Access/MFA policy for admin. Do not replace shared hostname DNS.
3. Ship the approved production public key pins and choose a small explicit pilot.
   Inventory actual old-loader POST/CDP capability. Test candidate bootstrap on a
   fresh safely refreshed page, preserving settings and Start/Stop state. No full
   hot injection over v4.36.0 and no EXE restart.
4. After pilot acceptance, publish only the generated pinned bootstrap as public
   bot.js and its required copies; change version metadata through the builder.
   Existing users update through Manager and the safe bot updater. Unsupported
   loaders get a specific one-click repair/update instruction after inventory.
5. Publish terms, announced Bangkok activation day and current estimate, then
   obtain user acceptance before enabling usage settlement. Authorization and
   billing activation are separate decisions. Do not charge earlier shadow days.

Only steps 1 and isolated staging preparation are authorized/completed by this
implementation. Production activation and a real-player pilot require the owner
to select profiles/accept the reviewed conditions. No real voucher or irreversible
game operation is part of the automated tests.

## Rollback

For an authorization issue, stop new pilot admission/restore the known-good
bootstrap at safe refresh boundaries. Keep current account, slots and ledger.
For billing, disable new policy/settlement and retain signed unit balances and
immutable entries. Never lower wallet readiness, restore a stale SQLite snapshot,
or restart the stopped old service after D1 has accepted financial writes.
Audit corrections use explicit idempotent adjustments rather than editing history.
