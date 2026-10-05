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

## 2026-09-30：上游 v3.0.1 之後 13 個 commit（v3.1.0–v3.3.5）與 PR #2 審查

**決定**：全部列為 **adoption pending**，不合併；`reviewed_through` 推進至 `555c7c7`（已審查，不代表已合併）。

**範圍**（`b66fad4..555c7c7`）：13 個 commit、134 檔、+18,538／−718；其中 `src/` 34 檔 +7,400／−391，主要新增 `line-forward-*`（轉發交易與 UI 驗證）、`line-group-*`／`line-direct-proof`（群組與單聊搜尋驗證）、`line-plain-send`、`line-scoped-ocr`，並大改 `line-ui.mjs`（+707）、`line_encrypted_snapshot.py`（+774）、`line-local-reader.mjs`、`line_scoped_core.py`。

| 範圍 | 結論 | 理由 |
| --- | --- | --- |
| `d63279e`（v3.1.0）、`9514c7a`（v3.2.0） | adoption pending | 新增唯讀 CLI、簡化送出與 scoped read；屬功能擴充 |
| `ee2a293`（v3.3.0）、`89e7189`（v3.3.1） | adoption pending | 收件者綁定、轉發驗證、送出前群組候選驗證，屬安全性改進，優先度高；但橫跨 UI 自動化，需真實 LINE Desktop 驗證 |
| `7796922`、`282f092`、`bcda0de`、`b6513b3`、`5e441aa`、`0011314`、`555c7c7`（v3.3.2–v3.3.5） | adoption pending | OCR／搜尋分類與最近聊天選單修正，全部建立在 v3.3.0 的新模組上，無法脫離該鏈單獨採用 |
| `3f812b7`、`423ed13`（v3.0.1 後續發行說明） | 不適用 | 文件與發行說明 |
| PR #2（closed，未合併，+74／−1，4 檔）「多個 LINE 資料庫與無名單聊」 | adoption pending | 上游關閉未合併；其涉及的 `line_encrypted_snapshot.py`／`line-reader.py` 在 v3.x 已大幅重寫，隨 v3.x 一併評估 |
| Issue（高於 #1 的新項目） | 無 | 上游 issue 數仍為 1（已於 2026-09-12 處理） |

**不合併的理由**：(1) 兩邊歷史無共同祖先（本 fork 已壓縮為單一根 commit），只能以補丁方式引入，7,400 行 `src/` 變動無法逐筆 `cherry-pick`；(2) 本 fork 修改過其中 4 個共有的核心檔（`line-extensions.mjs`、`line_encrypted_snapshot.py`、`line_scoped_core.py`、`line-reader.py`），會產生大規模衝突；(3) 本機 gate（`dev_check.ps1`）只跑 ruff 與維護契約測試，不跑 Node 測試，也無真實 LINE Desktop 可驗證 UI／OCR 行為，無法證明採用後行為正確。

**觸發條件**：維護者要求升級到 v3.x 時，以 `git diff b66fad4 555c7c7` 為基礎另立分段工作（先 v3.3.0／v3.3.1 的送出前驗證，再 OCR 修正），每段附 Node 測試與 LINE Desktop 實機驗證。

## 2026-10-03：整棵採用上游 v3.3.5（`555c7c7`）

**決定**：採用 2026-09-30 列為 adoption pending 的 `b66fad4..555c7c7` 全部 13 個 commit（v3.0.1–v3.3.5），以整棵樹方式進 `main`，壓成單一 commit；上游歷史不帶回 `main`。觸發條件由維護者 2026-10-02 指示「上游待採用全部處理」成立。

**做法**：兩邊沒有共同祖先，所以在本機暫時分支上先 `git merge -s ours --allow-unrelated-histories b66fad4`（不改樹，只給三方合併一個 base），再 `git merge v3.3.5`，解完衝突後把結果樹提交成 `main` 上的一個 commit。暫時分支不推送。

**衝突與取捨**：

| 檔案 | 解法 |
| --- | --- |
| `src/extensions/python/line_encrypted_snapshot.py` | 採上游。fork 2026-09-12 為上游 issue #1 加的 `get_max_file_bytes()`／`max_bytes` 已被上游 v3.0.1 的串流快照取代：同一個 `LINE_MCP_MAX_SOURCE_BYTES`，預設 2 GiB、硬上限 8 GiB，無效值改為 `SOURCE_LIMIT_INVALID` 拒絕而不是退回預設 |
| `test/python/test_line_encrypted_snapshot.py` | fork 的上限測試保留，改寫成新介面（`capture_snapshot_to`、`load_snapshot_limits`、`SnapshotLimits`），驗同樣的性質：無效值拒絕、過小上限回 `SOURCE_TOO_LARGE`、足夠上限可通過、明確上限優先於環境變數 |
| `src/extensions/line-extensions.mjs` | 採上游；匯出寫入已搬到 `src/extensions/line-export.mjs` |
| `src/extensions/line-export.mjs` | 疊回 fork 的修正：匯出內容改從建立檔案的同一個描述子回讀（`wx+`），不再用路徑重讀，避免建立後被換掉的路徑冒充寫入內容 |
| `test/line-export.test.mjs` | 上游「回讀不符」測試原本模擬 `readFile`；fork 不走路徑重讀，改在描述子的 `read` 注入不符內容，斷言不變 |
| `test/line-ocr.test.mjs` | 上游新增的 padding 斷言寫死中文「測試」；GitHub Windows runner 只有英文 OCR。比照 fork 既有做法依 `language` 分流（zh-Hant 驗「測試」、其他驗 `LINEOCRDEMO`） |
| `test/python/test_line_scoped_core.py` | 上游測試用 `set_authorizer(None)` 清除授權函式，Python 3.11 起才有效；fork 支援 3.10，改用全允許的 callback |
| `README.md` | 採上游 v3.3.5 內容，只疊回 fork 開頭（語言列、fork 說明、初始化指令） |
| `README.en.md` | fork 自己的版本；更新版本、工具數（33＋5 個舊別名）並補 v3.x 摘要 |
| `.gitignore` | 兩邊合併 |

**驗證**：`npm test` 381 pass／0 fail；`python -B -m unittest discover -s test/python -p "test_*.py"` 140 tests OK（8 skipped）；`tools\dev_check.ps1` 綠。

**CodeQL**：上游新檔 `src/extensions/line-forward-transaction.mjs` 第 182 行被標 `js/file-system-race`（alert #4），以誤報關閉。該段先 `lstat` 擋連結（Windows 上 `O_NOFOLLOW` 為 0），再以開啟後的 `fstat` 比對 `dev`／`ino`，檢查與開啟之間被換檔會直接拒絕；拿掉 `lstat` 反而會失去 Windows 上的連結檢查。

**未驗證**：送出、轉發與 OCR 的實機行為（需要已登入的 LINE Desktop 與真實聊天），本輪只有合成測試。實際使用送出／轉發前，先在測試聊天室確認一次。

**既存、非本輪引入**：`npm audit --omit=dev` 的 2 個 moderate（`fast-uri`、`ip-address`，皆為傳遞依賴），採用前的 `main` 就有，由 Dependabot 處理。

**PR #2**（上游關閉未合併，多個 LINE 資料庫與無名單聊）：不採用。它改的 `line_encrypted_snapshot.py`／`line-reader.py` 在 v3.x 已重寫，原補丁無法套用；上游若重新提出再審。

### 2026-10-03 補記：合併後的獨立審查（2026-10-06）

對 `fa08f4f..33ac221` 做 fresh-context 審查，結論 `fix-first`：`main` 保留，不回退。送出、轉發、檔案處理、本機 DB 讀取、外部程序啟動沒有發現會送錯人、自動重送或繞過確認的缺陷。

**本次修正**：

- `docs/quickstart-windows.md`：fork 2026-09-12 的上限說明（「超過 256MB 可設 512MB 提高上限」）在上游預設改為 2 GiB 後會讓人把上限調低，改為「預設 2 GiB，超過才設，最多 8 GiB」。
- `docs/UPSTREAM.md`：PR 盤點與 issue #1 狀態改成與本條一致。

**衝突表漏列的 fork 差異**（合併時 PR 分支上另有追加提交，一併記下，避免下次同步被蓋掉）：

| 檔案 | 差異 |
| --- | --- |
| `docs/MIGRATING.md`、`docs/README.en.md`、`docs/README.id.md`、`docs/README.ja.md`、`docs/README.th.md`、`docs/quickstart-windows.md` | 安裝與支援來源改指本 fork 的 `main` |
| `test/line-local-reader.test.mjs` | 子程序清理測試的 `timeoutMs` 1000 → 5000，GitHub Windows runner 在矩陣負載下排程較慢 |
| `src/automation/line-operation-lock.mjs` | `HELPER_STARTUP_TIMEOUT_MS` 5000 → 15000，同一原因；不影響忙碌鎖判定，也不接管既有的鎖 |

**上游問題（低風險，記錄追蹤，未修）**：

- `src/extensions/line-plain-send.mjs` 的送出 journal 防護比轉發 journal 弱：`mkdir` 未檢查連結或 reparse point、讀紀錄不限大小也不驗格式、找不到 `LOCALAPPDATA` 時退回 `homedir()`。需要同一使用者的寫入權才能利用；格式錯誤時在 GUI 動作前就拋錯，結果是不送出。比照 `line-forward-transaction.mjs` 的 `ensureSafeRoot`／`readRecord` 補強。
- `src/extensions/line-forward-transaction.mjs`：任一損毀的轉發 journal 會讓所有轉發的 `prepare`／`confirm` 失敗；方向是安全的，但沒有復原說明。
- `src/extensions/line-forward-ui.mjs`：最後一次就緒檢查與點擊之間隔著寫 journal；期間若對話框變動不會重驗。journal 已先寫入，結果一律標 `UNCERTAIN`，不會自動重送。

審查未涵蓋：實機 LINE Desktop 送出、轉發與 OCR；約 18.6k 行中未逐行讀完的部分（逐行讀過送出／轉發交易、匯出、reader 啟動與清理，其餘定向抽查）。
