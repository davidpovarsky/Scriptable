// ============================================================================
// realtime.js — רענון זמן אמת
// ============================================================================

const REFRESH_INTERVAL_MS = 10000;

// בקשת רענון בודדת
async function pushRealtimeOnce(wv) {
  try {
    const updates = await fetchJson("https://kavnav.com/api/realtime");
    if (!updates || !updates.routes) return;

    const payloadsArray = Array.isArray(updates.routes) ? updates.routes : [];
    const js = `window.updateData(${JSON.stringify(payloadsArray)});`;
    await wv.evaluateJavaScript(js, false);
  } catch (e) {
    console.error("❌ שגיאה ברענון זמן אמת:", e);
  }
}

// לולאת זמן אמת
globalThis.startRealtimeLoop = function (wv) {
  let keepRefreshing = true;

  async function loop() {
    await pushRealtimeOnce(wv);

    while (keepRefreshing) {
      await sleep(REFRESH_INTERVAL_MS);
      if (!keepRefreshing) break;
      await pushRealtimeOnce(wv);
    }
  }

  loop();

  // ❗ אין waitForClose יותר ב-Scriptable החדש
  // אין callback כאשר WebView נסגר
};