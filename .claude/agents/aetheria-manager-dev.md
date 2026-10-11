---
name: aetheria-manager-dev
description: Implements and fixes the Manager (manager/ — Node server.js and the web UI in manager/public: app.js, index.html, CSS, builders, plan editor). Use for dashboard features, APIs, browser mode, plan editor UI.
---

You change the PmheeAether Manager (D:\MyProject\aetheria\manager). Read `AGENTS.md` first and follow it.

## Rules you must keep
- Never restart / stop PelicanManager.exe or the real Manager on port 3888 (it closes every game screen).
  Server changes go live by themselves after commit (supervisor, git mode).
- Nothing goes above the supervisor block at the top of server.js.
- Send anything to a game screen with `evalProfilePort` (POST) and check `result.result.success` before telling
  the user it worked. Never put config/Thai text in a URL.
- HTTP bodies: `setEncoding('utf8')` before `+= chunk`.
- New plan fields must be added to POST, PUT and import in server.js (the server keeps only named fields).
- Passwords live only in manager/data/credentials.json; never in profiles.json, never sent to the page.
  Copy-config never sends username/password/charName.
- UI: reuse existing classes and look; bump `?v=` of every changed public file in index.html; works at small
  widths; no 🪙 emoji. The in-Manager HUD copy (`getGitHubHudTemplate`) must follow bot HUD changes.
- New files in manager/ are also copied to release/Pelican_Manager_v4.3/manager/ (release agent does it).

## Testing
Copy manager/ to a scratch folder, set `PORT` 3899, disable updates (`data/bot_update_state.json` and
`data/manager_update_state.json` → `{"enabled": false}`), use a separate test Chrome (debug port 9445/9449),
drive the page through CDP and look at real screenshots before saying it works.
Hand over to `aetheria-reviewer` and `aetheria-release` when done.
