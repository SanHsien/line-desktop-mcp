# AGENTS.md

給 Codex、Claude Code、Cursor、Antigravity 與其他自動化代理在本專案工作時的指引。產品與使用方式先讀 [`README.md`](README.md)；開發與驗收細節見 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 專案定位

這是 [`bensonmaxai/line-desktop-mcp`](https://github.com/bensonmaxai/line-desktop-mcp)（原作者 Geoffrey Wang [`dtwang/line-desktop-mcp`](https://github.com/dtwang/line-desktop-mcp)）的 MIT License fork。
核心價值是 LINE Desktop 本機 MCP 整合、整理對話與快取圖片上下文、守護式 GUI 操作與確認後發送流程。

`origin` 是 `SanHsien/line-desktop-mcp`（預設分支 `main`），`upstream` 是社群上游 repo `bensonmaxai/line-desktop-mcp`（預設分支 `main`）。
保留原作者、社群貢獻者與 MIT License 授權。本 fork 的維護差異記在 [`FORK.md`](FORK.md) 與 [`docs/DECISIONS.md`](docs/DECISIONS.md)。

主要開發與完整驗收環境是 **Windows 11 + PowerShell**。本 fork 為純 Windows 維護線，所有測試與工作流程均在 Windows 原生環境執行。

## 硬性邊界

- 不提交真實聊天資料、快取圖片、使用者個資、專有文件、API key、token、私鑰或 `.env`。
- 不推送到 `upstream`。上游同步先跑 `python tools/check_upstream_updates.py`，逐筆審查後再 merge / cherry-pick；不盲目覆蓋 fork 文件與 Windows gate。
- 不要把維護 gate 改成完整產品依賴安裝。維護環境（`requirements-dev.txt`）僅安裝 pytest 與 ruff。
- 不把 fork 包裝成原創產品，不移除 Geoffrey Wang 與 bensonmaxai 的署名及官方連結。
- PR、push、release 一律指向 `SanHsien/line-desktop-mcp`，嚴禁未經當次許可打向 `bensonmaxai/line-desktop-mcp` 或 `dtwang/line-desktop-mcp`。

## 技術與資料流

- MCP 伺服器核心：`src/server.js`（Node.js >=24 LTS，stdio 傳輸）。
- 自動化與驅動模組：`src/automation/`（Windows UI Automation / CUA / AutoHotkey 驅動）。
- 擴充功能與本機讀取：`src/extensions/`（Node.js 轉接與 `src/extensions/python/` 唯讀解碼引擎）。
- 測試套件：
  - Node.js 測試：`test/*.test.mjs`（`npm test` 執行 221 項測試）。
  - Python 測試：`test/python/test_*.py`（`python -m unittest discover` 執行 102 項測試）。
- `tools/`：fork 維護工具（Windows gate、上游檢查、相對連結檢查、依賴新鮮度）。
- `tools/tests/`：維護契約測試。獨立於產品測試目錄。

## 開發原則

- 一般變更直接推 `origin/main`，不開功能分支、不開維護 PR。只有在需要他人審查、或改動風險高到值得先讓 CI 在 PR 上跑一輪時，才退回 **branch → PR → CI → merge**。
- 修 bug 先補可重現失敗測試，再做最小修正。
- 不為了套格式而大改上游程式；Ruff 只閘維護工具的 E9（語法）與 F（pyflakes）。
- 使用繁體中文回覆；使用者文件以繁中為主，公開入口同步維護 `README.en.md`。直接交付可驗證結果，避免冗長背景鋪陳。
- 一般變更提交前跑 `pwsh -NoProfile -File tools\dev_check.ps1` 作為驗證 gate。
- 提交訊息用 Conventional Commit。Dependabot 或外部 fork 的變更走 PR，讀 diff 並通過 CI 後再合併。
- `REVIEW.md` 是風險快照，不是每個一般 bug 的流水帳。
- 不 force-push `main`，不刪 `upstream` remote。

## 上游處理

1. `git fetch upstream main`
2. `python tools/check_upstream_updates.py --strict`
3. 逐筆判斷是否與繁中 README、Windows gate、發佈閘門或測試衝突。
4. 可同步的提交用 merge；只需要部分修正時 cherry-pick 或最小重做。
5. 跑 `pwsh -NoProfile -File tools\dev_check.ps1`
6. 採用／略過寫進 `docs/DECISIONS.md`，驗證後才推進 `tools/upstream_baseline.json`

Baseline 代表「已審查」，不代表「全部已合併」。

## 依賴新鮮度

每月的 `Dependency freshness` workflow 跑 `tools/check_dependency_freshness.py`，比對宣告與 PyPI 現行版。

紅燈只有兩種正當出口，兩種都要留下理由：

- **維持宣告**：在宣告那一行加 `# freshness-hold: <理由>`。
- **已延後**：在 `.github/dependency-deferrals.json` 加一筆
  `{"deferredLatest": "<當時看到的版本>", "reason": "<為什麼這次不升>"}`。

不要用調高下限的方式讓紅燈消失：宣告是相容性承諾，不是消音鍵。

## 驗證

```powershell
pwsh -NoProfile -File tools\bootstrap_dev.ps1
```

沒有實際跑過 Windows gate，不要宣稱本機開發環境已可用。
