// ================================
// webview-ui.js — טוען את webview.html מגיטהאב
// ================================

globalThis.buildHTML = async function () {
  const url =
    "https://raw.githubusercontent.com/davidpovarsky/Scriptable/main/webview.html";

  const req = new Request(url);
  req.timeoutInterval = 20;

  try {
    const html = await req.loadString();
    return html;
  } catch (e) {
    console.error("❌ שגיאה בטעינת webview.html:", e);
    throw e;
  }
};
