(() => {

// ============================================================================
// משתנים גלובליים בתוך ה־WebView
// ============================================================================
let payloads = [];
let initialized = false;

const routeViews = new Map(); // routeId → DOM refs

let mapInstance = null;
let mapRouteLayers = [];
let mapBusLayers = [];
let mapDidInitialFit = false;


// ============================================================================
// כלי עזר
// ============================================================================
function buildBusIndex(vehicles) {
  const byStop = new Map();
  const now = new Date();
  for (const v of vehicles) {
    const calls = Array.isArray(v.onwardCalls) ? v.onwardCalls : [];
    for (const c of calls) {
      if (!c || !c.stopCode || !c.eta) continue;
      const stopCode = String(c.stopCode);
      const etaDate = new Date(c.eta);
      let minutes = Math.round((etaDate - now) / 60000);
      if (minutes < -2) continue;
      if (!byStop.has(stopCode)) byStop.set(stopCode, []);
      byStop.get(stopCode).push({ minutes });
    }
  }
  for (const arr of byStop.values()) arr.sort((a, b) => a.minutes - b.minutes);
  return byStop;
}

function classifyMinutes(minutes) {
  if (minutes <= 3) return "bus-soon";
  if (minutes <= 7) return "bus-mid";
  if (minutes <= 15) return "bus-far";
  return "bus-late";
}

function formatMinutesLabel(minutes) {
  return minutes <= 0 ? "כעת" : minutes + " דק׳";
}


// ============================================================================
// יצירת התצוגה עבור כל מסלול
// ============================================================================
function ensureLayout(allPayloads) {
  if (initialized) return;
  const container = document.getElementById("routesContainer");
  container.innerHTML = "";

  allPayloads.forEach((p) => {
    const meta = p.meta || {};
    const routeId = String(meta.routeId);

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
    metaLineDiv.textContent = "קו " + (meta.routeCode || "");
    metaLineDiv.style.fontSize = "12px";
    metaLineDiv.style.opacity = "0.9";

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

    // stops list
    const stopsList = document.createElement("div");
    stopsList.className = "stops-list";
    const rowsContainer = document.createElement("div");
    rowsContainer.className = "stops-rows";
    stopsList.appendChild(rowsContainer);

    card.appendChild(header);
    card.appendChild(stopsList);
    container.appendChild(card);

    routeViews.set(routeId, {
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


// ============================================================================
// בניית המפה
// ============================================================================
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

  mapRouteLayers.forEach((layer) => {
    try { mapInstance.removeLayer(layer); } catch (e) {}
  });
  mapRouteLayers = [];

  const allLatLngs = [];

  allPayloads.forEach((p) => {
    const meta = p.meta || {};
    const operatorColor = meta.operatorColor || "#1976d2";
    const shapeCoords = Array.isArray(p.shapeCoords) ? p.shapeCoords : [];
    const stops = Array.isArray(p.stops) ? p.stops : [];

    const group = L.layerGroup();

    // shape line
    if (shapeCoords.length) {
      const latlngs = shapeCoords
        .map((c) => Array.isArray(c) ? [c[1], c[0]] : null)
        .filter(Boolean);

      if (latlngs.length) {
        const poly = L.polyline(latlngs, {
          weight: 4,
          opacity: 0.9,
          color: operatorColor
        });
        poly.addTo(group);
        latlngs.forEach((ll) => allLatLngs.push(ll));
      }
    }

    // stops
    stops.forEach((s) => {
      if (typeof s.lat === "number" && typeof s.lon === "number") {
        const ll = [s.lat, s.lon];
        const marker = L.circleMarker(ll, { radius: 3, weight: 1 });
        marker.bindTooltip(
          (s.stopName || "") + (s.stopCode ? ` (${s.stopCode})` : ""),
          { direction: "top", offset: [0, -4] }
        );
        marker.addTo(group);
        allLatLngs.push(ll);
      }
    });

    // realtime bus positions
    const vehicles = Array.isArray(p.vehicles) ? p.vehicles : [];
    const shapeLatLngs = shapeCoords
      .map((c) => Array.isArray(c) ? [c[1], c[0]] : null)
      .filter(Boolean);

    vehicles.forEach((v) => {
      if (typeof v.positionOnLine !== "number") return;
      if (!shapeLatLngs.length) return;

      const idx = Math.floor(v.positionOnLine * (shapeLatLngs.length - 1));
      const ll = shapeLatLngs[idx];
      if (!ll) return;

      const busMarker = L.marker(ll, {
        icon: L.divIcon({
          html: `<span class="material-symbols-outlined" style="color:${operatorColor}; font-size:26px;">directions_bus</span>`,
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

  if (allLatLngs.length && !mapDidInitialFit) {
    mapInstance.fitBounds(allLatLngs, { padding: [20, 20] });
    mapDidInitialFit = true;
  }
}


// ============================================================================
// רינדור מחדש
// ============================================================================
function renderAll() {
  if (!payloads.length) return;

  ensureLayout(payloads);
  ensureMapInstance(payloads);

  payloads.forEach((payload) => {
    const meta = payload.meta || {};
    const stops = Array.isArray(payload.stops) ? payload.stops : [];
    const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
    const busesByStop = buildBusIndex(vehicles);

    const view = routeViews.get(String(meta.routeId));
    if (!view) return;

    const {
      header,
      routeNumSpan,
      headsignSpan,
      metaLineDiv,
      routeDateSpan,
      snapshotSpan,
      stopsList,
      rowsContainer
    } = view;

    const operatorColor = meta.operatorColor || "#1976d2";

    header.style.background = operatorColor;
    routeNumSpan.textContent = meta.routeNumber || meta.routeCode || "";
    headsignSpan.textContent = meta.headsign || "";
    metaLineDiv.textContent = "קו " + (meta.routeCode || "");
    routeDateSpan.textContent = meta.routeDate || "";

    const snap = meta.lastSnapshot || meta.lastVehicleReport || "-";
    snapshotSpan.textContent = "עדכון: " + (snap.split("T")[1]?.split(".")[0] || snap);

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
      seqSpan.textContent = (idx + 1) + ".";

      const txtSpan = document.createElement("span");
      txtSpan.textContent = stop.stopName;

      nameEl.appendChild(seqSpan);
      nameEl.appendChild(txtSpan);

      const codeEl = document.createElement("div");
      codeEl.className = "stop-code";
      codeEl.textContent = stop.stopCode || ("#" + stop.stopSequence);

      main.appendChild(nameEl);
      main.appendChild(codeEl);

      const stopKey = stop.stopCode ? String(stop.stopCode) : null;
      const buses = stopKey ? busesByStop.get(stopKey) || [] : [];

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

    // ציור אייקוני אוטובוסים לאורך המסלול
    setTimeout(() => {
      stopsList.querySelectorAll(".bus-icon").forEach(el => el.remove());
      const totalHeight = rowsContainer.offsetHeight;

      vehicles.forEach((v) => {
        if (typeof v.positionOnLine !== "number") return;
        let y = v.positionOnLine * totalHeight;
        if (y < 10) y = 10;
        if (y > totalHeight - 15) y = totalHeight - 15;

        const icon = document.createElement("div");
        icon.className = "bus-icon material-symbols-outlined";
        icon.textContent = "directions_bus";
        icon.style.top = `${y}px`;
        icon.style.color = operatorColor;
        if (v.routeNumber) icon.title = v.routeNumber;

        stopsList.appendChild(icon);
      });
    }, 50);
  });
}


// ============================================================================
// פונקציה שה-Scriptable קורא אליה
// ============================================================================
window.updateData = function (newPayloads) {
  payloads = Array.isArray(newPayloads) ? newPayloads : [];
  renderAll();
};

})();