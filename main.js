// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: map-signs;

// KavNav line viewer with vertical stop list + realtime buses + local stops + auto-refresh + MAP
//---------------------------------------------
// זיהוי הפעלה מתוך Notification
//---------------------------------------------
const FROM_NOTIFICATION =
  (args && args.queryParameters && args.queryParameters.fromNotification) ||
  (args && args.notification ? true : false);

// ---------------------------------------------
// קריאת פרמטרים מההתראה (scriptParameter)
// ---------------------------------------------
let NOTIF_PARAMS = null;
let ROUTE_IDS_FROM_NOTIFICATION = [];
let STOP_CODE_FROM_NOTIFICATION = null;

if (args.notification && args.notification.userInfo) {
  const info = args.notification.userInfo;

  if (Array.isArray(info.routeIds)) {
    ROUTE_IDS_FROM_NOTIFICATION = info.routeIds.map((id) => Number(id));
  }

  if (info.stopCode) {
    STOP_CODE_FROM_NOTIFICATION = String(info.stopCode);
  }
}

// ---------------- CONFIG ----------------

// ✦ פה אתה מגדיר כמה מסלולים יוצגו זה לצד זה ✦
// ברירת מחדל – אם לא הגיעו routeIds מההתראה
let ROUTES = [
  { routeId: 30794 },
  { routeId: 18086 },
  // { routeId: ZZZZZ }, // תוסיף כאן מסלולים נוספים לפי הצורך
];

// אם ההפעלה הגיעה מהתראה ויש routeIds – מחליפים את הרשימה
if (ROUTE_IDS_FROM_NOTIFICATION.length > 0) {
  ROUTES = ROUTE_IDS_FROM_NOTIFICATION.map((id) => ({
    routeId: Number(id),
  }));
}

// ROUTE_ID עדיין שימושי לדברים כלליים
const ROUTE_ID = ROUTES[0].routeId;
// את ROUTE_CODE כבר לא נשתמש מתוך הקונפיג,

// תאריך
let isFromNotification = args.notification !== null;
const ROUTE_DATE_OVERRIDE = null;

const API_BASE = "https://kavnav.com/api";

// מרווח רענון בזמן אמת (מילישניות)
const REFRESH_INTERVAL_MS = 10000;

// ✦ טבלת צבעים לפי מזהה מפעיל (operatorId) – אתה תמלא כאן לבד ✦
const OPERATOR_COLORS = {
  "5": "#3868A7", // דן
  "31": "#3868A7", // דן – סניף
  "32": "#3868A7", // דן – סניף

  "3": "#218563", // אגד

  "6": "#009d43", // אופניבוס

  "40": "#aa131f", // יונייטד טורס

  "4": "#9aca3c", // אפיקים
  "25": "#9aca3c", // אפיקים – אזור נוסף

  "15": "#F3AD44", // מטרופולין

  "16": "#cdcdcd", // סופרבוס

  "18": "#99ca3c", // קווים

  "20": "#e28a07", // כרמלית

  "7": "#e0e1e3", // נתיב אקספרס (וריאנט 1)
  "14": "#e0e1e3", // נתיב אקספרס (וריאנט 2)

  "33": "#e0e1e3", // חברת משנה

  "8": "#ad1b1c", // גבי טורס

  "34": "#78be99", // תנופה

  "35": "#e0e1e3", // אקסטרה? (סניף ב"ש)

  "37": "#df8430", // EXTRA
  "38": "#df8430", // EXTRA ירושלים

  "98": "#f2d03f", // מוניות שירות
  "93": "#f2d03f",
  "91": "#f2d03f",
  "97": "#f2d03f",

  "21": "#bf4000", // קפיר/טבל
  "22": "#bf4000",

  "24": "#6fa421", // מועצה אזורית גולן

  "49": "#ffffff", // מפעיל מקומי
  "42": "#ffffff",

  "135": "#8db7e1" // דרך אגד
};
// ✦ פונקציה לקבלת צבע לחברה ✦
// 1. קודם בודקת אם מוגדר בטבלה OPERATOR_COLORS
// 2. אם לא – בודקת אם בנתוני ה-API יש color
// 3. אם אין כלום – מחזירה null (לא צובע)
function getOperatorColor(operatorId, apiColor) {
  const key = operatorId != null ? String(operatorId) : "";
  if (key && OPERATOR_COLORS[key]) return OPERATOR_COLORS[key];
  if (apiColor && typeof apiColor === "string") return apiColor;
  return null;
}

// ---------------- HELPERS ----------------

function isoDateTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchJson(url) {
  const req = new Request(url);
  req.timeoutInterval = 20;
  return await req.loadJSON();
}

function sleep(ms) {
  return new Promise((resolve) => Timer.schedule(ms / 1000, false, resolve));
}

// ---------------- LOAD LOCAL STOPS ----------------

const fm = FileManager.iCloud();
const stopsFile = fm.joinPath(fm.documentsDirectory(), "stops.json");
await fm.downloadFileFromiCloud(stopsFile);
const stopsDataRaw = fm.readString(stopsFile);
let stopsData;
try {
  stopsData = JSON.parse(stopsDataRaw);
} catch (e) {
  const a = new Alert();
  a.title = "שגיאה בטעינת stops.json";
  a.message = String(e);
  await a.present();
  return;
}

// ---------------- PREPARE STOPS MAPS ----------------

const stopsArray = Array.isArray(stopsData)
  ? stopsData
  : Array.isArray(stopsData.stops)
  ? stopsData.stops
  : [];

const stopsById = new Map();
const stopsByCode = new Map();
for (const s of stopsArray) {
  if (!s) continue;
  const id = String(s.stopId ?? "");
  const code = String(s.stopCode ?? "");
  if (id) stopsById.set(id, s);
  if (code) stopsByCode.set(code, s);
}

// ---------------- FETCH STATIC ROUTE DATA (MULTI-ROUTE) ----------------

const routeDate = ROUTE_DATE_OVERRIDE || isoDateTodayLocal();

// כאן נשמור את כל הנתונים ה"סטטיים" לכל מסלול
const routesStatic = [];


// --- גרסה מתוקנת ובטוחה לחלוטין ---
async function fetchShapeIdAndCoordsForRoute(routeInfo) {
  try {
    // אם אין shapeId → לא מביאים שום דבר ולא זורקים שגיאה
    if (!routeInfo.shapeId || typeof routeInfo.shapeId !== "string") {
      console.warn(`Skipping shapes: route ${routeInfo.routeId} has no shapeId`);
      return;
    }

        const shapeId = routeInfo.shapeId;

    const shapesUrl = `${API_BASE}/shapes?shapeIds=${encodeURIComponent(
      shapeId
    )}`;

    const shapesData = await fetchJson(shapesUrl);
    // לוודא שהתוצאה קיימת ומערך חוקי

    // לוודא שהתוצאה קיימת ומערך חוקי
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
}
   
// טעינת נתוני המסלול (route) לכל קו
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
    return;
  }

  // מידע כללי על המסלול
  let routeMeta = null;
  if (Array.isArray(routeData.routes)) {
    routeMeta =
      routeData.routes.find((r) => String(r.routeId) === routeIdStr) ||
      routeData.routes[0] ||
      null;
  }

  // routeChanges
  const routeChangesForRoute =
    (routeData.routeChanges && routeData.routeChanges[routeIdStr]) || [];
  let currentChange =
    routeChangesForRoute.find((c) => c.isCurrent) ||
    routeChangesForRoute[0] ||
    null;

  const rawStoptimes = currentChange?.stoptimes || [];
  const headsign = currentChange?.headsign || routeMeta?.routeLongName || "";
const shapeIdFromRoute = currentChange?.shapeId || null;
  // סינון realtime – ספציפי למסלול
  const routeCodeStatic = routeMeta?.code || null;
  const routeDirection = routeMeta?.direction || null;
  const routeDescExact = routeMeta?.routeDesc || null;
  const routeDescPrefix =
    routeCodeStatic && routeDirection
      ? `${routeCodeStatic}-${routeDirection}-`
      : null;

  // בניית רשימת תחנות למסלול הזה
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
      lon: base.lon ?? null,
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
  shapeCoords: null,
});
}

// אחרי שיש routeStops וכו' – נביא shapeId + shapeCoords לכל קו
for (const r of routesStatic) {
  await fetchShapeIdAndCoordsForRoute(r);
}

// ---------------- HTML SKELETON ----------------

