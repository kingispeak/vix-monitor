export default {
  /* ---------- HTTP 路由 ---------- */
  async fetch(request, env) {
    const url = new URL(request.url);

    /* VIX 手動更新 / 查詢 ------------------ */
    if (url.pathname === "/fetch-vix") return fetchVIX(env);
    if (url.pathname === "/get-vix")   return returnKV(env, "vix-latest");

    /* FGI 手動更新 / 查詢 ------------------ */
    if (url.pathname === "/fetch-fgi") return fetchFGI(env);
    if (url.pathname === "/get-fgi")   return returnKV(env, "fgi-latest");

    return new Response("Not Found", { status: 404 });
  },

  /* ---------- CRON 排程 ---------- */
  async scheduled(event, env, ctx) {
    await Promise.all([ fetchVIX(env), fetchFGI(env) ]);
    console.log("[Cron] VIX & FGI 已定時更新並推送");
  }
};

/* ===== 工具 ===== */
function respondJSON(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" },
  });
}

function returnKV(env, key) {
  return env.VIX_KV.get(key).then(v => respondJSON(v ? JSON.parse(v) : "No data"));
}

async function sendLine(env, message) {
  const token = await env.LINE_BOT_TOKEN.get();
  if (!token) { console.log("❌ 未設定 LINE_BOT_TOKEN"); return; }

  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ type: "text", text: message }] }),
  });
  if (!res.ok) console.error(`[LINE BOT ERROR] ${res.status} - ${await res.text()}`);
}

/* ===== VIX ===== */
async function fetchVIX(env) {
  const api = "https://query1.finance.yahoo.com/v8/finance/chart/^VIX";
  const res = await fetch(api, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) return new Response(`VIX fetch error ${res.status}`, { status: 500 });

  const j = await res.json();
  const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
  const ts = new Date().toISOString();
  const day = ts.slice(0, 10);
  const payload = { price, timestamp: ts };

  await env.VIX_KV.put("vix-latest", JSON.stringify(payload), { expirationTtl: 300 });
  await env.VIX_KV.put(`vix-${day}`, JSON.stringify(payload));

  if (price >= 40)       await sendLine(env, `⚠️ VIX 指數過高：${price}\n市場恐慌情緒升溫！`);
  else if (price <= 15)  await sendLine(env, `🔔 VIX 指數過低：${price}\n市場可能過度樂觀，請留意風險！`);
  else                   await sendLine(env, `✅ VIX 指數：${price}\n市場情緒穩定。`);

  return respondJSON(payload);
}

/* ===== Fear & Greed Index (CNN) ===== */
async function fetchFGI(env) {
	const res = await fetch(
		"https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
		{
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
				"Accept": "application/json",
				"Referer": "https://edition.cnn.com/"
			},
			// 伺服器偶爾回 503，可加上重試或 5 秒 timeout
			cf: { fetchTimeout: 5000 }
		}
	);

	if (!res.ok) {
		const text = await res.text();          // 看看回傳訊息
		return new Response(
			`FGI API error ${res.status}: ${text}`,
			{ status: 502 }
		);
	}

  const json = await res.json();
  const value = json?.fear_and_greed?.now;
  if (typeof value !== "number") return new Response("FGI parse error", { status: 500 });

  const ts = new Date().toISOString();
  const day = ts.slice(0, 10);
  const data = { index: value, timestamp: ts };

  await env.VIX_KV.put("fgi-latest", JSON.stringify(data), { expirationTtl: 300 });
  await env.VIX_KV.put(`fgi-${day}`, JSON.stringify(data));

  if (value >= 80)       await sendLine(env, `🤑 FGI ${value}（Extreme Greed）`);
  else if (value <= 20)  await sendLine(env, `😱 FGI ${value}（Extreme Fear）`);
  else                   await sendLine(env, `📊 FGI ${value}`);

  return respondJSON(data);
}
