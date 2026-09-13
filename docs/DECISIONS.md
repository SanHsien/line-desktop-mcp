# 維護決策

## 2026-09-12：建立 Windows-first 維護型 fork

**決定**：fork `bensonmaxai/line-desktop-mcp`，保留 MIT License 與完整歷史。本線預設分支用 `main`。本線聚焦繁中文件、Windows 開發 gate、Windows CI，以及逐筆審查的上游追蹤。

**理由**：`line-desktop-mcp` 為結合 Codex 與 LINE Desktop 本機 MCP 整合工具，支援讀取聊天室、搜尋訊息、管理草稿與匯出對話。本 fork 補足 Windows 11 原生開發／驗收骨架、繁體中文維護入口，以及可審計的上游追蹤機制。

**限制**：

- 不把 fork 包裝成原創專案，不移除原作者 Geoffrey Wang、bensonmaxai 與官方連結。
- 維護 gate 不預設安裝重型套件。
- 上游更新必須逐筆審查。

## 2026-09-12：依賴新鮮度追蹤

**決定**：`tools/check_dependency_freshness.py` 納管 `requirements-dev.txt` 與 `requirements.txt`。

**理由**：本 repo 的產品依賴（`cryptography`, `Pillow`）與維護依賴（`pytest`, `ruff`）清單簡潔，納入每月新鮮度檢查以確保相容性。

## 2026-09-12：上游檢查涵蓋 Commit、PR 與 Issue 三面向

**決定**：`check_upstream_updates.py` 以 `--state all` 收集上游 PR 與 Issue，並追蹤 Commit SHA。`gh` 失敗時 fail closed（exit 2）。

**理由**：未合併即關閉的 PR 與待處理的 Issue 同樣可能揭露重要缺陷或需求。排程報告必須確保「未檢查」與「沒有新變更」截然分明。

## 2026-09-12：日常直接推 main

**決定**：日常維護修改在本機跑 `tools\dev_check.ps1` 後直接推 `origin/main`。Dependabot 與外部貢獻仍走 PR，合併前讀 diff。

**理由**：對齊 SanHsien 體系其他維護 fork 的治理規範。

## 2026-09-12：上游分支、PR 與 Issue 首次盤點結論

**決定**：
1. **上游分支**：僅 `upstream/main` 一個分支，刪除 origin 過期分支 `codex/windows-line-extensions`。
2. **上游 PR（共 0 筆）**：當前無 PR，水位設為 `0`。
3. **上游 Issue（共 1 筆）**：
   - `#1` OPEN：SOURCE_TOO_LARGE: 256MB hard cap on whole .edb file blocks all local-history reads for large accounts。確認為 `line_encrypted_snapshot.py` 之 256MB 靜態限制，納入已知限制與後續優化清單。
4. **水位鎖定**：`tools/upstream_baseline.json` 鎖定 Commit `b66fad4ac837240e8fc5ac3225bd04188dc7812c`、PR 水位 `0`、Issue 水位 `1`。

**理由**：
- 確立乾淨的審查基準線，增量檢查未來僅需處理大於 `#1` 的新項目或 `b66fad4` 之後的新 Commit。

## 2026-09-12：Python 3.14+ 深度巢狀 JSON 堆疊安全與 Fail-Closed 防禦硬化

**決定**：
在 `src/extensions/python/line_scoped_core.py` 的 `object_metadata()` 函式中引入非遞迴的迭代式深度檢查 `_within_depth(obj, max_depth=100)`。

**理由**：
- Python 3.14 重新設計了內部堆疊與 C 呼叫架構，標準庫 `json.loads()` 在解析達 4000 層之深度巢狀結構時不再必然觸發 Python 原生的 `RecursionError`，而會解析成功並耗用可觀記憶體。
- 原代碼僅依賴 `json.loads` 拋出 `RecursionError` 來觸發 fail-closed（回傳 `None`），導致在 Python 3.14 環境下 `test_scoped_read_keeps_valid_row_beside_deep_malformed_metadata` 等 5 項單元測試因物件被當作正常字典解析而斷言失敗。
- 引入明確的深度檢查後，任何超過 100 層之畸形或攻擊性資料結構一律在常數堆疊內被判定為不合法並安全降級回傳 `None`，徹底確保跨 Python 3.10 至 3.14 各版本的極致安全性與一貫行為。全庫 102 項 Python 測試 100% 通過。

## 2026-09-12：上游 Issue #1 解決方案——支援可配置 `LINE_MCP_MAX_SOURCE_BYTES`

**決定**：
在 `src/extensions/python/line_encrypted_snapshot.py` 中提供 `get_max_file_bytes()` 函式與 `max_bytes` 引數，支援從環境變數 `LINE_MCP_MAX_SOURCE_BYTES` 讀取自訂上限；未設定或數值不合法時預設維持 256MB。

**理由**：
- 上游 Issue #1 反映活躍帳號的 `.edb` 及 WAL 檔案容量極易突破 256MB，寫死的常數會使整個本機讀取流程丟出 `SOURCE_TOO_LARGE` 異常並中斷。
- 透過環境變數配置，既保證一般使用者的安全邊界與資源保護預設值（256MB）不變，又賦予大型帳號使用者自主調高上限之能力。
- 於 `test/python/test_line_encrypted_snapshot.py` 增加完整驗證（含預設值、非法輸入退回、有效配置與超出上限防護）。

## 2026-09-12：Win32 記憶體探測安全強化

**決定**：
在 `src/extensions/python/line-schema-probe.py` 中，呼叫 `kernel.ReadProcessMemory` 後嚴格比對回傳布林 `ok` 是否為真，方讀取 `received.value` 與處理緩衝區。

**理由**：
- 依 Win32 API 規範，若 `ReadProcessMemory` 失敗（回傳非非零值），緩衝區與 `received` 數值為未定義狀態。
- 增加 `ok and ...` 防禦性判斷，防止讀取失敗時使用未初始化記憶體。

