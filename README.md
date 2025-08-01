[![Deploy to Cloudflare](https://github.com/kingispeak/vix-monitor/actions/workflows/deploy.yml/badge.svg)](https://github.com/kingispeak/vix-monitor/actions/workflows/deploy.yml)

# VIX 指數自動監控與 LINE Bot 廣播系統

本專案為一個部署於 Cloudflare Workers 的 VIX 指數自動監控系統，具備定時抓取 Yahoo Finance 上的 VIX 資料，快取結果、儲存歷史、並在市場情緒極端時透過 LINE Bot 進行 **群發通知（broadcast）**。

## 功能特色

- 每日定時抓取最新 VIX（支援 CRON）
- 快取最新資料至 Cloudflare KV，減少請求頻率
- 自動儲存每日 VIX 數據為 `vix-YYYY-MM-DD`
- 判斷市場情緒狀態並透過 LINE Bot 廣播
- 提供 `/fetch-vix`、`/get-vix` 功能

## 程式說明

| 路徑 | 說明 |
|---|---|
| `/fetch-vix` | 手動觸發抓取 VIX 並進行儲存與廣播 |
| `/get-vix` | 取得快取中的最新 VIX 值 |
| `/fetch-fgi` | 手動觸發抓取 CNN 恐懼與貪婪指數 |
| `/get-fgi` | 取得快取中的最新 FGI 值 |
| `scheduled()` | 自動執行每日定時任務，會由 Cron Trigger 呼叫 |

### Cron 排程設定

目前設定為每天 UTC 時區凌晨 00:00 觸發，等同於台灣時間早上 08:00。

設定位置：`wrangler.jsonc`

```jsonc
"triggers": {
  "crons": ["0 0 * * *"]
}
```

### LINE Bot 廣播條件
根據抓取的 VIX 指數值，自動分為以下三種情緒推播訊息：

| 條件 | 廣播內容 |
|------|------|
| VIX ≥ 40 | 市場恐慌情緒升溫 |
| VIX ≤ 15 | 市場可能過度樂觀 |
| 其他 | 市場情緒穩定 |

## 部署流程

1. 安裝 wrangler
```bash
npm install -g wrangler
```

2. 建立 Cloudflare KV Namespace
```bash
wrangler kv namespace create VIX_KV
wrangler kv namespace create VIX_KV --preview
```

將建立後的 id / preview_id 貼到 wrangler.jsonc 對應位置。

```json
"kv_namespaces": [
    {
      "binding": "VIX_KV",
      "id": "${KV_ID}",
      "preview_id": "${KV_PREVIEW_ID}"
    }
  ],
```

3. 本地測試
```bash
wrangler dev
```

4. 正式部署
```bash
wrangler deploy
```

### 設定 Secret

專案需要 `LINE_BOT_TOKEN` 這個 Secret 才能發送 LINE 通知。請從 [LINE Developers Console](https://developers.line.biz/console/) 取得您的 Channel Access Token，並透過以下指令設定：

```bash
wrangler secret put LINE_BOT_TOKEN
```

執行後，將會提示您輸入 Secret 值。這個值會被安全地儲存在 Cloudflare，並在執行時注入到您的 Worker 環境中。

若要在本地端 `wrangler dev` 進行測試，請建立一個 `.dev.vars` 檔案，並填入以下內容：

```
LINE_BOT_TOKEN="你的 LINE Bot Channel Access Token"
```
