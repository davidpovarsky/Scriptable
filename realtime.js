// =======================
// realtime.js — לוגיקת זמן־אמת 1:1 מהקוד שלך
// (ללא שום top-level await)
// =======================

// הפונקציה הראשית שמביאה snapshot אחד
globalThis.pushRealtimeOnce = async function (wv) {
  try {
    const allPayloads = [];

    for (const r of routesStatic) {
      const realtimeUrl =
        `${API_BASE}/realtime?routeCode=${encodeURIComponent(r.routeCode)}`;

      const realtimeData = await fetchJson(realtimeUrl);

      const vehiclesRaw = Array.isArray(realtimeData.vehicles)
        ? realtimeData.vehicles
        : [];

      // סינון ע"פ routeDescExact / Prefix — 1:1
      const vehiclesFiltered = vehiclesRaw.filter((v) => {
        const gtfs = v.trip?.gtfsInfo || {};
        const rd = gtfs.routeDesc || "";
        if (!rd) return false;
        if (r.routeDescExact && rd === r.routeDescExact) return true;
        if (r.routeDescPrefix && rd.startsWith(r.routeDescPrefix)) return true;
        return false;
      });

      const slimVehicles = vehiclesFiltered.map((v) => {
        const trip = v.trip || {};
        const onward = trip.onwardCalls || {};
        const calls = Array.isArray(onward.calls) ? onward.calls : [];
        const gtfs = trip.gtfsInfo || {};
        const pos = v.geo?.positionOnLine?.positionOnLine ?? null;

        return {
          vehicleId: v.vehicleId,
          lastReported: v.lastReported,
          routeNumber: gtfs.routeNumber,
          headsign: gtfs.headsign,
          positionOnLine: typeof pos === "number" ? pos : null,
          onwardCalls: calls.map((c) => ({
            stopCode: c.stopCode,
            eta: c.eta
          }))
        };
      });

      allPayloads.push({
        meta: {
          routeId: r.routeId,
          routeCode: r.routeCode,
          routeDate: r.routeDate,
          routeNumber: r.routeMeta?.routeNumber ?? "",
          routeLongName: r.routeMeta?.routeLongName ?? "",
          headsign: r.headsign,
          lastSnapshot: realtimeData.lastSnapshot,
          lastVehicleReport: realtimeData.lastVehicleReport,
          operatorId: r.operatorId,
          operatorColor: r.operatorColor
        },
        stops: r.routeStops,
        vehicles: slimVehicles,
        shapeCoords: r.shapeCoords || null
      });
    }

    const js = `window.updateData(${JSON.stringify(allPayloads)});`;
    await wv.evaluateJavaScript(js, false);

  } catch (e) {
    console.error("Realtime error:", e);
  }
};

// =======================
// לולאת הריענון (ללא top-level await)
// =======================

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

  // ❌ waitForClose בוטל ב-Scriptable החדש
  // אין צורך לנסות להאזין לסגירת ה-WebView
};