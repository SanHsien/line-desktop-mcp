# Install LINE Agent MCP on Windows

[Project home](../README.md) · [Features](features.md) · [Upgrade and rollback](MIGRATING.md)

This guide installs **LINE Agent MCP v2.0.0** from the maintained
[bensonmaxai/line-desktop-mcp](https://github.com/bensonmaxai/line-desktop-mcp)
repository. The display name is LINE Agent MCP; the package and MCP server name
remain `line-desktop-mcp`.

Examples use `C:\Tools`. Use an equivalent local, user-owned directory if that
path does not suit your machine. Keep the checkout, virtual environment,
downloaded archives, and extracted binaries outside OneDrive.

This release is distributed from its GitHub tag (and, when supplied on that
release, its release archive). It is **not** published to the npm registry and
does not provide an MCPB bundle. Do not install `line-desktop-mcp@latest` from
npm: it is not this release.

## Requirements

| What you want to use | Requirement |
| --- | --- |
| Base MCP server | Node.js 24 LTS or newer. The package requires Node >= 24.0.0; v2.0.0 was tested with Node 24.19.0 and pins @modelcontextprotocol/sdk 1.29.0. |
| Windows extension catalogue | Set `LINE_MCP_EXTENSIONS=1`. This exposes 29 Windows tools. Without that exact value, the original five default descriptors remain; macOS also keeps those five. |
| Local text and media context | Windows x64, a signed-in LINE Desktop process whose build is in the shipped allowlist, a 64-bit Python, both required Python packages, and the pinned SQLite3MC DLL described below. LINE Desktop 26.4.2.3957 was the tested build. |
| GUI-oriented tools | A separately installed CUA Driver, AutoHotkey v2 for the legacy GUI helper paths, and local Windows OCR only when the selected path needs it. |

The reader refuses an unknown LINE build with `LINE_BUILD_UNVERIFIED`; it does
not attempt to guess compatibility. A signed-in LINE process is required for
local reading, but this guide does not automate LINE sign-in.

The server is local **stdio only**. It has no HTTP or REST endpoint, and
command-line options are rejected before server startup. It does not
automatically load a `.env` file from the current directory: put every setting
in your MCP client's server environment.

## 1. Check out the exact release and install Node dependencies

Choose an empty local directory. Do not clone over an existing installation;
the [upgrade guide](MIGRATING.md) uses a sibling checkout so rollback stays
available.

~~~powershell
git clone --branch v2.0.0 --depth 1 https://github.com/bensonmaxai/line-desktop-mcp.git C:\Tools\line-desktop-mcp
Set-Location C:\Tools\line-desktop-mcp
git describe --exact-match --tags
npm ci --ignore-scripts
~~~

`git describe` should print `v2.0.0`. The lockfile is included, so use
`npm ci --ignore-scripts`, not an unpinned registry install. `--ignore-scripts`
keeps package lifecycle scripts from running during installation.

Confirm that the Node executable selected by your MCP client is version 24 or
newer:

~~~powershell
node --version
node -p "process.versions.node"
~~~

## 2. Prepare the local reader

The local reader creates bounded, read-only copies of the relevant LINE
database and WAL data. It is not a full account archive or a migration tool.
Even `mediaMode: "metadata"` requires both Python packages because the reader
imports `cryptography` and Pillow before selecting a media mode.

### 2.1 Create a 64-bit Python virtual environment

Install 64-bit Python separately, then use its absolute executable to make a
venv outside OneDrive. Python 3.12.14 was tested. Substitute your real
absolute Python path below.

~~~powershell
$basePython = 'C:\Tools\Python312\python.exe'
$venv = 'C:\Tools\line-desktop-mcp\.venv'
& $basePython -m venv $venv
$readerPython = Join-Path $venv 'Scripts\python.exe'
& $readerPython -m pip install -r C:\Tools\line-desktop-mcp\src\extensions\python\requirements.txt
& $readerPython -c "import platform, cryptography, PIL; print(platform.architecture()[0], cryptography.__version__, PIL.__version__)"
~~~

The requirements are `cryptography>=43.0.0` and `Pillow>=10.0.0`. The tested
versions were cryptography 50.0.1 and Pillow 12.3.0. The final command should
report a 64-bit architecture and both installed versions.

### 2.2 Download and verify the SQLite3MC DLL

The reader requires exactly the 64-bit SQLite3MultipleCiphers DLL below. It
will independently verify the DLL hash each time it is used; do not bypass a
hash mismatch or substitute another SQLite build.

Download the archive manually from the
[official SQLite3MultipleCiphers v2.5.1 release](https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.5.1/sqlite3mc-2.5.1-sqlite-3.53.4-win64.zip),
or use this explicit PowerShell sequence in an empty local runtime directory:

~~~powershell
$runtimeRoot = 'C:\Tools\line-desktop-mcp-runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$sqliteArchive = Join-Path $runtimeRoot 'sqlite3mc-2.5.1-sqlite-3.53.4-win64.zip'
Invoke-WebRequest -Uri 'https://github.com/utelle/SQLite3MultipleCiphers/releases/download/v2.5.1/sqlite3mc-2.5.1-sqlite-3.53.4-win64.zip' -OutFile $sqliteArchive
$expectedArchiveHash = '858c4f2e9e262caca06e6c4fafee62d13dd90c21b649b047f17992bf0402981e'
$actualArchiveHash = (Get-FileHash -LiteralPath $sqliteArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualArchiveHash -ne $expectedArchiveHash) { throw 'SQLite3MC archive SHA-256 mismatch.' }

$sqliteRoot = Join-Path $runtimeRoot 'sqlite3mc-2.5.1'
Expand-Archive -LiteralPath $sqliteArchive -DestinationPath $sqliteRoot
$sqliteDll = Join-Path $sqliteRoot 'dll\sqlite3mc_x64.dll'
$expectedDllHash = '5030decc6d914539e3b9b7e28aa4f6de1e7161dac6fd4b21eb02e6754d9b175e'
$actualDllHash = (Get-FileHash -LiteralPath $sqliteDll -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualDllHash -ne $expectedDllHash) { throw 'SQLite3MC DLL SHA-256 mismatch.' }
$sqliteDll
~~~

The last line must print the full path to `sqlite3mc_x64.dll`. Keep that path
for `LINE_MCP_SQLITE3MC_DLL`; it must be an absolute `.dll` path.

## 3. Optional GUI prerequisites

The local reader works without the CUA Driver. GUI-oriented operations need the
following separately maintained components; this project does not install them,
change PATH, or run a persistent service.

### CUA Driver 0.23.2

Download the
[official CUA Driver 0.23.2 Windows x86_64 archive](https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.23.2/cua-driver-rs-0.23.2-windows-x86_64-binary.zip)
and verify its archive hash before extracting it:

~~~powershell
$runtimeRoot = 'C:\Tools\line-desktop-mcp-runtime'
$driverArchive = Join-Path $runtimeRoot 'cua-driver-rs-0.23.2-windows-x86_64-binary.zip'
Invoke-WebRequest -Uri 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.23.2/cua-driver-rs-0.23.2-windows-x86_64-binary.zip' -OutFile $driverArchive
$expectedDriverArchiveHash = '27a41831d5dda71082b58154ff87966a9ad8131ce66e8060da2d860558655c13'
$actualDriverArchiveHash = (Get-FileHash -LiteralPath $driverArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualDriverArchiveHash -ne $expectedDriverArchiveHash) { throw 'CUA Driver archive SHA-256 mismatch.' }

$driverRoot = Join-Path $runtimeRoot 'cua-driver-rs-0.23.2'
Expand-Archive -LiteralPath $driverArchive -DestinationPath $driverRoot
Get-ChildItem -LiteralPath $driverRoot -Recurse -File -Filter '*.exe' | Select-Object FullName
~~~

Use the extracted driver's absolute `.exe` path for `LINE_MCP_CUA_DRIVER`.
For each UI operation, LINE Agent MCP starts that public executable with
`mcp` over stdio and closes the session afterward. It does not run an
always-on daemon.

### AutoHotkey v2 and local OCR

Install AutoHotkey v2 separately if you need the legacy GUI helper paths. A
standard installation is used at:

~~~text
C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe
~~~

For a nonstandard installation, set `LINE_MCP_AUTOHOTKEY` to an absolute
AutoHotkey v2 `.exe` path. The helper does not look on PATH or in the current
directory: it runs the resolved executable with `shell: false`. Its process
check also uses the absolute `%SystemRoot%\System32\tasklist.exe` path. These
executables are checked only at the GUI-operation boundary, so metadata and
capability calls do not install or require them.

Windows OCR is local and used only by paths that request it. Its availability
depends on the installed Windows language/OCR components; no cloud OCR is
implied.

## 4. Configure one local stdio MCP server

Keep the MCP server name as `line-desktop-mcp`. Replace every example path with
an existing absolute path on your computer. This generic configuration shows
the complete Windows extension setup:

~~~json
{
  "mcpServers": {
    "line-desktop-mcp": {
      "command": "C:/Tools/node/node.exe",
      "args": [
        "C:/Tools/line-desktop-mcp/src/server.js"
      ],
      "env": {
        "LINE_MCP_EXTENSIONS": "1",
        "LINE_MCP_PYTHON": "C:/Tools/line-desktop-mcp/.venv/Scripts/python.exe",
        "LINE_MCP_SQLITE3MC_DLL": "C:/Tools/line-desktop-mcp-runtime/sqlite3mc-2.5.1/dll/sqlite3mc_x64.dll",
        "LINE_MCP_CUA_DRIVER": "C:/Tools/line-desktop-mcp-runtime/cua-driver-rs-0.23.2/cua-driver.exe",
        "LINE_MCP_AUTOHOTKEY": "C:/Program Files/AutoHotkey/v2/AutoHotkey64.exe"
      }
    }
  }
}
~~~

The CUA Driver filename above is illustrative: use the exact `.exe` path
printed by the extraction command. The standard AutoHotkey path is already the
default; including it makes the sample explicit. Set
`LINE_MCP_AUTOHOTKEY` only to override a nonstandard installation.

For a new Codex registration, the same values can be supplied with quoted
PowerShell arguments:

~~~powershell
codex mcp add line-desktop-mcp --env "LINE_MCP_EXTENSIONS=1" --env "LINE_MCP_PYTHON=C:/Tools/line-desktop-mcp/.venv/Scripts/python.exe" --env "LINE_MCP_SQLITE3MC_DLL=C:/Tools/line-desktop-mcp-runtime/sqlite3mc-2.5.1/dll/sqlite3mc_x64.dll" --env "LINE_MCP_CUA_DRIVER=C:/Tools/line-desktop-mcp-runtime/cua-driver-rs-0.23.2/cua-driver.exe" --env "LINE_MCP_AUTOHOTKEY=C:/Program Files/AutoHotkey/v2/AutoHotkey64.exe" -- "C:\Tools\node\node.exe" "C:\Tools\line-desktop-mcp\src\server.js"
~~~

If you only want the original five tools, omit `LINE_MCP_EXTENSIONS` entirely
and reconnect the MCP client. With extensions enabled, leave the reader paths
configured for local context and the CUA/AHK paths configured for GUI work;
each affected operation reports its own unavailable prerequisite rather than
silently taking another route.

## 5. Reconnect and verify without reading a chat

Restart or reconnect your MCP client after changing its server configuration so
it refreshes the schema. The first safe call is:

~~~text
get_line_capabilities({})
~~~

On Windows with `LINE_MCP_EXTENSIONS=1`, expect `toolCount: 29`. This call
lists bridge capabilities only; it does not read a chat, inspect media, operate
LINE, or send anything.

You can also call:

~~~text
get_line_status({})
~~~

This checks LINE build and process metadata without reading a chat or scanning
memory. Its `localReader` field is **not** a full Python, package, DLL, or
database-readiness test. A successful status response therefore does not
replace the dependency checks above.

For a synthetic local verification after setup:

~~~powershell
Set-Location C:\Tools\line-desktop-mcp
$env:LINE_MCP_PYTHON = 'C:\Tools\line-desktop-mcp\.venv\Scripts\python.exe'
$env:LINE_MCP_SQLITE3MC_DLL = 'C:\Tools\line-desktop-mcp-runtime\sqlite3mc-2.5.1\dll\sqlite3mc_x64.dll'
npm test
npm run test:python
~~~

The included runners use sanitized synthetic fixtures and do not read real
chats or send LINE messages. Python tests require the configured reader
environment.

## First context request

Name the chat and the date range in the request. Start with the default
metadata mode, which returns text and attachment metadata without GUI actions
or image decoding. For example:

~~~text
Read only the named chat “Project example” from 2026-09-10 through 2026-09-11.
Use the default metadata mode, summarize the text, and do not send or open the
LINE UI.
~~~

If the returned page identifies relevant image `sourceRef` values, make a
second request using `mediaMode: "preview"` and only those refs from that same
page. PNG and JPEG previews are supported; GIF and WebP use their first frame.
Small PCM WAV blocks can be returned, while video, general audio playback,
transcription, and arbitrary file extraction are not features of this bridge.

The MCP supplies preview bytes; an image-capable AI client/model interprets
them. Decoding is local, but using a cloud AI client for interpretation is not
an entirely offline workflow. Missing, unsupported, and response-budget-deferred
cache entries are returned explicitly.

For reads, have the user name the chat and intended bounded scope. For sends
or shared changes, review the exact destination and content in the client and
obtain explicit approval at the action boundary. The reply `sourceToken` is a
short-lived visual source-attestation token, not a general permission token or
send approval.

See [Features](features.md) for behavior and limits, or
[Upgrade and rollback](MIGRATING.md) when moving from v1.2.0.
