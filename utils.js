// utils.js
async function fetchJson(url) {
  const req = new Request(url);
  req.timeoutInterval = 20;
  return await req.loadJSON();
}

function sleep(ms) {
  return new Promise((resolve) => Timer.schedule(ms / 1000, false, resolve));
}

function isoDateTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
return `${year}-${month}-${day}`;
}


