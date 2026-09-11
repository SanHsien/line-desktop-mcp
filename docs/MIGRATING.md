# Upgrade from v1.2.0 to v2.0.0

[Project home](../README.md) · [Windows installation](quickstart-windows.md) · [Features](features.md)

LINE Agent MCP v2.0.0 continues the same
[bensonmaxai/line-desktop-mcp](https://github.com/bensonmaxai/line-desktop-mcp)
repository, package name, and MCP server name: **line-desktop-mcp**. Your LINE
account and chat data do not migrate. The v2 reader uses bounded, read-only
local copies and never turns them into an account backup.

Use a sibling v2 checkout and retarget the existing MCP registration. Do not
overwrite a working v1.2.0 checkout, delete it, or use `git reset` to force it
onto the new tag. Keeping the prior checkout makes rollback concrete and avoids
destroying local changes.

## Before changing anything

1. Save a copy or export of the current MCP client configuration that contains
   the `line-desktop-mcp` server entry. Keep the copy outside the installation
   directory and record the v1.2.0 command, arguments, and environment.
2. Keep the existing v1.2.0 checkout unchanged. Do not copy LINE data, keys,
   cache, or account files into the v2 directory.
3. Finish active LINE work before switching. Both versions use the same
   per-user operation lock at `~/.line-desktop-mcp/operation.lock`
   (`%USERPROFILE%\.line-desktop-mcp\operation.lock` on Windows). It
   serializes bridge operations across versions; use one active bridge for
   normal work.
4. Check the Node runtime used by the MCP client. Node 18 is unsupported by
   v2.0.0; select Node 24 LTS or newer before retargeting.

For a file-based configuration, a normal backup is a copy, not a rewrite of
the existing entry:

~~~powershell
Copy-Item -LiteralPath 'C:\path\to\your-mcp-config.json' -Destination 'C:\path\to\your-mcp-config.v1.2-backup.json'
~~~

Use your client's documented export method if it does not store MCP
configuration in a JSON file.

## Install v2 alongside v1.2.0

Choose a new local path outside OneDrive, then check out the exact tag and use
its lockfile:

~~~powershell
git clone --branch v2.0.0 --depth 1 https://github.com/bensonmaxai/line-desktop-mcp.git C:\Tools\line-desktop-mcp-v2
Set-Location C:\Tools\line-desktop-mcp-v2
git describe --exact-match --tags
npm ci --ignore-scripts
~~~

`git describe` should print `v2.0.0`. This project is not an npm registry
release and does not provide MCPB, so do not substitute `npm install
line-desktop-mcp@latest`.

Complete the v2 local-reader and optional GUI prerequisites from the
[Windows installation guide](quickstart-windows.md):

- 64-bit Python with both `cryptography>=43.0.0` and `Pillow>=10.0.0`;
- a separately downloaded, hash-verified SQLite3MC v2.5.1
  `sqlite3mc_x64.dll`;
- explicit absolute `LINE_MCP_PYTHON` and `LINE_MCP_SQLITE3MC_DLL` values;
- when using GUI tools, an explicit absolute `LINE_MCP_CUA_DRIVER`, separately
  installed AutoHotkey v2, and `LINE_MCP_AUTOHOTKEY` only for a nonstandard
  AutoHotkey executable location.

The standard AutoHotkey v2 executable is
`C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe`. The helper never searches
PATH or the working directory; it uses an absolute executable with
`shell: false`. GUI prerequisites are validated only when the selected GUI
operation runs, not during `get_line_capabilities`.

## Retarget the existing MCP registration

Keep the existing MCP server name `line-desktop-mcp`. Change its command,
`src/server.js` argument, and environment to point at the sibling v2 checkout;
do not create a second server identity for the same normal workflow.

At minimum, the v2 Windows extension configuration needs:

~~~json
{
  "command": "C:/Tools/node/node.exe",
  "args": [
    "C:/Tools/line-desktop-mcp-v2/src/server.js"
  ],
  "env": {
    "LINE_MCP_EXTENSIONS": "1",
    "LINE_MCP_PYTHON": "C:/Tools/line-desktop-mcp-v2/.venv/Scripts/python.exe",
    "LINE_MCP_SQLITE3MC_DLL": "C:/Tools/line-desktop-mcp-runtime/sqlite3mc-2.5.1/dll/sqlite3mc_x64.dll",
    "LINE_MCP_CUA_DRIVER": "C:/Tools/line-desktop-mcp-runtime/cua-driver-rs-0.23.2/cua-driver.exe",
    "LINE_MCP_AUTOHOTKEY": "C:/Program Files/AutoHotkey/v2/AutoHotkey64.exe"
  }
}
~~~

Replace every sample with a real absolute path. The displayed CUA filename is
only an example; use the extracted driver `.exe`. The AutoHotkey line is
optional when its standard installation path is available.

Do not rely on a `.env` file in the checkout. v2.0.0 does not auto-load it.
Pass settings through the MCP client's environment as shown above.

Restart or reconnect the MCP client after retargeting. It must refresh its
tool schema before calling the extension tools.

## What changes

| Area | v2.0.0 behavior |
| --- | --- |
| Package, repository, MCP name | Still `line-desktop-mcp`; continue using the same maintained GitHub repository and MCP registration name. |
| Tool catalogue | `LINE_MCP_EXTENSIONS=1` exposes 29 Windows tools. Without that exact value, the original five descriptors retain their tested shape and order; macOS keeps those five. |
| Local context | `get_line_local_messages` reads one named direct or group chat from local DB/WAL snapshots, with explicit date bounds of up to 31 calendar days, literal search, pagination, and visible freshness. It does not become a server-history archive. |
| Images and other media | Start in metadata mode. Request preview only for returned `sourceRef` values from the same page. Missing cache entries and response-budget deferrals are explicit. |
| Quoted replies | `stage_line_reply` now requires the complete `source` object and a fresh one-use `sourceToken`; a bare text/source reference from v1.2.0 is insufficient. |
| Runtime | Node 24 LTS or newer is required. The local reader requires explicit absolute Python and SQLite3MC DLL paths, plus both required Python packages. |
| Server transport | Stdio only. The inherited HTTP/REST mode was removed, and command-line options refuse before startup. There is no equivalent network migration endpoint supplied by this project. |
| Configuration | A current-directory `.env` is no longer loaded automatically. Configure `LINE_MCP_*` values explicitly in the MCP client. |

### Update quoted-reply callers

The reply flow deliberately binds the visible source before staging a quote:

1. Read the authorized, bounded local context and retain the source's full
   text, sender, date, time, and `sourceRef`.
2. Call `get_line_reply_source_target` with that complete `source`.
3. Inspect the returned source screenshot, then call
   `confirm_line_reply_source_target` with the observed source data and
   location.
4. Pass the unchanged full `source` and the short-lived, one-use
   `sourceToken` to `stage_line_reply`.

The token attests that the caller visually checked the source bubble. It is not
general user permission, does not approve a send, and cannot be reused after a
failed or completed staging attempt. Continue to review the exact recipient and
reply body with the user before any send.

### Refresh capability expectations

After reconnecting, call `get_line_capabilities({})` first. It is safe to use
before reading any chat and should report `toolCount: 29` on Windows with
extensions enabled.

`get_line_status({})` is also chat-free, but it reports build/process metadata
only. Its `localReader` result does not prove that the venv imports,
SQLite3MC DLL hash, or actual database reader are ready. Verify those
dependencies using the installation guide before treating a local-read failure
as a LINE-data issue.

## Validate the upgrade

Run the included sanitized tests from the v2 checkout:

~~~powershell
Set-Location C:\Tools\line-desktop-mcp-v2
$env:LINE_MCP_PYTHON = 'C:\Tools\line-desktop-mcp-v2\.venv\Scripts\python.exe'
$env:LINE_MCP_SQLITE3MC_DLL = 'C:\Tools\line-desktop-mcp-runtime\sqlite3mc-2.5.1\dll\sqlite3mc_x64.dll'
npm test
npm run test:python
~~~

They use synthetic fixtures and do not read real chats or send messages. The
Python suite requires the configured v2 reader environment. Then reconnect the
client and use the capability call above before authorizing any real chat
scope.

For a first read, ask for one named chat, an explicit bounded date range, and
default metadata mode. If relevant image references are returned, request
`mediaMode: "preview"` only for selected references from that same page. Image
bytes are interpreted by an image-capable AI model, not by an MCP-owned vision
model; a cloud AI client therefore makes the end-to-end interaction non-local.

## Roll back without losing the prior install

1. Stop the active v2 MCP client/bridge session and wait until it no longer
   owns the shared operation lock. Do not run both bridges to work around
   `LINE_BUSY`.
2. Retarget the same `line-desktop-mcp` MCP entry to the preserved v1.2.0
   command, arguments, and environment from the configuration backup.
3. Reconnect the MCP client so it reloads the prior schema.
4. Keep the v2 checkout, venv, and verified runtime files intact until you
   have confirmed the rollback. They do not require copying or deleting LINE
   account data.

If an abandoned process leaves the lock behind, first confirm that its recorded
owner is not active and that no LINE action may still be completing. Only then
may you remove that exact lock file manually. Never clear a live lock or replay
an uncertain send.

## Common upgrade issues

| Symptom | What to check |
| --- | --- |
| Node startup fails on an older runtime | Point the MCP client to Node 24 LTS or newer; v2.0.0 does not support Node 18. |
| Only five tools appear | Confirm `LINE_MCP_EXTENSIONS` is exactly `1`, then reconnect the client to refresh its schema. |
| `LINE_BUILD_UNVERIFIED` | The signed-in LINE build is not in the shipped allowlist. Do not bypass the check; install a compatible release or wait for an updated allowlist. |
| `ENGINE_DLL_UNCONFIGURED` or `ENGINE_INTEGRITY_FAILED` | Recheck the absolute DLL path and its SHA-256 against the install guide. Do not substitute a different DLL. |
| A status call succeeds but local reads fail | `get_line_status` is not full dependency readiness. Recheck the x64 venv, both imports, configured `LINE_MCP_PYTHON`, and configured DLL. |
| `LINE_BUSY` | Another v1.2.0 or v2.0.0 bridge operation owns the shared lock. Let it finish and use one active bridge. |
| Old HTTP settings no longer work | Remove them and configure a local stdio MCP server. This release has no HTTP/REST replacement. |

See [Windows installation](quickstart-windows.md) for fixed download hashes and
complete environment setup, and [Features](features.md) for scope, media, and
approval boundaries.
