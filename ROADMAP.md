# 路線圖

> 本 repo 後續工作的單一真相源。做完一項，就在同一個 commit 刪掉那一列；新工作只加在這裡。
> 現況段的數字是 2026-10-29 依 `main` `61d54361e813` 查的快照，開工前先重查 GitHub。

## 現況
這是 Windows LINE Desktop 本機對話、圖片上下文與確認後傳送流程的 MCP 維護 fork，已採用上游 v3.3.8（[AGENTS.md:7](AGENTS.md)、[docs/DECISIONS.md:165](docs/DECISIONS.md)）。2026-10-29 `gh` 查詢記錄主要 workflow 最近結果成功、開啟安全告警為 0、無 fork release；issues 停用而未查到 issue（2026-10-29 `gh` 查詢）。新版視覺上下文確認、帶 ref 開啟聊天室與多行草稿重驗尚未取得實機證據（[docs/DECISIONS.md:187](docs/DECISIONS.md)）。

## 近期：可以直接動手
| 項目 | 為什麼 | 驗收方式 | 建議執行者 | 證據 |
| --- | --- | --- | --- | --- |
| 校正 REVIEW 的產品水位與實測邊界 | REVIEW 仍以早期基準概括產品，容易把測試通過誤讀為新版已實測 | 以 baseline、DECISIONS 與最新 CI 更新快照；明列合成測試與帳戶實機的差別，待驗項目只連本路線圖 | Claude Sonnet | [REVIEW.md:6](REVIEW.md)、[REVIEW.md:12](REVIEW.md)、[docs/DECISIONS.md:187](docs/DECISIONS.md) |
| 驗證新版聊天室定位與唯讀上下文 | 帶 ref 選取與日期視覺定位已移植，仍缺本機操作證據 | 維護者指定一個測試聊天室、短日期範圍及 LINE build；核對唯一 chat／account ref、標頭、日期與最小頁面結果；不發送訊息，證據去識別且不提交聊天資料 | 維護者 | [docs/DECISIONS.md:173](docs/DECISIONS.md)、[docs/DECISIONS.md:187](docs/DECISIONS.md)、[README.md:122](README.md) |

## 中期：等條件成立再做
| 項目 | 觸發條件 | 驗收方式 | 建議執行者 | 證據 |
| --- | --- | --- | --- | --- |
| 驗證確認 token、多行草稿與傳送回執 | 維護者明確核准測試聊天室、收件人與一筆測試內容 | 驗證 token 過期／範圍變動會拒絕；多行草稿重驗正確；只送一次並唯讀查本機回執，不確定時以同一 idempotencyKey 查詢，不能宣稱對方收到或已讀 | 維護者 | [docs/DECISIONS.md:173](docs/DECISIONS.md)、[docs/DECISIONS.md:181](docs/DECISIONS.md)、[README.md:44](README.md)、[README.md:46](README.md) |
| 改善日期定位效能或 reader 逾時測試 | 實機日期定位常逾時，或並行測試再次出現同一 reader 逾時 | 保存 build、耗時與最小重現；只修實際瓶頸，相關 Windows 測試及正常定位通過，不靠任意放大產品 timeout 消音 | Codex | [docs/DECISIONS.md:185](docs/DECISIONS.md)；接續開發報告（2026-10-2x）；`test/line-local-reader.test.mjs:290` |
| 區分操作鎖占用與其他 I/O 錯誤 | 在實機 PowerShell 重現非占用 IOException 被報成 LINE_BUSY | 鎖占用仍拒絕，無效路徑等回準確錯誤；雙程序競爭與釋放後重取測試通過 | Codex | 深掃報告（2026-10-27）「刻意不修／觀察」；`src/automation/line-operation-lock.mjs`、`src/automation/hold-line-operation-lock.ps1` |
| 重評 agent-relay 手機通知整合 | 維護者選定通知需求、協定與傳送授權邊界 | 用一筆核准內容驗證唯一收件人、事件去重與回執；失敗不自動重送，保留停用方式 | Claude Opus | [README.md:129](README.md)、[README.md:75](README.md) |

## 刻意不做
| 不做什麼 | 理由 | 什麼情況下重新考慮 |
| --- | --- | --- |
| 用 mock 或舊版量測宣稱新版端到端可用 | 實測界線見 [README.md:106](README.md)、[docs/DECISIONS.md:187](docs/DECISIONS.md) | 取得對應 build 與路徑的新實機證據 |
| 未確認就送訊、轉發或不確定時自動重送 | 收件人、內容與冪等邊界見 [README.md:75](README.md)、[README.md:44](README.md)、[README.md:46](README.md) | 維護者逐次核准具體收件人與內容 |
| 修改歷史版本工具數或引進 macOS 發送支援 | 歷史說明不是目前能力清單；本 fork 僅維護 Windows | 歷史敘述確有錯誤，或維護者另立平台需求 |

## 維護方式
每週依 [tools/upstream_baseline.json](tools/upstream_baseline.json) 查新 commit、PR 與 issue，使用已審基準差量同步，不因無共同祖先重寫歷史；理由留 [docs/DECISIONS.md](docs/DECISIONS.md)。每月查依賴新鮮度，未知查詢結果不可算新鮮；LINE build 改變先核對允許清單，再補指定路徑的最小實機證據。
