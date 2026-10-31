# Repository review（Windows-only）

- Review date: 2026-09-12（初版）；2026-10-29（校正產品水位至上游 v3.3.8、最新 CI 與實測邊界）
- Review baseline: `097324e678e6dba60a4c4e187054f8b7397a9100`（上游 v3.3.8）
- Remediation: fork-local overlay（不回貢）
- Upstream reviewed through: `097324e678e6dba60a4c4e187054f8b7397a9100`（PR `#2`、Issue `#1`）
- Primary environment: Windows 11、PowerShell、Node.js v26.12.1、Python 3.14.7（本機 gate）；產品 Node 要求 `>=24.0.0`，Python 要求 `>=3.10`
- Status: 維護骨架與產品相依環境全面可用。Windows 原生門禁與 CI 全綠；產品水位已採用上游 v3.3.8。

## 結論

這個 fork 適合作為 Windows 本機、給 Agent 維護的 LINE Desktop MCP 線。產品行為跟隨 `bensonmaxai/line-desktop-mcp` v3.3.8（`097324e`，[docs/DECISIONS.md](docs/DECISIONS.md)），加上本線維護骨架：繁體中文維護文件、Windows 原生 1-click gate、純 Windows 原生維護 CI、每週上游水位追蹤（commit、PR、issue）以及每月依賴新鮮度檢查。

全庫 Node.js 與 Python 測試全數通過／預期略過（`npm test`、`python -m unittest`）。

### 合成測試與帳戶實機邊界

全庫自動化測試與本機門禁（`npm test`、`python -m unittest discover -s test/python -p "test_*.py"`、`tools/dev_check.ps1`）均使用**合成測試資料與模擬介面（synthetic fixtures）**，用於驗證通訊協定、JSON 深度解析防禦、記憶體探針邊界、操作鎖排他性與各項錯誤分支，**不等於真實已登入 LINE 帳戶的實機操作**。

v3.3.8 採用的新功能（視覺上下文確認 `confirm_line_send_context`、帶 ref 開啟聊天室 `open_line_chat`、多行草稿撐高重驗、日期膠囊像素定位等）尚未取得真實帳戶實機證據（[docs/DECISIONS.md:187](docs/DECISIONS.md)）。所有實機操作驗證與待驗項目統一追蹤於 [ROADMAP.md](ROADMAP.md) 單一真相源，不以合成測試通過宣稱新版已完成實機驗證。

## 本輪實證

### 水位快照（`097324e` / v3.3.8）

```text
git rev-parse HEAD
→ 0a5ec5d67d8c3f4351137e97a5e6b3d37b480af4

gh repo set-default --view
→ SanHsien/line-desktop-mcp
```

實查結果：
- 上游 repository 為 `bensonmaxai/line-desktop-mcp`，採 MIT License。
- 上游水位審查至 commit `097324e678e6dba60a4c4e187054f8b7397a9100`（v3.3.8），PR 水位為 `#2`，Issue 水位為 `#1`，詳見 [tools/upstream_baseline.json](tools/upstream_baseline.json) 與 [docs/DECISIONS.md](docs/DECISIONS.md)。
- 上游未配置 GitHub Actions workflows，本 fork 建立了純 Windows 原生 CI 工作流程（涵蓋 Node 24 + Python 3.10–3.14 矩陣、CodeQL、Upstream check、Dependency freshness），最新 main push 執行全數成功（success），開啟安全告警為 0，Dependabot 警示為 0。
- 依賴安全：2026-10-24 升級直接依賴 `@modelcontextprotocol/sdk` 至 1.32.0 並修補傳遞依賴，當時 `npm audit` 為 0；2026-10-29 重查為 1 個 moderate（`@hono/node-server` GHSA-rmxm-3fg6-px4f），2026-10-30 已修：`npm-shrinkwrap.json` 升 `@hono/node-server` 1.19.17→2.1.5，`npm audit` 為 0（`e01601bc`）；`ruff` 0.17.2 依賴新鮮度延後處理已記錄於 `.github/dependency-deferrals.json`。
- 維護工具無 `os.system`／`shell=True`／`eval(`／`exec(`。

## 已修 findings

| ID | 嚴重度 | 做了什麼 |
|---|---|---|
| R-01 | P2 | `.gitignore` 加入 `.env`、`.venv`、`upstream-review-report.md`、`dependency-freshness-report.md`、`.ruff_cache/` |
| R-02 | P2 | 建立獨立維護測試目錄 `tools/tests/` 與獨立 `tools/pytest.ini`，避免產品環境污染 |
| R-03 | P2 | 建立 `FORK.md`、`NOTICE.md`、`LICENSE`、`SECURITY.md`、`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`，寫明對外邊界與安全性 |
| R-04 | P3 | `README.md`（繁體中文）與 `README.en.md`（英文鏡像）雙向互指，並標明 upstream 與 MIT 條款 |
| R-05 | P2 | 建立 `tools/dev_check.ps1` 與 `tools/bootstrap_dev.ps1`，規範 Windows 11 原生 PowerShell 驗收門禁 |
| R-06 | P2 | 建立 `tools/test_product.ps1` 驗證 Node.js 與 Python 產品測試全綠 |
| R-07 | P2 | 建立純 Windows 原生 CI（`ci.yml`、`codeql.yml`、`upstream-check.yml`、`dependency-freshness.yml`） |
| R-08 | P2 | 建立上游追蹤水位防重複巡檢機制，鎖定 PR `#2`、Issue `#1`、commit `097324e`（v3.3.8），以 `tools/upstream_baseline.json` 為準 |
| R-09 | P2 | 修復 Python 3.14 下深度巢狀 JSON 堆疊行為與 Fail-Closed 防禦：在 `line_scoped_core.py` 引入非遞迴的迭代式深度檢查 `_within_depth()`，杜絕因 Python 3.14 C-stack 變動導致深度巢狀惡意 JSON 被誤當作有效物件之安全漏洞與測試失敗 |
| R-10 | P2 | 解決上游 Issue #1：在 `line_encrypted_snapshot.py` 引進 `LINE_MCP_MAX_SOURCE_BYTES` 環境變數自訂讀取上限，預設保留 256MB 安全防線，為超大本機對話紀錄庫提供擴充能力，附自動化測試。**2026-10-03 由上游 v3.0.1 串流快照取代**（同一環境變數，預設 2 GiB、無效值拒絕），fork 測試改寫為新介面，見 `docs/DECISIONS.md` 同日條目 |
| R-11 | P3 | 強化 Win32 原生探針安全性：在 `line-schema-probe.py` 中對 `ReadProcessMemory` API 回傳之布林 `ok` 增加顯式檢查，確保僅在 Win32 呼叫成功時存取記憶體緩衝區；清理 `line_scoped_core.py` 冗餘 import |

## 接受、不改契約

| ID | 嚴重度 | 處理 |
|---|---|---|
| - | - | （無。所有已識別項目皆已妥善處理完畢） |

## 尚未宣稱範圍

- **不宣稱新版帳戶實機已實測**：自動化與 CI 測試全為合成測試（synthetic fixtures），不代表真實登入 LINE Desktop 帳戶實機已完成端到端驗證（包含新版帶 ref 開啟聊天室、`confirm_line_send_context` 視覺上下文確認、多行草稿撐高重驗、日期膠囊定位等）。所有實機待驗項目統一追蹤於 [ROADMAP.md](ROADMAP.md)。
- **不宣稱對方收到或已讀**：文字或訊息在本地送出不代表對方已收到或已讀，結果不確定時不自動重送（見 [README.md](README.md)）。
- **不宣稱已將任何修改提交回原作者上游**：依 fork 維護政策，所有 PR/commit 僅限於 `SanHsien/line-desktop-mcp`。
