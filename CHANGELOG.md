# Changelog

## 2.0.0 — 2026-09-11

**LINE context, including images. Faster local reads.** This major release continues the existing `bensonmaxai/line-desktop-mcp` repository and MCP/package identity. LINE Agent MCP is the display name of the Windows community edition, derived from Geoffrey Wang's MIT-licensed upstream project.

### Main improvements

- Combine scoped text history with on-demand cached image previews for image-capable AI clients. Original/thumbnail, missing, unsupported and budget-deferred states remain explicit.
- Faster bounded local reading: same-machine text-history cold core 17.866 → 4.661 s; later warm persistent-MCP samples 0.732–0.803 s. Image decoding, model and GUI time are additional.
- 29 opt-in Windows tools, fresh DB/WAL snapshots, source references, pagination and up to 31 days per query.
- Full quoted-source binding with one-use visual tokens; group-bound reading of an already-open poll.
- Verified LINE build checks, independent process metadata and temporary process-specific locator reuse without persisted keys.
- Five-language overview/release notes and illustrated workflows.

### Breaking changes and upgrade

- Node.js 24 or newer is required; release verification used Node.js 24.19.0.
- `stage_line_reply` requires complete `source` and a short-lived one-use `sourceToken`. Update older callers, reconnect and refresh schemas.
- Local reading requires explicitly configured Python and a verified SQLite3MC DLL, with cryptography and Pillow installed. `get_line_status.localReader` checks build/process state, not full dependency readiness.
- This release exposes **stdio only**. The inherited HTTP mode and REST entry point were removed; HTTP CLI options fail before server startup.
- The server no longer auto-loads `.env` from the launch directory. Pass configuration explicitly through the MCP client.
- Obsolete MCPB builders/installers were removed. Use this repository's source tag or release `.tgz`; no npm-registry or MCPB publication accompanies this release.

The five original default tool descriptors, macOS interface, MCP identity and `LINE_MCP_*` environment names remain. The shared `.line-desktop-mcp/operation.lock` prevents parallel bridges driving the same UI. LINE account/chat data need no migration. See [upgrade and rollback](docs/MIGRATING.md).

### Verification scope

Live GUI evidence covers Windows LINE 26.4.2.3957 with Traditional Chinese UI; date filtering/planning uses Asia/Taipei (UTC+08:00). Translations do not certify other UI locales. Local caches are not complete server archives and text presence is not a delivery/read receipt.

Localized notes: [繁體中文](docs/releases/v2.0.0.zh-TW.md) · [English](docs/releases/v2.0.0.en.md) · [日本語](docs/releases/v2.0.0.ja.md) · [ภาษาไทย](docs/releases/v2.0.0.th.md) · [Bahasa Indonesia](docs/releases/v2.0.0.id.md).

## 1.2.0 — 2026-09-10

Earlier Windows community release: 24 opt-in tools, bounded loaded-history processing, draft protection and UI navigation. Its source and release assets remain available under tag `v1.2.0`.
