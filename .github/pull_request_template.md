## 變更摘要

- 

## 動機與背景

- 

## 檢查清單

- [ ] 本機跑過 `pwsh -NoProfile -File tools\dev_check.ps1` 且全部通過（含編譯、ruff、pytest、連結檢查）。
- [ ] 若改動涉及產品邏輯，本機跑過 `pwsh -NoProfile -File tools\test_product.ps1`。
- [ ] 目標分支指向 `SanHsien/line-desktop-mcp` 的 `main` 分支（嚴禁打向上游）。
- [ ] 無包含真實個人聊天資料、私鑰、API key、token 或 `.env`。
- [ ] 若有新增文件，相關相對連結均有效。
