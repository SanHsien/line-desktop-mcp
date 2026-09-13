# Repository review（Windows-only）

- Review date: 2026-09-12
- Review baseline: `b66fad4ac837240e8fc5ac3225bd04188dc7812c`
- Remediation: 同日 fork-local overlay（不回貢）
- Upstream reviewed through: `b66fad4ac837240e8fc5ac3225bd04188dc7812c`
- Primary environment: Windows 11、PowerShell、Node.js v26.7.0、Python 3.14.7（本機 gate）；產品 Node 要求 `>=24.0.0`，Python 要求 `>=3.10`
- Status: 維護骨架與產品相依環境全面可用。已完成建立 Windows 原生門禁與驗收。

## 結論

這個 fork 適合作為 Windows 本機、給 Agent 維護的 LINE Desktop MCP 線。產品行為跟隨 `bensonmaxai/line-desktop-mcp` `b66fad4`，再加上本線維護骨架：繁體中文維護文件、Windows 原生 1-click gate、純 Windows 原生維護 CI、每週上游水位追蹤（commit、PR、issue）以及每月依賴新鮮度檢查。

全庫 221 項 Node.js 測試全數通過（`npm test`），103 項 Python 測試全數通過／預期略過（`python -m unittest`）。

## 本輪實證

### 審查當下（`b66fad4`）

```text
git rev-parse HEAD
→ b66fad4ac837240e8fc5ac3225bd04188dc7812c

gh repo set-default --view
→ SanHsien/line-desktop-mcp
```

實查結果：
- 上游 repository 為 `bensonmaxai/line-desktop-mcp`，採 MIT License。
- 上游 PR 水位為 `#0`，Issue 水位為 `#1`。
- 上游未配置 GitHub Actions workflows，本 fork 建立了純 Windows 原生 CI 工作流程（涵蓋 Node 24 + Python 3.10–3.14 矩陣）。
- 維護工具無 `os.system`／`shell=True`／`eval(`／`exec(`。

## 已修 findings

| ID | 嚴重度 | 做了什麼 |
|---|---|---|
| R-01 | P2 | `.gitignore` 加入 `.env`、`.venv`、`upstream-review-report.md`、`dependency-freshness-report.md`、`.ruff_cache/` |
| R-02 | P2 | 建立獨立維護測試目錄 `tools/tests/` 與獨立 `tools/pytest.ini`，避免產品環境污染 |
| R-03 | P2 | 建立 `FORK.md`、`NOTICE.md`、`LICENSE`、`SECURITY.md`、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`，寫明對外邊界與安全性 |
| R-04 | P3 | `README.md`（繁體中文）與 `README.en.md`（英文鏡像）雙向互指，並標明 upstream 與 MIT 條款 |
| R-05 | P2 | 建立 `tools/dev_check.ps1` 與 `tools/bootstrap_dev.ps1`，規範 Windows 11 原生 PowerShell 驗收門禁 |
| R-06 | P2 | 建立 `tools/test_product.ps1` 驗證 Node.js (221 測試) 與 Python (103 測試) 產品測試全綠 |
| R-07 | P2 | 建立純 Windows 原生 CI（`ci.yml`、`codeql.yml`、`upstream-check.yml`、`dependency-freshness.yml`） |
| R-08 | P2 | 建立上游追蹤水位防重複巡檢機制，鎖定 PR `#0`、Issue `#1` |
| R-09 | P2 | 修復 Python 3.14 下深度巢狀 JSON 堆疊行為與 Fail-Closed 防禦：在 `line_scoped_core.py` 引入非遞迴的迭代式深度檢查 `_within_depth()`，杜絕因 Python 3.14 C-stack 變動導致深度巢狀惡意 JSON 被誤當作有效物件之安全漏洞與測試失敗 |
| R-10 | P2 | 解決上游 Issue #1：在 `line_encrypted_snapshot.py` 引進 `LINE_MCP_MAX_SOURCE_BYTES` 環境變數自訂讀取上限，預設保留 256MB 安全防線，為超大本機對話紀錄庫提供擴充能力，附自動化測試 |
| R-11 | P3 | 強化 Win32 原生探針安全性：在 `line-schema-probe.py` 中對 `ReadProcessMemory` API 回傳之布林 `ok` 增加顯式檢查，確保僅在 Win32 呼叫成功時存取記憶體緩衝區；清理 `line_scoped_core.py` 冗餘 import |

## 接受、不改契約

| ID | 嚴重度 | 處理 |
|---|---|---|
| - | - | （無。所有已識別項目皆已妥善處理完畢） |

## 尚未宣稱範圍

- **不宣稱** 已將任何修改提交回原作者上游（依 fork 維護政策，所有 PR/commit 僅限於 `SanHsien/line-desktop-mcp`）。

