export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/fetch-vix") {
      return await fetchVIXAndBroadcast(env);
    }

    if (url.pathname === "/get-vix") {
      const cached = await env.VIX_KV.get("vix-latest");
      return new Response(cached || "No data", {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const res = await fetchVIXAndBroadcast(env);
    console.log("[Cron] VIX 資料已定時更新並推送");
  }
};

async function fetchVIXAndBroadcast(env) {
  const api = "https://query1.finance.yahoo.com/v8/finance/chart/^VIX";
  const res = await fetch(api, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(`Fetch error: ${res.status} - ${text}`, { status: 500 });
  }

  const data = await res.json();
  const result = data.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  const timestamp = new Date().toISOString();
  const today = timestamp.slice(0, 10);
  const payload = JSON.stringify({ price, timestamp });

  // ✅ 儲存最新快取與歷史資料
  await env.VIX_KV.put("vix-latest", payload, { expirationTtl: 300 });
  await env.VIX_KV.put(`vix-${today}`, payload);

  // ✅ 判斷情緒並廣播
  if (price >= 40) {
    await sendLineBotBroadcast(env, `⚠️ VIX 指數過高：${price}\n市場恐慌情緒升溫！`);
  } else if (price <= 15) {
    await sendLineBotBroadcast(env, `🔔 VIX 指數過低：${price}\n市場可能過度樂觀，請留意風險！`);
  } else {
    await sendLineBotBroadcast(env, `✅ VIX 指數：${price}\n市場情緒穩定。`);
  }

  return new Response(payload, {
    headers: { "Content-Type": "application/json" },
  });
}

async function sendLineBotBroadcast(env, message) {
  console.log("[LINE BOT] 廣播訊息：", message);

	const LINE_BOT_TOKEN = await env.LINE_BOT_TOKEN.get()

  if (!LINE_BOT_TOKEN) {
    console.log("❌ 尚未設定 LINE_BOT_TOKEN");
    return;
  }

  const body = JSON.stringify({
    messages: [
      {
        type: "text",
        text: message,
      }
    ]
  });

  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LINE_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[LINE BOT ERROR] ${res.status} - ${text}`);
  }
}
