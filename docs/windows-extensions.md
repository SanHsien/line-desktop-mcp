# Windows tool contract — v2.0.0

[Overview](README.en.md) · [Installation](quickstart-windows.md) · [Upgrade from v1.2.0](MIGRATING.md) · [Release notes](releases/README.md)

LINE Agent MCP is the display name of the Windows community edition in `bensonmaxai/line-desktop-mcp`. Its main improvements are image-inclusive context and faster local reading. The MCP server/package identity remains `line-desktop-mcp`. It is an unofficial local bridge to a signed-in LINE Desktop.

## Connection and compatibility

Node.js 24 LTS or newer is required (tested: 24.19.0). The server exposes local **stdio only**; no HTTP/REST entry point, server listener, MCPB bundle or startup installer is included. Former HTTP CLI flags fail before startup. Configuration is inherited explicitly from the MCP client; a cwd `.env` is not automatically loaded. The npm registry is maintained separately and is not updated by this release.

Windows with `LINE_MCP_EXTENSIONS=1` exposes 29 tools. Without it, the five original descriptors remain. macOS retains those five descriptors and the original implementation; the Windows reader is not a macOS feature. Descriptor compatibility does not imply that new reply arguments or removed network transports remain compatible.

## Context with images

`get_line_local_messages` accepts one exact `chatName`, `chatType` (`auto`, `group`, `direct`), explicit `dateFrom`/`dateTo`, `messageLimit` (1–1000, default 200), optional literal `query`, cursor, `mediaMode` and selected `mediaSourceRefs`. The inclusive date window is at most 31 days. Date filtering uses **Asia/Taipei, UTC+08:00** regardless of documentation language.

Default `mediaMode: "metadata"` reads text and attachment metadata without GUI interaction or image decoding. To include pictures, request `mediaMode: "preview"`; optionally pass up to 20 source references from the authorized page. The bridge supplies MCP image blocks to an image-capable AI client/model. It does not perform its own semantic image understanding.

```json
{
  "chatName": "Sample customer",
  "chatType": "direct",
  "dateFrom": "2026-09-01",
  "dateTo": "2026-09-11",
  "messageLimit": 100,
  "mediaMode": "preview"
}
```

Use actual user-authorized names/dates, never the example as authority to read a chat. Keep requests narrow. Missing originals may have thumbnails; missing, rejected, unsupported and response-budget-deferred states are distinct. A returned preview may not be the original full-resolution file.

PNG/JPEG previews, bounded GIF/WebP first frames and small validated PCM WAV blocks are supported. There is no general video/audio playback, transcription, arbitrary attachment downloader or server media archive. Media bytes are authenticated before decryption. The reader has byte/pixel limits; do not bypass refusal by fetching unrelated files.

## Scope, freshness and speed

The reader uses bounded read-only copies of selected DB/WAL sources, verifies the LINE build/process, validates its working key and takes a fresh snapshot on each query. Source references identify returned records, not clickable UI bubbles or user permission. Pagination is bound to the original chat/date/query and takes a new snapshot for each page; it is not one immutable full-chat transaction.

`compareWithUi: true` requests one optional GUI comparison. It may focus LINE and mark the chat read. It reports unmatched directions and comparability limits, not server completeness or current action identity. The local reader never silently falls back to GUI extraction.

Bounded key discovery uses a short-lived process-specific locator hint. The hint contains coarse discovery metadata, not a key or chat text. Every reuse rechecks the process and validates current encrypted data. Missing/expired hints fall back to one bounded scan; process changes and unknown builds refuse or rediscover as appropriate. This explains why warm and cold reads differ.

## Tools

| Purpose | Tool names |
| --- | --- |
| Local text/image context | `get_line_local_messages` |
| Loaded GUI history | `get_line_chatroom_history_short`, `get_line_chatroom_history_default`, `get_line_chatroom_history_long`, `get_line_chat_messages`, `search_line_chat_messages`, `verify_line_message`, `export_line_chat_history` |
| Capabilities and plans | `get_line_capabilities`, `get_line_workflow`, `prepare_line_workflow`, `get_line_status` |
| Chat/UI identity | `open_line_chat`, `get_line_ui_state`, `confirm_line_chat_view`, `open_line_chat_feature` |
| Draft protection | `get_line_draft`, `set_line_draft`, `clear_line_draft` |
| Text/file staging and sending | `send_message_manual`, `send_message_auto`, `send_file_manual` |
| Quoted source | `get_line_reply_source_target`, `confirm_line_reply_source_target`, `stage_line_reply` |
| Other message actions | `copy_line_message`, `translate_line_message`, `stage_line_forward` |
| Already-open poll | `get_line_poll_state` |

Loaded-history tools cover only text loaded by LINE, not the local-reader date window or the full server archive. `verify_line_message` checks text presence. Exports create a new local file exclusively and do not overwrite or create restorable LINE backups.

## Reply and action boundaries

For an ordinary reply, the assistant reads the authorized recent context, presents the full recipient/draft, obtains user confirmation, sends once and verifies important results. `send_message_auto` is a plain-text dispatch primitive; user approval is the caller's responsibility, not a server-issued permission. `send_message_manual` stages a draft inside LINE when requested. Existing drafts require an exact expected-value match before replacement/clearing.

Quoted replies require fresh local source text/sender/time checks, a visual target observation, caller visual confirmation and a short-lived one-use `sourceToken`. The token binds observed pixels and source identity; it is not send approval or independent proof that the caller looked at the screenshot. Truncated or indistinguishable sources stop the automatic path.

`prepare_line_workflow` creates only a reviewable plan; its fingerprint does not authorize an action. Real mentions require blue LINE mention tokens selected and checked in the actual UI. Plain `@Name` text is insufficient. `get_line_poll_state` reads an already-open panel only after local group identity and poll-URL binding; it does not open, create, vote or publish. Missing fields stay unknown.

`send_file_manual` stages a file picker. Clicking Open is the actual upload/send step and needs the user's approval. Forwarding, shared notes/albums, reactions, recall, calls and membership changes have separate UI workflows and action boundaries. Uncertain sends are not automatically replayed.

The shared `~/.line-desktop-mcp/operation.lock` serializes supported bridge UI operations across old/new installs. It does not prevent a human or unrelated program from changing LINE. After interference, reobserve and verify; do not reuse old screenshot indices or confirmation tokens.

## Runtime and privacy

Local reads require Python x64 plus cryptography and Pillow, `LINE_MCP_PYTHON`, and the pinned `LINE_MCP_SQLITE3MC_DLL`. Python/DLL configuration is explicit; no PATH or startup installation fallback is used. `get_line_status.localReader` reports build/process metadata only, not full Python/DLL readiness or login/network/delivery proof.

GUI operations separately require `LINE_MCP_CUA_DRIVER`. AutoHotkey uses `LINE_MCP_AUTOHOTKEY` or the standard Program Files v2 executable, with literal argv and no shell/PATH lookup. The driver is called through its public stdio MCP interface. No always-on service is installed by this package.

Reader scratch state lives under `%LOCALAPPDATA%/line-desktop-mcp/line-reader`; encrypted snapshots are cleaned up after use. Locator hints contain no key or chat text. AHK operations use unique temporary script files and remove them on normal completion/failure; an interrupted process can leave temporary files. Optional `CHAT_LOG_ON=true` explicitly writes plaintext legacy-history logs, so leave it off unless a user has requested that export behavior.

Decoding/OCR are local. Tool results, including images, may be sent to the AI provider used by the client. A local bridge therefore does not imply that all processing is offline. Read only authorized named chats; do not post chat contents, account identifiers, keys, raw database files or unredacted traces in issues. [Licenses and platform terms](THIRD_PARTY.md)

## Verification

The release is verified with synthetic Node/Python tests, a clean release-archive install and actual stdio metadata initialization. Tests do not read live chats or send messages. The packaged synthetic tests are included; set the documented Python/DLL environment before Python checks.

Prior live evidence for this implementation covers Windows LINE **26.4.2.3957, Traditional Chinese UI**, and CUA Driver 0.23.2. Two actual LINE restarts were followed by successful scoped reads. Five actual cached images passed MCP transport and independent decoding checks. GIF/WebP/WAV edge cases additionally use synthetic fixtures. Other documentation languages do not certify localized LINE interfaces.

| Timing sample | Observed result | Boundary |
| --- | --- | --- |
| Earlier cold text-history reader | 17.866 s | Python core; bounded memory scan plus query |
| Optimized cold text-history reader | 4.661 s | Same machine; before the later build gate integration |
| Later warm persistent MCP reads | 0.732–0.803 s | Build gate included; fresh snapshots; model/client routing additional |

The later build gate added about 24 ms in a separate image check. These are historical same-machine observations from the maintainer's implementation, not guaranteed latency for this release archive. Image decoding and model/GUI work add time. Smaller LINE process heaps after restart can be faster; machine load and scope can also be slower. No real message content or private runtime dumps are distributed as benchmark fixtures.
