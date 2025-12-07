// =======================
// routesStatic.js — טעינת נתוני מסלול סטטיים
// =======================

// ערכי API כמו בקוד שלך
globalThis.API_BASE = "https://kavnav.com/api";

// מזהה באיזה תאריך קוראים ל־API
globalThis.routeDate = ROUTE_DATE_OVERRIDE || isoDateTodayLocal();

// מערך הנתונים הסטטיים של כל המסלולים
globalThis.routesStatic = [];

// =======================
// פונקציה 1:1 מהקוד שלך — מביאה shapeId ו־shapeCoords
// =======================

globalThis.fetchShapeIdAndCoordsForRoute = async function (routeInfo) {
  try {
    if (!routeInfo.shapeId || typeof routeInfo.shapeId !== "string") {
      console.warn(
        `Skipping shapes: route ${routeInfo.routeId} has no shapeId`
      );
      return;
    }

    const shapeId = routeInfo.shapeId;

    const shapesUrl = `${API_BASE}/shapes?shapeIds=${encodeURIComponent(
      shapeId
    )}`;

    const shapesData = await fetchJson(shapesUrl);

    let coords = [];
    if (shapesData && typeof shapesData === "object") {
      if (Array.isArray(shapesData[shapeId])) {
        coords = shapesData[shapeId];
      } else {
        const keys = Object.keys(shapesData);
        if (keys.length && Array.isArray(shapesData[keys[0]])) {
          coords = shapesData[keys[0]];
        }
      }
    }

    if (!coords.length) {
      console.warn(
        `Shapes API returned no coords for shapeId ${shapeId} (route ${routeInfo.routeId})`
      );
      return;
    }

    routeInfo.shapeCoords = coords;
  } catch (e) {
    console.error(
      `Error fetching shapeCoords for route ${routeInfo.routeId}: ${e}`
    );
  }
};

// ====================================================
// טעינת נתוני route סטטיים עבור כל routeId בקונפיג
// ====================================================

for (const cfg of ROUTES) {
  const routeId = cfg.routeId;
  const routeIdStr = String(routeId);

  let routeData;
  try {
    const routeUrl = `${API_BASE}/route?routeId=${encodeURIComponent(
      routeId
    )}&date=${encodeURIComponent(routeDate)}`;
    routeData = await fetchJson(routeUrl);
  } catch (e) {
    const a = new Alert();
    a.title = "שגיאה בטעינת נתוני מסלול";
    a.message = `שגיאה במסלול ${routeIdStr}:\n` + String(e);
    await a.present();
    throw e;
  }

  // מידע כללי על המסלול
  let routeMeta = null;
  if (Array.isArray(routeData.routes)) {
    routeMeta =
      routeData.routes.find((r) => String(r.routeId) === routeIdStr) ||
      routeData.routes[0] ||
      null;
  }

  // שינויי מסלול
  const routeChangesForRoute =
    (routeData.routeChanges && routeData.routeChanges[routeIdStr]) || [];

  let currentChange =
    routeChangesForRoute.find((c) => c.isCurrent) ||
    routeChangesForRoute[0] ||
    null;

  const rawStoptimes = currentChange?.stoptimes || [];
  const headsign = currentChange?.headsign || routeMeta?.routeLongName || "";
  const shapeIdFromRoute = currentChange?.shapeId || null;

  // routeDescExact / prefix
  const routeCodeStatic = routeMeta?.code || null;
  const routeDirection = routeMeta?.direction || null;

  const routeDescExact = routeMeta?.routeDesc || null;
  const routeDescPrefix =
    routeCodeStatic && routeDirection
      ? `${routeCodeStatic}-${routeDirection}-`
      : null;

  // בניית רשימת תחנות
  const routeStops = rawStoptimes.map((st) => {
    const sid = String(st.stopId ?? "");
    const base = stopsById.get(sid) || {};

    return {
      stopId: sid,
      stopSequence: st.stopSequence,
      pickup: !!st.pickup,
      dropoff: !!st.dropoff,
      stopCode: base.stopCode ?? null,
      stopName: base.stopName ?? "(ללא שם)",
      lat: base.lat ?? null,
      lon: base.lon ?? null
    };
  });

  routeStops.sort((a, b) => (a.stopSequence || 0) - (b.stopSequence || 0));

  const operatorId = routeMeta?.operatorId ?? null;
  const apiColor = routeMeta?.color ?? null;
  const operatorColor = getOperatorColor(operatorId, apiColor);

  routesStatic.push({
    routeId,
    routeCode: routeCodeStatic,
    routeDate,
    routeMeta,
    headsign,
    routeStops,
    routeDescExact,
    routeDescPrefix,
    operatorId,
    operatorColor,
    shapeId: shapeIdFromRoute,
    shapeCoords: null
  });
}

// =======================
// טעינת shapeCoords לכל מסלול
// =======================

for (const r of routesStatic) {
  await fetchShapeIdAndCoordsForRoute(r);
}
