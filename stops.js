// =======================
// stops.js — טעינת תחנות מקובץ iCloud
// =======================

// טוען stops.json מה־iCloud בדיוק כפי שהיה בקוד שלך

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
  throw e; // חשוב לזרוק כדי שהסקריפט הראשי ידע שקרתה שגיאה
}

// =======================
// הכנת המפות (כמו בקוד המקורי שלך)
// =======================

globalThis.stopsArray = Array.isArray(stopsData)
  ? stopsData
  : Array.isArray(stopsData.stops)
  ? stopsData.stops
  : [];

globalThis.stopsById = new Map();
globalThis.stopsByCode = new Map();

for (const s of stopsArray) {
  if (!s) continue;

  const id = String(s.stopId ?? "");
  const code = String(s.stopCode ?? "");

  if (id) stopsById.set(id, s);
  if (code) stopsByCode.set(code, s);
}
