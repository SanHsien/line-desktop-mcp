# 功能介紹

[回專案首頁](../README.md) · [Windows 安裝指南](quickstart-windows.md) · [升級與回退](MIGRATING.md)

**LINE Agent MCP** 是
[bensonmaxai/line-desktop-mcp](https://github.com/bensonmaxai/line-desktop-mcp)
持續維護的 Windows 社群版。它的套件名稱與 MCP server 名稱仍是
`line-desktop-mcp`，透過本機 stdio 連到已登入的 LINE Desktop；它不是
LINE 官方 API。

v2.0.0 的重點是：先把指定對話的文字與附件線索讀乾淨，需要時再把可用圖片
一併交給支援影像的模型判讀，並縮短本機讀取的等待時間。

## 先看兩個主要能力

### 圖片也納入對話上下文

使用 `get_line_local_messages` 時，先指定聊天室、日期範圍與數量。預設
`mediaMode: "metadata"` 只讀取本機 DB/WAL 的文字與附件資訊，不開 LINE
視窗、不讀圖片快取，也不解碼媒體。

如果同一頁回傳了值得看的圖片 `sourceRef`，才在第二次讀取要求
`mediaMode: "preview"`，並把那一頁的 `mediaSourceRefs` 明確列出。這能讓
模型把對話文字、附件狀態與選到的圖片放在同一段工作脈絡中，也避免一次載入
整個聊天室的媒體。

| 媒體 | 行為 |
| --- | --- |
| PNG、JPEG | 回傳經驗證的圖片內容，供支援影像的 AI 客戶端／模型判讀。 |
| GIF、WebP | 只處理第一個影格。 |
| 小型 PCM WAV | 可回傳受限音訊區塊。 |
| 影片、一般音訊、其他檔案 | 回傳可用性或格式資訊；沒有通用播放、轉錄或任意檔案擷取。 |
| 快取缺失、不支援或超過回應預算 | 明確回報缺失、拒絕或延後，不會假裝已有預覽。 |

MCP 負責在本機取得與驗證可用的預覽資料；它本身不做影像語意判讀。若把預覽
交給雲端 AI 客戶端，端到端流程就不是完全離線，即使解碼本身在本機完成。

### 更快的本機讀取

在同一台測試電腦上，文字歷史的冷讀核心從 **17.866 秒**降為
**4.661 秒**。LINE 重啟後、持續 MCP 連線的暖讀樣本是
**0.732–0.803 秒**。

這些數字只描述該次實測範圍，不是每台電腦的承諾。圖片解碼、MCP 客戶端、
模型處理與 GUI 操作都不含在內，實際時間會隨 LINE 版本、快取、硬體與請求
範圍而變化。

## 本機上下文讀取的範圍

`get_line_local_messages` 是 v2.0.0 的主要讀取工具：

- 一次只讀一個指定的群組或個人聊天室，日期範圍最多 31 個日曆日。
- 支援字面文字搜尋、筆數限制與 `pagination.nextCursor`；換頁時須維持同一個
  聊天室、日期、聊天類型與查詢範圍。
- 每一頁都會建立新的本機快照，回傳快照時間與新鮮度；它不是 LINE 伺服器的
  完整歷史，也不等於帳號備份。
- 同名群組與個人對話無法唯一判斷時會拒絕，必須明確指定正確類型。
- `compareWithUi: true` 是選用的一次 GUI 對照；它可能把 LINE 帶到前景或標記
  已讀。預設不做 GUI 對照，也不會在本機讀取失敗時偷偷改用 GUI。

開始時應以「指定聊天室＋明確日期＋metadata」提出請求。例如：

~~~text
讀取「範例客戶」2026-09-10 到 2026-09-11 的對話，先用預設 metadata 模式
整理進度與待回覆事項；不要送出訊息，也不要開啟 LINE 介面。
~~~

如果回傳內容指出需看圖，再只選那一頁的 `sourceRef` 要求預覽。這樣做能保留
文字脈絡，也避免對不相關圖片進行處理。

## 工具模式與能力範圍

在 Windows 把 `LINE_MCP_EXTENSIONS=1` 設為精確值 `1` 時，MCP 提供
**29 個工具**。沒有這個值時，保留原本 5 個預設工具及其已測試的描述、順序和
成功回傳型態；macOS 也維持 5 個工具。

| 類別 | 主要內容 |
| --- | --- |
| 本機資料與核對 | `get_line_local_messages`、受限歷史、字面搜尋、精確文字存在核對、TXT/JSON/CSV 匯出。 |
| 狀態與規劃 | `get_line_capabilities`、`get_line_status`、`prepare_line_workflow`、`get_line_workflow`。 |
| 聊天室與草稿 | 開啟指定聊天室、檢查畫面、讀取／設定／清除草稿、普通文字傳送、檔案挑選器暫存。 |
| 引用與訊息操作 | 引用來源核對、視覺確認、引用草稿、複製、翻譯、轉傳選擇。 |
| LINE 功能入口 | 搜尋、記事本、相簿、投票、媒體、檔案、連結、貼圖與附件入口；需要共享狀態變更的流程仍會要求額外確認。 |

`get_line_capabilities({})` 是安裝後最安全的第一個測試：它只列出 bridge 的
能力，不讀聊天室、不讀媒體、不操作 LINE，也不傳送訊息。已啟用 Windows
擴充時，預期結果含 `toolCount: 29`。

`get_line_status({})` 同樣不讀聊天室，但它只回傳 LINE build 與程序狀態。
其中的 `localReader` 不是 Python 套件、SQLite3MC DLL 雜湊或實際資料庫讀取
是否完備的總檢查；請依[安裝指南](quickstart-windows.md)完成完整環境驗證。

## 引用、草稿、傳送與使用者確認

普通文字回覆應先在 AI 客戶端顯示完整草稿，確認收件聊天室與內容後才送出。
`send_message_manual` 只把內容暫存在 LINE；`send_message_auto` 只能用在已明確
核准的聊天室與文字。送出回應不等於對方收到或已讀，結果不明時不得自動重送。

v2.0.0 的真正引用回覆需要完整 `source`（來源文字、發話者、日期、時間與
`sourceRef`）及短效、一次性的 `sourceToken`。這個 token 代表呼叫端已目視
核對目前畫面的來源泡泡；它不是一般使用者授權 token，也不是送出許可。引用
草稿建立後仍要在送出前取得對目的地與內容的明確同意。

讀取時，使用者應命名聊天室及欲讀的範圍。MCP 會驗證工具參數與資料邊界，但
不會產生可攜的「讀取同意 token」。建立投票、反應、轉傳、上傳、收回、共享
內容或其他對外可見變更，都要在實際動作前針對精確目標與內容確認。

群組中的 `@名字` 純文字不等於 LINE 的藍色提及。若需要通知效果，必須在
LINE UI 中選取真正的成員 token，並在送出前後以新鮮畫面確認；本機紀錄或
純文字無法證明通知已送達。

## 依賴與平台邊界

本機讀取限定 Windows x64、已登入的 LINE Desktop 與隨附允許清單中的 build。
本版實測 LINE Desktop 26.4.2.3957；不在允許清單中的版本會回傳
`LINE_BUILD_UNVERIFIED`，不會勉強讀取。

讀取器需要明確設定：

| 設定 | 用途 |
| --- | --- |
| `LINE_MCP_PYTHON` | 指向 x64 venv 的絕對 `python.exe` 路徑。 |
| `LINE_MCP_SQLITE3MC_DLL` | 指向已雜湊驗證的 `sqlite3mc_x64.dll` 絕對路徑。 |
| `LINE_MCP_CUA_DRIVER` | GUI 工具使用的 CUA Driver 絕對 `.exe` 路徑。 |
| `LINE_MCP_AUTOHOTKEY` | 非標準 AutoHotkey v2 安裝時的絕對 `.exe` 覆寫路徑。 |

Python 讀取器需要 `cryptography>=43.0.0` 與 `Pillow>=10.0.0`，即使只讀
metadata 模式也一樣。SQLite3MC DLL 會在使用前重新核對固定 SHA-256。

AutoHotkey v2 的標準位置是
`C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe`。GUI helper 不會從 PATH
或目前工作目錄尋找執行檔，而是以絕對路徑和 `shell: false` 啟動；它也以
`%SystemRoot%\System32\tasklist.exe` 做程序查詢。這些條件只會在實際 GUI
操作時檢查，安裝、能力列舉與 metadata 讀取不會自動安裝任何元件。

CUA Driver 使用公開 `.exe mcp` 的 stdio 介面，每次 GUI 操作後關閉控制
session；本專案不啟動常駐 daemon。OCR 走本機 Windows 元件，是否可用取決於
系統語言/OCR 安裝狀態。

## 傳輸、設定與升級

v2.0.0 只支援本機 stdio，沒有 HTTP 或 REST 伺服器。舊 HTTP 參數會在啟動前
被拒絕，不能把它當成仍有相同網路模式的升級。此版也不會從目前工作目錄自動
讀取 `.env`；請在 MCP client 的環境設定中明確傳入所有 `LINE_MCP_*` 值。

從 v1.2.0 升級時，保留舊 checkout 與 MCP 設定備份，在同一台電腦以 sibling
checkout 安裝 v2，然後把原本的 `line-desktop-mcp` MCP entry 改指向新版本。
兩版共用 `~/.line-desktop-mcp/operation.lock`，正常工作時只能有一個 active
bridge。完整步驟、相容性差異與回退方法見[升級與回退](MIGRATING.md)。
