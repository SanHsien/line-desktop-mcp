# 本機開發與驗證指南

本指南說明如何在 Windows 11 原生環境下建置、除錯與驗收 `line-desktop-mcp`。

## 環境需求

- **作業系統**：Windows 11 x64 原生環境（PowerShell 7 或 Windows PowerShell 5.1）
- **Node.js**：Node.js >= 24 LTS（目前本機使用 `node v26.7.0`，`npm 11.19.0`）
- **Python**：Python >= 3.10（目前本機使用 `Python 3.14.7`）
- **LINE 桌面端**（選用，僅完整本機端到端實機連線時需要）：Windows LINE Desktop 26.4.2.3957

## 1. 快速初始化維護環境

在 PowerShell 中執行初始化腳本：

```powershell
pwsh -NoProfile -File tools\bootstrap_dev.ps1
```

腳本將會自動：
1. 檢查 Node.js 與 Python 版本。
2. 執行 `npm ci --ignore-scripts` 安裝 Node.js 依賴。
3. 確保 `requirements-dev.txt`（`pytest`、`ruff`）已安裝。
4. 執行 `tools\dev_check.ps1` 進行完整驗收。

## 2. 維護驗收閘門（Dev Check）

每次提交前執行：

```powershell
pwsh -NoProfile -File tools\dev_check.ps1
```

執行檢查項目包括：
- `compileall`：編譯 `tools/` 目錄下維護 Python 腳本語法。
- `ruff check`：執行 E9 語法與 F Pyflakes 靜態分析。
- `pytest`：執行 `tools/tests/` 維護契約測試。
- `check_links.py`：檢查所有維護文件相對連結完整性。

## 3. 產品全量測試（Product Tests）

執行產品測試套件：

```powershell
pwsh -NoProfile -File tools\test_product.ps1
```

包含：
- **Node.js 測試**：`npm test`（執行 221 項自動化單元與模擬測試，涵蓋 MCP 協定、CUA 驅動、LINE UI 操作防護、工作流計畫等）。
- **Python 測試**：`python -B -m unittest discover -s test/python -p "test_*.py"`（執行 102 項本機資料庫唯讀快照、Scoped 解析與加密金鑰定位測試）。

## 4. 上游狀態同步與檢查

每週可透過以下指令檢查上游是否有新 Commit、PR 或 Issue：

```powershell
git fetch upstream main
python tools\check_upstream_updates.py --strict
```

詳細同步原則請參閱 [`docs/UPSTREAM.md`](UPSTREAM.md)。
