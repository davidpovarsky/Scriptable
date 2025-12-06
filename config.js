// config.js — Scriptable-compatible

// בסיס כתובת ה־API
const API_BASE = "https://kavnav.com/api";

// מרווח רענון
const REFRESH_INTERVAL_MS = 10000;

// טבלת צבעים לפי מפעיל
const OPERATOR_COLORS = {
  "5": "#3868A7",
  "31": "#3868A7",
  "32": "#3868A7",
  "3": "#218563",
  "6": "#009d43",
  "40": "#aa131f",
  "4": "#9aca3c",
  "25": "#9aca3c",
  "15": "#F3AD44",
  "16": "#cdcdcd",
  "18": "#99ca3c",
  "20": "#e28a07",
  "7": "#e0e1e3",
  "14": "#e0e1e3",
  "33": "#e0e1e3",
  "8": "#ad1b1c",
  "34": "#78be99",
  "35": "#e0e1e3",
  "37": "#df8430",
  "38": "#df8430",
  "98": "#f2d03f",
  "93": "#f2d03f",
  "91": "#f2d03f",
  "97": "#f2d03f",
  "21": "#bf4000",
  "22": "#bf4000",
  "24": "#6fa421",
  "49": "#ffffff",
  "42": "#ffffff",
  "135": "#8db7e1"
};

// מחזירה צבע של מפעיל
function getOperatorColor(operatorId, apiColor) {
  const key = operatorId != null ? String(operatorId) : "";
  if (key && OPERATOR_COLORS[key]) return OPERATOR_COLORS[key];
  if (apiColor && typeof apiColor === "string") return apiColor;
  return null;
}
