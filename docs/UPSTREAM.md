# 上游維護

## Remote

- Fork：`origin` → `https://github.com/SanHsien/line-desktop-mcp.git`（預設分支 `main`）
- 原作者社群版：`upstream` → `https://github.com/bensonmaxai/line-desktop-mcp.git`（預設分支 `main`）
- 原始專案：`root-upstream` → `https://github.com/dtwang/line-desktop-mcp.git`（預設分支 `main`）
- 追蹤分支：`main`

## 檢查新提交

```powershell
git fetch upstream main
python tools\check_upstream_updates.py --strict
```

工具以 `tools/upstream_baseline.json` 的 `reviewed_through` 為起點，列出所有未審查提交、PR 與 Issues。
有新變更或檢查失敗時，`--strict` 回傳非零；排程 workflow 也會因此明確亮紅燈提醒。

CI 沒有 `upstream` remote，所以 baseline 的 `repo` 寫完整 clone URL，不要寫遠端短名。

## 審查清冊

每次只做一次批次審查：

1. 讀 commit 主旨與變更檔案（open PR 必須讀 diff，禁止只憑標題結案）。
2. 判斷是否與繁中 README、Windows gate、發佈閘門或測試衝突。
3. 可直接同步的提交用 merge；只需要部分修正時 cherry-pick 或最小重做。
4. 跑 `pwsh -NoProfile -File tools\dev_check.ps1`。
5. 在 `docs/DECISIONS.md` 記錄採用／略過理由。
6. 驗證完成後才把 baseline 推進到已審查的完整 40 字元 SHA 與更新 PR/Issue 水位。

Baseline 代表「已審查」，不代表「全部已合併」。

## 2026-09-12：fork 起點

本 fork 自上游 `main` `b66fad4ac837240e8fc5ac3225bd04188dc7812c`
（`Release v3.0.0 with verified chat boundaries`）建立。
此 SHA 設為第一個 `reviewed_through`（短 SHA 為 `b66fad4`）。
之後的上游 commit 才需要進入審查清冊。

---

## 2026-09-12：上游 PR、Issue、分支全面盤點

2026-09-12 對 [`bensonmaxai/line-desktop-mcp`](https://github.com/bensonmaxai/line-desktop-mcp) 進行完整盤點：
**1 個分支、0 個 PR、1 個 open Issue**。
評估結論與盤點原則如下，記錄於本檔與 [`docs/DECISIONS.md`](DECISIONS.md)，避免未來重複評估。

### 一、上游分支盤點

- 上游 remote 僅有 `upstream/main`，無其他特徵分支。
- 遠端曾存在 `origin/codex/windows-line-extensions`，經比對為 `main` 之嚴格歷史祖先分支，已於本 fork origin 清理刪除。
- 本 fork **唯一長期跟隨分支為 `upstream/main`**。

### 二、上游 PR 盤點（共 0 筆）

當前無任何待處理之 Open 或 Closed PR。水位鎖定為 `0`。

### 三、上游 Issue 盤點（共 1 筆）

| Issue 編號 | 標題 | 狀態 | 本輪評估結論與理由 |
|---|---|---|---|
| `#1` | SOURCE_TOO_LARGE: 256MB hard cap on whole .edb file blocks all local-history reads for large accounts | OPEN | **本 fork 已修復（2026-09-12）**。原上游 `src/extensions/python/line_encrypted_snapshot.py` 寫死 `MAX_FILE_BYTES = 256 * 1024 * 1024`，導致本機對話紀錄檔大於 256MB 的帳號無法讀取。本 fork 在保留預設 256MB 安全邊界的同時，引進環境變數 `LINE_MCP_MAX_SOURCE_BYTES`（整數 bytes）與 `max_bytes` 參數。使用者若帳號龐大，可於 MCP 設定中自訂調高上限（例如 512MB 或 1GB），解除阻擋。單元測試覆蓋於 `test/python/test_line_encrypted_snapshot.py`。 |

### 四、防重複評估機制（Watermark 機制）

為避免每次巡檢重複評估既有項目，本專案實施嚴格的水位線（Watermark）機制：

1. **基準水位鎖定**：
   - Commit 水位：`b66fad4ac837240e8fc5ac3225bd04188dc7812c`（短 SHA `b66fad4`）
   - PR 水位：`0`
   - Issue 水位：`1`
   - 記錄於 [`tools/upstream_baseline.json`](../tools/upstream_baseline.json)。

2. **增量巡檢機制**：
   - 每次執行 `tools/check_upstream_updates.py` 或 GitHub Actions 每週排程時，檢查器會自動過濾 `number <= watermark` 的項目。
   - 只有編號大於 **#1** 的新開 PR / Issue，或 `main` 上高於 `b66fad4` 的新 Commit，才會出現在待審報告中。
   - 當新項目被審查完畢並於 `docs/DECISIONS.md` 記錄結論後，再遞增更新 baseline 水位。
