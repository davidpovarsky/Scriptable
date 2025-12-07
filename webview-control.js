// payloads = מערך של כל המסלולים
let payloads = [];
let initialized = false;

// נשמור פה רפרנסים לדום עבור כל מסלול
const routeViews = new Map(); // key: routeId string

// משתנים למפה
let mapInstance = null;
let mapRouteLayers = [];
let mapDidInitialFit = false; // נשתמש בזה כדי לא לעשות fitBounds יותר מפעם אחת
let mapBusLayers = [];

function buildBusIndex(vehicles) {
  const byStop = new Map();
  const now = new Date();
  for (const v of vehicles) {
    const calls = Array.isArray(v.onwardCalls) ? v.onwardCalls : [];
    for (const c of calls) {
      if (!c || !c.stopCode || !c.eta) continue;
      const stopCode = String(c.stopCode);
      const etaDate = new Date(c.eta);
      let minutes = Math.round((etaDate.getTime() - now.getTime()) / 60000);
      if (minutes < -2) continue;
      const key = stopCode;
      if (!byStop.has(key)) byStop.set(key, []);
      byStop.get(key).push({ minutes });
    }
  }
  for (const arr of byStop.values()) {
    arr.sort((a, b) => a.minutes - b.minutes);
  }
  return byStop;
}

function classifyMinutes(minutes) {
  if (minutes <= 3) return "bus-soon";
  if (minutes <= 7) return "bus-mid";
  if (minutes <= 15) return "bus-far";
  return "bus-late";
}

function formatMinutesLabel(minutes) {
  if (minutes <= 0) return "כעת";
  return minutes + " דק׳";
}

function ensureLayout(allPayloads) {
  if (initialized) return;
  const container = document.getElementById("routesContainer");
  container.innerHTML = "";

  allPayloads.forEach((p) => {
    const meta = p.meta || {};
    const routeIdStr = String(meta.routeId);

    const card = document.createElement("div");
    card.className = "route-card";

    const header = document.createElement("header");
    const lineMain = document.createElement("div");
    lineMain.className = "line-main";

    const leftDiv = document.createElement("div");
    const routeNumSpan = document.createElement("span");
    routeNumSpan.className = "route-number";
    routeNumSpan.textContent = meta.routeNumber || meta.routeCode || "";

    const headsignSpan = document.createElement("span");
    headsignSpan.className = "headsign";
    headsignSpan.textContent = meta.headsign || "";

    leftDiv.appendChild(routeNumSpan);
    leftDiv.appendChild(headsignSpan);

    const metaLineDiv = document.createElement("div");
    metaLineDiv.style.fontSize = "12px";
    metaLineDiv.style.opacity = "0.9";
    metaLineDiv.textContent = "קו " + (meta.routeCode || "");

    lineMain.appendChild(leftDiv);
    lineMain.appendChild(metaLineDiv);

    const subDiv = document.createElement("div");
    subDiv.className = "sub";

    const routeDateSpan = document.createElement("span");
    routeDateSpan.textContent = meta.routeDate || "";

    const snapshotSpan = document.createElement("span");
    snapshotSpan.textContent = "עדכון: -";

    subDiv.appendChild(routeDateSpan);
    subDiv.appendChild(snapshotSpan);

    header.appendChild(lineMain);
    header.appendChild(subDiv);

    const stopsList = document.createElement("div");
    stopsList.className = "stops-list";

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "stops-rows";
    stopsList.appendChild(rowsContainer);

    card.appendChild(header);
    card.appendChild(stopsList);

    container.appendChild(card);

    routeViews.set(routeIdStr, {
      card,
      header,
      routeNumSpan,
      headsignSpan,
      metaLineDiv,
      routeDateSpan,
      snapshotSpan,
      stopsList,
      rowsContainer,
    });
  });

  initialized = true;
}

// פונקציה לבניית המפה מתוך ה-payloads
function ensureMapInstance(allPayloads) {
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;

  if (!mapInstance) {
    mapInstance = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: ""
    }).addTo(mapInstance);
  }

  // הסרת שכבות קודמות
  mapRouteLayers.forEach(layer => {
    try { mapInstance.removeLayer(layer); } catch (e) {}
  });
  mapRouteLayers = [];

  const allLatLngs = [];

  allPayloads.forEach(p => {
    const meta = p.meta || {};
    const operatorColor = meta.operatorColor || "#1976d2";
    const shapeCoords = Array.isArray(p.shapeCoords) ? p.shapeCoords : null;
    const stops = Array.isArray(p.stops) ? p.stops : [];

    const group = L.layerGroup();

    // מסלול shape
    if (shapeCoords && shapeCoords.length) {
      const latlngs = shapeCoords
        .map(coord => Array.isArray(coord) && coord.length >= 2 ? [coord[1], coord[0]] : null)
        .filter(Boolean);

      if (latlngs.length) {
        const poly = L.polyline(latlngs, {
          weight: 4,
          opacity: 0.9,
          color: operatorColor
        });
        poly.addTo(group);
        latlngs.forEach(ll => allLatLngs.push(ll));
      }
    }

    // תחנות
    stops.forEach(s => {
      if (typeof s.lat === "number" && typeof s.lon === "number") {
        const ll = [s.lat, s.lon];
        const marker = L.circleMarker(ll, {
          radius: 3,
          weight: 1
        });
        marker.bindTooltip(
          (s.stopName || "") + (s.stopCode ? " (" + s.stopCode + ")" : ""),
          { direction: "top", offset: [0, -4] }
        );
        marker.addTo(group);
        allLatLngs.push(ll);
      }
    });

    // ---- ציור אוטובוסים על המפה לפי positionOnLine ----
    const vehicles = Array.isArray(p.vehicles) ? p.vehicles : [];

    // המרת shapeCoords לפורמט leaflet [lat, lon]
    const shapeLatLngs = Array.isArray(p.shapeCoords)
      ? p.shapeCoords
          .map(c => Array.isArray(c) && c.length >= 2 ? [c[1], c[0]] : null)
          .filter(Boolean)
      : [];

    vehicles.forEach(v => {
      if (typeof v.positionOnLine !== "number") return;
      if (!shapeLatLngs.length) return;

      const pos = v.positionOnLine;
      const idx = Math.floor(pos * (shapeLatLngs.length - 1));
      const ll = shapeLatLngs[idx];
      if (!ll) return;

      const busMarker = L.marker(ll, {
        icon: L.divIcon({
          html: '<span class="material-symbols-outlined" style="color:' +
                operatorColor +
                '; font-size:26px;">directions_bus</span>',
          className: "bus-map-icon",
          iconSize: [26, 26]
        })
      });

      busMarker.addTo(group);
      mapBusLayers.push(busMarker);
    });

    group.addTo(mapInstance);
    mapRouteLayers.push(group);
  });

  // התאמת המפה לכל המסלולים – רק בפעם הראשונה
  if (allLatLngs.length && !mapDidInitialFit) {
    mapInstance.fitBounds(allLatLngs, { padding: [20, 20] });
    mapDidInitialFit = true;
  }
}

function renderAll() {
  if (!payloads || !payloads.length) return;
  ensureLayout(payloads);

  // מפת Leaflet
  ensureMapInstance(payloads);

  payloads.forEach((payload) => {
    const meta = payload.meta || {};
    const stops = Array.isArray(payload.stops) ? payload.stops : [];
    const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
    const busesByStop = buildBusIndex(vehicles);

    const routeIdStr = String(meta.routeId);
    const view = routeViews.get(routeIdStr);
    if (!view) return;

    const {
      header,
      routeNumSpan,
      headsignSpan,
      metaLineDiv,
      routeDateSpan,
      snapshotSpan,
      stopsList,
      rowsContainer,
    } = view;

    const operatorColor = meta.operatorColor || "#1976d2";

    header.style.background = operatorColor;
    routeNumSpan.textContent = meta.routeNumber || meta.routeCode || "";
    headsignSpan.textContent = meta.headsign || "";
    metaLineDiv.textContent = "קו " + (meta.routeCode || "");
    routeDateSpan.textContent = meta.routeDate || "";

    const snap = meta.lastSnapshot || meta.lastVehicleReport || "-";
    snapshotSpan.textContent =
      "עדכון: " + (snap.split("T")[1]?.split(".")[0] || snap);

    // בניית רשימת תחנות
    rowsContainer.innerHTML = "";
    stops.forEach((stop, idx) => {
      const row = document.createElement("div");
      row.className = "stop-row";

      const timeline = document.createElement("div");
      timeline.className = "timeline";
      if (idx === 0) timeline.classList.add("first");
      if (idx === stops.length - 1) timeline.classList.add("last");

      const lineTop = document.createElement("div");
      lineTop.className = "timeline-line line-top";
      const circle = document.createElement("div");
      circle.className = "timeline-circle";
      circle.style.borderColor = operatorColor;
      const lineBottom = document.createElement("div");
      lineBottom.className = "timeline-line line-bottom";
      timeline.appendChild(lineTop);
      timeline.appendChild(circle);
      timeline.appendChild(lineBottom);

      const main = document.createElement("div");
      main.className = "stop-main";

      const nameEl = document.createElement("div");
      nameEl.className = "stop-name";
      const seqSpan = document.createElement("span");
      seqSpan.className = "seq-num";
      seqSpan.style.color = operatorColor;
      seqSpan.textContent = idx + 1 + ".";
      const txtSpan = document.createElement("span");
      txtSpan.textContent = stop.stopName;
      nameEl.appendChild(seqSpan);
      nameEl.appendChild(txtSpan);

      const codeEl = document.createElement("div");
      codeEl.className = "stop-code";
      codeEl.textContent = stop.stopCode || "#" + stop.stopSequence;

      main.appendChild(nameEl);
      main.appendChild(codeEl);

      const stopCodeKey = stop.stopCode ? String(stop.stopCode) : null;
      const buses = stopCodeKey ? busesByStop.get(stopCodeKey) || [] : [];
      if (buses.length) {
        const busesContainer = document.createElement("div");
        busesContainer.className = "stop-buses";
        buses.slice(0, 3).forEach((b) => {
          const chip = document.createElement("div");
          chip.className = "bus-chip " + classifyMinutes(b.minutes);
          chip.textContent = formatMinutesLabel(b.minutes);
          busesContainer.appendChild(chip);
        });
        main.appendChild(busesContainer);
      }

      row.appendChild(timeline);
      row.appendChild(main);
      rowsContainer.appendChild(row);
    });

    // אייקוני אוטובוסים לאורך המסלול למסלול הזה בלבד
    setTimeout(() => {
      const oldIcons = stopsList.querySelectorAll(".bus-icon");
      oldIcons.forEach((el) => el.remove());

      const totalHeight = rowsContainer.offsetHeight;
      vehicles.forEach((v) => {
        const pos =
          typeof v.positionOnLine === "number" ? v.positionOnLine : null;
        if (pos == null || isNaN(pos)) return;

        let y = pos * totalHeight;
        if (y < 10) y = 10;
        if (y > totalHeight - 15) y = totalHeight - 15;

        const icon = document.createElement("div");
        icon.className = "bus-icon material-symbols-outlined";
        icon.textContent = "directions_bus";
        icon.style.top = y + "px";
        icon.style.color = operatorColor;
        if (v.routeNumber) icon.title = v.routeNumber;
        stopsList.appendChild(icon);
      });
    }, 50);
  });
}

window.updateData = function (newPayloads) {
  payloads = Array.isArray(newPayloads) ? newPayloads : [];
  renderAll();
};