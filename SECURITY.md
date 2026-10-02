# 安全政策

## 支援範圍

安全修正以本 fork 的最新 `main` 為主；上游版本的問題也會視需要回報社群原作者。

## 私下回報

若發現針對本 fork 維護骨架或衍生程式的安全漏洞，請使用 GitHub Security Advisories 的 **Report a vulnerability** 私下回報：
<https://github.com/SanHsien/line-desktop-mcp/security/advisories/new>。
若該入口不可用，請透過 GitHub 個人檔案聯絡維護者，不要先建立公開 Issue。

若問題屬於上游核心邏輯，亦可向社群作者 bensonmaxai 通報。

回報請包含影響範圍、重現步驟、受影響版本與最小必要證據。請勿在回報中附上真實 LINE 聊天紀錄、API key、token、個人機密文件或帳密。

## 特別注意

- **本機唯讀與記憶體存取**：`line-desktop-mcp` 本機讀取模組僅針對已登入的本機 LINE 程序與資料庫執行受限讀取，絕不可將解碼金鑰或未經使用者同意的對話歷史向外部傳輸。
- **GUI 操作確認機制**：任何寫入、送出訊息與刪除動作必須經由 Codex / MCP 客戶端向使用者確認後始得執行，防範未經審查的自動發送。
- **本專案範圍**：不要將真實個人資料、含憑證的設定檔或 API key 提交進 repository。
