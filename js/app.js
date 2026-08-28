const $ = (id) => document.getElementById(id),
  bounds = [
    [48.89, 1.6],
    [49.25, 2.6],
  ],
  map = L.map("map", {
    zoomControl: false,
    minZoom: 6,
    maxZoom: 19,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
  }).fitBounds(bounds, { padding: [8, 8] });
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);
map.createPane("noise");
map.getPane("noise").style.zIndex = 410;
map.createPane("traffic");
map.getPane("traffic").style.zIndex = 420;
map.createPane("network");
map.getPane("network").style.zIndex = 430;
map.createPane("territoryMask");
map.getPane("territoryMask").style.zIndex = 440;
map.getPane("territoryMask").style.pointerEvents = "none";
map.createPane("pulse");
map.getPane("pulse").style.zIndex = 650;
const rasterBounds = [
    [48.911488, 1.6035671],
    [49.248488, 2.5965671],
  ],
  state = {
    layers: {},
    stats: {},
    active: new Set(["stations", "roadNoise", "roads", "csRoad", "csRail"]),
    data: {},
  };
function openDetail(html) {
  $("detailContent").innerHTML = html;
  $("detailPanel").classList.add("open");
}
function closeDetail() {
  $("detailPanel").classList.remove("open");
  $("detailContent").replaceChildren();
  if (state.layers.clickMarker) {
    map.removeLayer(state.layers.clickMarker);
    delete state.layers.clickMarker;
  }
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function fmt(n, d = 0) {
  return Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: d });
}
function noiseColor(v) {
  return v >= 70
    ? "#691635"
    : v >= 65
      ? "#ab202f"
      : v >= 60
        ? "#e05b31"
        : v >= 55
          ? "#f5a623"
          : v >= 50
            ? "#ffe05b"
            : v >= 45
              ? "#74c476"
              : "#57abd2";
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
function insideTerritory(lon, lat) {
  const geometry = state.data.boundary?.features?.[0]?.geometry;
  if (!geometry) return true;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (polygon) =>
      pointInRing(lon, lat, polygon[0]) &&
      !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole)),
  );
}
function addTerritoryMask(boundary) {
  const geometry = boundary.features[0].geometry;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const world = [
    [-85, -180],
    [-85, 180],
    [85, 180],
    [85, -180],
  ];
  const holes = polygons.map((polygon) =>
    polygon[0].map(([lon, lat]) => [lat, lon]),
  );
  state.layers.territoryMask = L.polygon([world, ...holes], {
    pane: "territoryMask",
    stroke: false,
    fillColor: "#d9dde2",
    fillOpacity: 0.58,
    fillRule: "evenodd",
    interactive: false,
  }).addTo(map);
}
const roadNoise = L.imageOverlay("data/noise-road.png", rasterBounds, {
    pane: "noise",
    opacity: 0.76,
  }),
  railNoise = L.imageOverlay("data/noise-rail.png", rasterBounds, {
    pane: "noise",
    opacity: 0.78,
  });
const airNoise = L.imageOverlay("data/air-bruit-2024.png", rasterBounds, {pane:"noise",opacity:.54});
const artificial = L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OCSGE.ARTIF.2024-2026&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",{opacity:.46,maxZoom:19,attribution:"IGN · OCS GE"});
state.layers.airNoise=airNoise;
state.layers.artificial=artificial;
state.layers.stations=L.layerGroup().addTo(map);
state.layers.equipment=L.layerGroup();
state.layers.temperature=L.layerGroup();
state.layers.heat=L.layerGroup();
state.layers.roadNoise = roadNoise;
state.layers.railNoise = railNoise;
roadNoise.addTo(map);
const trafficLayer = L.layerGroup();
const trafficSamples=[];
let trafficFresh=false;
state.layers.traffic = trafficLayer;
async function loadTraffic() {
  try {
    const [sync, grid] = await Promise.all([
      fetch(`data/traffic-sync.json?v=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("data/sytadin-tiles.json").then((r) => r.json()),
    ]);
    trafficLayer.clearLayers();
    trafficSamples.length=0;
    for (const t of grid.tiles){
      const url=
        `data/traffic/${grid.zoom}/${t.x}-${t.y}.png?v=${sync.dossier}`,
        overlay=
      L.imageOverlay(
        url,t.bounds,
        { pane: "traffic", opacity: 0.34, interactive: false },
      ).addTo(trafficLayer);
      const img=new Image();img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;canvas.getContext("2d").drawImage(img,0,0);trafficSamples.push({bounds:L.latLngBounds(t.bounds),canvas})};img.src=url;
    }
    const stamp = new Date(Number(sync.date_bch) * 1000);
    trafficFresh=Math.abs(Date.now()-stamp.getTime())<=15*60*1000;
    $("trafficStatus").textContent =
      `Sytadin · ${stamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${trafficFresh?"donnée actuelle":"donnée ancienne, hors calcul"}`;
    $("mapStatus").textContent =
      "Trafic Sytadin chargé · vert fluide, orange ralenti, rouge saturé";
  } catch {
    trafficFresh=false;
    $("trafficStatus").textContent =
      "Sytadin · flux momentanément indisponible";
  }
}
loadTraffic();
setInterval(loadTraffic, 120000);
const samplers = {};
for (const [key, url] of [
  ["roadNoise", "data/noise-road.png"],
  ["railNoise", "data/noise-rail.png"],
  ["airNoise", "data/air-bruit-2024.png"],
]) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    samplers[key] = { canvas: c, w: img.width, h: img.height };
  };
  img.src = url;
}
Promise.all(
  [
    "communes.geojson",
    "commune_stats.json",
    "roads.geojson",
    "rails.geojson",
    "valdoise-boundary.geojson",
  ].map((f) => fetch("data/" + f).then((r) => r.json())),
).then(([communes, stats, roads, rails, boundary]) => {
  state.stats = stats;
  state.data.communes = communes;
  state.data.boundary = boundary;
  addTerritoryMask(boundary);
  state.layers.roads = L.geoJSON(roads, {
    pane: "network",
    style: (f) => ({
      color: f.properties.type === "motorway" ? "#d1495b" : "#c77b30",
      weight: f.properties.type === "motorway" ? 4 : 2.4,
      opacity: 0.9,
    }),
    onEachFeature: (f, l) =>
      l
        .bindTooltip(`<strong>${esc(f.properties.name)}</strong>`, {
          sticky: true,
        })
        .on("click", (e) => showNuisancesAt(e.latlng.lng,e.latlng.lat)),
  }).addTo(map);
  state.layers.rails = L.geoJSON(rails, {
    pane: "network",
    style: { color: "#5c3a8c", weight: 2.5, opacity: 0.9, dashArray: "8 3" },
    onEachFeature: (f, l) =>
      l
        .bindTooltip(`<strong>${esc(f.properties.name)}</strong>`, {
          sticky: true,
        })
        .on("click", (e) => showNuisancesAt(e.latlng.lng,e.latlng.lat)),
  });
  // Non affichée sur la carte (limites communales retirées) : conservée
  // uniquement comme source pour la recherche de territoire et les bornes
  // de recentrage (getBounds()).
  state.layers.communes = L.geoJSON(communes);
  map.fitBounds(state.layers.communes.getBounds(), { padding: [10, 10] });
  setupSearch(communes);
  loadAircraft();
});
function showRoad(p) {
  openDetail(
    `<span class="detail-tag">AXE ROUTIER</span><h2>${esc(p.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Référence</small><strong>${esc(p.ref || "—")}</strong></div><div class="kpi-tile warn"><small>Catégorie</small><strong>${esc(p.type)}</strong></div></div><h3>Lecture</h3><p>Activez « Niveaux sonores routiers » pour voir les classes acoustiques modélisées autour de cet axe. La carte nocturne commence à 40 dB(A).</p><a class="profile-link" href="https://www.sytadin.fr/" target="_blank">Voir la circulation en direct ↗</a>`,
  );
}
function showRail(p) {
  openDetail(
    `<span class="detail-tag">INFRASTRUCTURE FERROVIAIRE</span><h2>${esc(p.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Référence</small><strong>${esc(p.ref || "—")}</strong></div><div class="kpi-tile warn"><small>Type</small><strong>Voie ferrée</strong></div></div><h3>Lecture</h3><p>Activez « Niveaux sonores ferroviaires » pour afficher les secteurs exposés à partir de 55 dB(A) Lden autour du réseau.</p>`,
  );
}
// --- Classement sonore routier (arrêté n°17-146) et ferroviaire (arrêté n°16249) ---
// Les couches sont synchronisées côté serveur (GitHub Actions, voir
// .github/workflows/sync-cs-route.yml) car le WFS de la DDT 95 ne renvoie
// pas d'en-tête CORS et ne peut donc pas être appelé depuis le navigateur.
function getProp(props, ...names) {
  const lower = {};
  for (const k in props) lower[k.toLowerCase()] = props[k];
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function csCategoryColor(cat) {
  const n = Number(cat);
  return n === 1
    ? "#691635"
    : n === 2
      ? "#ab202f"
      : n === 3
        ? "#e05b31"
        : n === 4
          ? "#f5a623"
          : n === 5
            ? "#ffe05b"
            : "#8a97a8";
}
// Largeurs de secteur communes à tous les modes (arrêté du 30 mai 1996, art. 3) ;
// les niveaux de référence dB(A) ci-dessous sont ceux publiés pour le routier
// (arrêté n°17-146, art. 2) — non confirmés à l’identique pour le ferroviaire.
const CATEGORY_INFO = {
  1: { width: 300, day: "> 81 dB(A)", night: "> 76 dB(A)" },
  2: { width: 250, day: "76 à 81 dB(A)", night: "71 à 76 dB(A)" },
  3: { width: 100, day: "70 à 76 dB(A)", night: "65 à 71 dB(A)" },
  4: { width: 30, day: "65 à 70 dB(A)", night: "60 à 65 dB(A)" },
  5: { width: 10, day: "60 à 65 dB(A)", night: "55 à 60 dB(A)" },
};
// Sévérité et conséquence en isolement, 1 = la plus sévère, 5 = la plus faible
// des 5 catégories (échelle relative, pas une valeur dB d'isolement).
const CATEGORY_SEVERITY = {
  1: "la plus sévère (1/5)",
  2: "élevée (2/5)",
  3: "modérée (3/5)",
  4: "faible (4/5)",
  5: "la plus faible (5/5)",
};
const CATEGORY_ISOLATION = {
  1: "le plus exigeant",
  2: "élevé",
  3: "modéré",
  4: "limité",
  5: "le plus faible",
};
function categoryRow(cat, mode, arrete) {
  const info = CATEGORY_INFO[cat];
  if (!info) return "";
  const isRoad = mode === "routière";
  const dbStats = isRoad
    ? `<div><small>Jour</small><strong>${info.day}</strong></div><div><small>Nuit</small><strong>${info.night}</strong></div>`
    : "";
  return `<div class="cat-card"><div class="cat-card-head"><div class="cat-card-title"><span class="cat-chip" style="background:${csCategoryColor(cat)}">${cat}</span><div><strong>Voie ${mode}</strong><small>${arrete}</small></div></div><span class="cat-severity">Sévérité ${CATEGORY_SEVERITY[cat]}</span></div><div class="cat-stats"><div${isRoad ? "" : ' class="cat-stat-wide"'}><small>Secteur affecté</small><strong>${info.width} m</strong></div>${dbStats}<div class="cat-stat-wide"><small>Isolement renforcé exigé pour une construction neuve</small><strong>${CATEGORY_ISOLATION[cat]}</strong></div></div></div>`;
}
function categoryLegendNote(roadCat, railCat) {
  const cards =
    categoryRow(roadCat, "routière", "arrêté n°17-146") +
    categoryRow(railCat, "ferroviaire", "arrêté n°16249");
  if (!cards) return "";
  return `<div class="cat-cards">${cards}</div><p class="flag-note">Le secteur affecté s’étend de part et d’autre de la voie ; toute construction neuve à usage sensible (logement, école, santé…) qui s’y trouve doit respecter l’isolement acoustique renforcé indiqué (méthode forfaitaire, arrêté du 30 mai 1996). Plus la catégorie est basse, plus l’exigence est forte.</p>`;
}
function csLineLayer(mode, operator) {
  return L.geoJSON(null, {
    pane: "network",
    style: (f) => ({
      color: csCategoryColor(getProp(f.properties, "categorie")),
      weight: 3,
      opacity: 0.9,
      dashArray: mode === "rail" ? "1 6" : null,
    }),
    onEachFeature: (f, l) => {
      if (operator) f.properties._operator = operator;
      // Pas de handler de clic dédié : un clic n'importe où sur la carte
      // ouvre le rapport combiné de toutes les nuisances à ce point (voir
      // plus bas), y compris quand on clique pile sur un tronçon.
      l.bindTooltip(
        `<strong>${esc(getProp(f.properties, "name", "nom", "codeligne", "ligneratp") ?? "Tronçon")}</strong> · catégorie ${esc(getProp(f.properties, "categorie") ?? "—")}`,
        { sticky: true },
      );
    },
  });
}
function csBufferLayer() {
  return L.geoJSON(null, {
    pane: "noise",
    style: () => ({
      color: "#8a97a8",
      weight: 1,
      fillColor: "#8a97a8",
      fillOpacity: 0.28,
    }),
  });
}
state.layers.csRoadLines = csLineLayer("road");
state.layers.csRoadBuffer = csBufferLayer();
state.layers.csRoad = L.layerGroup([
  state.layers.csRoadLines,
  state.layers.csRoadBuffer,
]).addTo(map);
const RAIL_OPERATORS = [
  { key: "sncf", label: "SNCF" },
  { key: "ratp", label: "RATP" },
  { key: "sgp", label: "SGP" },
];
const csRailSub = [];
for (const op of RAIL_OPERATORS) {
  op.linesLayer = csLineLayer("rail", op.label);
  op.bufferLayer = csBufferLayer();
  csRailSub.push(op.linesLayer, op.bufferLayer);
}
state.layers.csRail = L.layerGroup(csRailSub).addTo(map);
async function fetchGeoJSON(file) {
  const res = await fetch(`data/${file}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function loadCsRoute() {
  $("csRoadStatus").textContent = "Chargement…";
  $("csRailStatus").textContent = "Chargement…";
  const [roadLines, roadBuffer, ...railResults] = await Promise.allSettled([
    fetchGeoJSON("cs-lines.geojson"),
    fetchGeoJSON("cs-buffer.geojson"),
    ...RAIL_OPERATORS.flatMap((op) => [
      fetchGeoJSON(`cs-rail-${op.key}-lines.geojson`),
      fetchGeoJSON(`cs-rail-${op.key}-buffer.geojson`),
    ]),
  ]);
  if (roadLines.status === "fulfilled" && roadLines.value.features.length) {
    state.data.csRoadLines = roadLines.value;
    state.layers.csRoadLines.addData(roadLines.value);
  } else if (roadLines.status === "rejected") {
    console.warn("CS Route routier (lignes) indisponible :", roadLines.reason);
  }
  if (roadBuffer.status === "fulfilled" && roadBuffer.value.features.length) {
    state.layers.csRoadBuffer.addData(roadBuffer.value);
  } else if (roadBuffer.status === "rejected") {
    console.warn("CS Route routier (empreinte) indisponible :", roadBuffer.reason);
  }
  $("csRoadStatus").textContent = state.data.csRoadLines
    ? `${state.data.csRoadLines.features.length} tronçons classés · arrêté n°17-146`
    : "Synchronisation en cours, réessayez plus tard";
  const railFeatures = [];
  RAIL_OPERATORS.forEach((op, i) => {
    const linesResult = railResults[i * 2];
    const bufferResult = railResults[i * 2 + 1];
    if (linesResult.status === "fulfilled" && linesResult.value.features.length) {
      linesResult.value.features.forEach((f) => (f.properties._operator = op.label));
      railFeatures.push(...linesResult.value.features);
      op.linesLayer.addData(linesResult.value);
    } else if (linesResult.status === "rejected") {
      console.warn(`CS Rail ${op.label} (lignes) indisponible :`, linesResult.reason);
    }
    if (bufferResult.status === "fulfilled" && bufferResult.value.features.length) {
      op.bufferLayer.addData(bufferResult.value);
    } else if (bufferResult.status === "rejected") {
      console.warn(`CS Rail ${op.label} (empreinte) indisponible :`, bufferResult.reason);
    }
  });
  if (railFeatures.length) {
    state.data.csRailLines = { type: "FeatureCollection", features: railFeatures };
    $("csRailStatus").textContent =
      `${railFeatures.length} tronçons classés (SNCF/RATP/SGP) · arrêté n°16249`;
  } else {
    $("csRailStatus").textContent = "Synchronisation en cours, réessayez plus tard";
  }
}
loadCsRoute();
// --- Vérifier un logement : géocodage BAN + nuisances sonores au point ---
function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function toMeters(lon, lat, lat0) {
  const rad = Math.PI / 180,
    R = 6371000;
  return [lon * rad * R * Math.cos(lat0 * rad), lat * rad * R];
}
function distToLineFeature(lon, lat, geometry) {
  const [px, py] = toMeters(lon, lat, lat);
  const lines =
    geometry.type === "MultiLineString"
      ? geometry.coordinates
      : [geometry.coordinates];
  let min = Infinity;
  for (const line of lines)
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = toMeters(line[i][0], line[i][1], lat);
      const [bx, by] = toMeters(line[i + 1][0], line[i + 1][1], lat);
      min = Math.min(min, distPointToSegment(px, py, ax, ay, bx, by));
    }
  return min;
}
function regulatoryMatches(lon, lat, geojson) {
  if (!geojson) return [];
  const matches = [];
  for (const f of geojson.features) {
    const es = Number(getProp(f.properties, "es", "tampon"));
    if (!es || !f.geometry) continue;
    if (distToLineFeature(lon, lat, f.geometry) <= es)
      matches.push({
        props: f.properties,
        cat: Number(getProp(f.properties, "categorie")) || 9,
      });
  }
  return matches.sort((a, b) => a.cat - b.cat);
}
function dedupeMatches(matches) {
  const seen = new Set();
  return matches.filter((m) => {
    const key = `${getProp(m.props, "_operator") ?? ""}·${getProp(m.props, "name", "nom", "codeligne", "ligneratp") ?? ""}·${m.cat}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function communeAt(lon,lat){for(const f of state.data.communes?.features||[]){const g=f.geometry,polys=g.type==="Polygon"?[g.coordinates]:g.coordinates;if(polys?.some(p=>pointInRing(lon,lat,p[0])))return f}return null}
function matchTile(m) {
  const name = esc(
    getProp(m.props, "name", "nom", "codeligne", "ligneratp") ?? "Tronçon",
  );
  const operator = getProp(m.props, "_operator");
  const cat = esc(getProp(m.props, "categorie") ?? "—");
  const width = esc(getProp(m.props, "es", "tampon") ?? "—");
  return `<div class="kpi-tile warn"><small>${operator ? esc(operator) + " · " : ""}${name}</small><strong>Catégorie ${cat}</strong><em>Secteur ${width} m</em></div>`;
}
function distanceMeters(lon1,lat1,lon2,lat2){const r=6371000,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;return 2*r*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2))}
function stressLabel(score){return score>=4.25?"Très fort":score>=3.25?"Fort":score>=2.25?"Marqué":score>=1.25?"Modéré":"Faible"}
function stressColor(score){return score>=4.25?"#a50026":score>=3.25?"#e34a33":score>=2.25?"#f2a72e":score>=1.25?"#a6b82c":"#238b57"}
function displayScore(score){return score==null?"—":`${Number(score).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})} / 5`}
function stressCard(row){return `<article class="stress-card" style="--stress:${stressColor(row.score||0)}"><header><div><small>${esc(row.name)}</small><strong>${displayScore(row.score)}</strong></div><em>${row.score==null?"Non calculable":stressLabel(row.score)}</em></header><div class="stress-evidence"><p><b>MESURE</b><span>${esc(row.value)}</span></p><p><b>RÈGLE / CLASSEMENT</b><span>${esc(row.detail)}</span></p></div><small class="stress-source">${esc(row.source||"Donnée publique")}</small></article>`}
function sampleTrafficAt(lon,lat){for(const s of trafficSamples){if(!s.bounds.contains([lat,lon]))continue;const nw=s.bounds.getNorthWest(),se=s.bounds.getSouthEast(),x=Math.max(0,Math.min(s.canvas.width-1,Math.floor((lon-nw.lng)/(se.lng-nw.lng)*s.canvas.width))),y=Math.max(0,Math.min(s.canvas.height-1,Math.floor((nw.lat-lat)/(nw.lat-se.lat)*s.canvas.height))),d=s.canvas.getContext("2d").getImageData(x,y,1,1).data;if(d[3]<40)return null;if(d[0]>d[1]*1.35)return{score:100,label:"saturé"};if(d[0]>120&&d[1]>55)return{score:65,label:"ralenti"};if(d[1]>d[0]*1.25)return{score:25,label:"fluide"}}return null}
function sampleAirNoise(latlng){const s=samplers.airNoise;if(!s)return null;const x=Math.floor((latlng.lng-1.6035671)/(2.5965671-1.6035671)*s.w),y=Math.floor((49.248488-latlng.lat)/(49.248488-48.911488)*s.h);if(x<0||y<0||x>=s.w||y>=s.h)return null;const d=s.canvas.getContext("2d").getImageData(x,y,1,1).data;if(d[3]<20)return null;const palette=[[206,230,146,1],[226,203,111,2],[223,116,87,3],[166,91,151,4],[116,59,74,5]];return palette.sort((a,b)=>(a[0]-d[0])**2+(a[1]-d[1])**2+(a[2]-d[2])**2-((b[0]-d[0])**2+(b[1]-d[1])**2+(b[2]-d[2])**2))[0][3]}
function weatherStress(p){if(!p)return{score:null,detail:"Observation indisponible"};const t=Math.max(Number(p.temperature),Number(p.apparent)),code=Number(p.weatherCode),gust=Number(p.gust),rain=Number(p.precipitation);let score=t>=40||t<=-5?5:t>=35||t<=0?4:t>=30?3:t>=27||t<=5?1.5:0;let event="conditions ordinaires";if([95,96,99].includes(code)){score=Math.max(score,4.5);event="orage"}else if([66,67].includes(code)){score=Math.max(score,4);event="pluie verglaçante"}else if([65,82].includes(code)){score=Math.max(score,3.5);event="fortes pluies"}else if((code>=71&&code<=77)||code>=85){score=Math.max(score,3);event="neige"}else if((code>=51&&code<=63)||code===80||code===81){score=Math.max(score,rain>=5?3:1);event="pluie"}else if(code===45||code===48){score=Math.max(score,1.5);event="brouillard"}if(gust>=90)score=5;else if(gust>=70)score=Math.max(score,4);else if(gust>=50)score=Math.max(score,2.5);return{score,detail:`${event}${Number.isFinite(gust)?` · rafales ${fmt(gust)} km/h`:""}`}}
function globalStress(scores){const strongest=scores.filter(s=>Number.isFinite(s)&&s>0).sort((a,b)=>b-a).slice(0,3);if(!strongest.length)return 0;return Math.sqrt(strongest.reduce((sum,s)=>sum+s*s,0)/strongest.length)}
function featureAtPoint(lon,lat,features){for(const f of features||[]){const g=f.geometry,polys=g?.type==="Polygon"?[g.coordinates]:g?.coordinates;if(polys?.some(p=>pointInRing(lon,lat,p[0])&&!p.slice(1).some(h=>pointInRing(lon,lat,h))))return f}return null}
async function reverseBan(lon,lat){try{const d=await fetch(`https://data.geopf.fr/geocodage/reverse?lon=${lon}&lat=${lat}&index=address`).then(r=>r.json());return d.features?.[0]?.properties||null}catch{return null}}
async function sampleArtificial(lon,lat){try{const z=15,n=2**z,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n),px=Math.floor(((lon+180)/360*n-x)*256),py=Math.floor(((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n-y)*256),url=`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OCSGE.ARTIF.2024-2026&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,blob=await fetch(url).then(r=>r.blob()),bmp=await createImageBitmap(blob),c=document.createElement("canvas");c.width=256;c.height=256;const ctx=c.getContext("2d");ctx.drawImage(bmp,0,0);const radius=20,x0=Math.max(0,px-radius),y0=Math.max(0,py-radius),x1=Math.min(255,px+radius),y1=Math.min(255,py+radius),d=ctx.getImageData(x0,y0,x1-x0+1,y1-y0+1).data;let artificialPixels=0,total=0;for(let i=0;i<d.length;i+=4){total++;if(d[i]>d[i+1])artificialPixels++}const share=total?artificialPixels/total:0;return{atPoint:(()=>{const p=ctx.getImageData(px,py,1,1).data;return p[0]>p[1]})(),share}}catch{return null}}
async function showNuisancesAt(lon, lat) {
  if (state.layers.clickMarker) map.removeLayer(state.layers.clickMarker);
  state.layers.clickMarker = L.marker([lat, lon]).addTo(map);
  const roadReady = !!state.data.csRoadLines,
    railReady = !!state.data.csRailLines;
  const road = dedupeMatches(regulatoryMatches(lon, lat, state.data.csRoadLines));
  const rail = dedupeMatches(regulatoryMatches(lon, lat, state.data.csRailLines));
  const hasMatch = road.length || rail.length;
  const latlng = L.latLng(lat, lon);
  const roadDb = sampleNoise("roadNoise", latlng);
  const railDb = sampleNoise("railNoise", latlng);

  let regHtml;
  if (!roadReady && !railReady) {
    regHtml = `<p class="flag-note">Le service de classement sonore n’a pas pu être chargé. Réessayez dans quelques instants.</p>`;
  } else if (hasMatch) {
    regHtml =
      `<div class="kpi-grid">${[...road.slice(0, 2), ...rail.slice(0, 2)].map(matchTile).join("")}</div>` +
      categoryLegendNote(road[0]?.cat, rail[0]?.cat);
  } else {
    regHtml = `<p>Aucun tronçon routier (arrêté n°17-146) ou ferroviaire (arrêté n°16249) classé ne place ce point dans un secteur affecté par le bruit.</p>`;
  }
  const noiseHtml =
    roadDb || railDb
      ? `<h3>Bruit · carte stratégique</h3><div class="kpi-grid">${
          roadDb
            ? `<div class="kpi-tile"><small>Routier · Ln</small><strong>${roadDb} à ${roadDb + 5} dB(A)</strong></div>`
            : ""
        }${
          railDb
            ? `<div class="kpi-tile"><small>Ferroviaire · Lden</small><strong>${railDb} à ${railDb + 5} dB(A)</strong></div>`
            : ""
        }</div>`
      : "";
  const commune=communeAt(lon,lat),code=String(commune?.properties?.code||commune?.properties?.insee||commune?.properties?.INSEE_COM||""),air=state.stats[code],ban=await reverseBan(lon,lat),artificial=await sampleArtificial(lon,lat),localAirNoise=sampleAirNoise(latlng);
  const currentHour=Math.max(6,Math.min(23,new Date().getHours())),dailyMax=Math.max(...(pressureData.stations||[]).map(s=>s.weekdayAverage||0),1),hourlyMax=Math.max(...(pressureData.stations||[]).map(s=>s.hourly?.[currentHour]||0),1),stationHits=(pressureData.stations||[]).map(s=>{const ratio=Math.sqrt((s.weekdayAverage||0)/dailyMax),radius=800+700*ratio,d=distanceMeters(lon,lat,s.lon,s.lat),distanceFactor=Math.pow(Math.max(0,1-d/radius),.7);return{...s,d,radius,ratio,distanceFactor,hourValue:s.hourly?.[currentHour]||0}}).filter(s=>s.d<=s.radius).sort((a,b)=>b.hourValue*b.distanceFactor-a.hourValue*a.distanceFactor),busHits=(pressureData.stops||[]).map(s=>({...s,d:distanceMeters(lon,lat,s.lon,s.lat)})).filter(s=>s.d<=300),mobility5=Math.min(5,(stationHits[0]?.hourValue||0)/hourlyMax*4.5*(stationHits[0]?.distanceFactor||0)+Math.min(.5,busHits.reduce((n,s)=>n+.08*(1-s.d/300),0)));
  const equipmentHits=(pressureData.equipment||[]).map(p=>({...p,d:distanceMeters(lon,lat,p.lon,p.lat)})).filter(p=>p.d<=750),equipmentMass=equipmentHits.reduce((n,p)=>n+Math.max(0,1-p.d/750),0),equipmentScore=Math.min(5,5*Math.log1p(equipmentMass)/Math.log(41));
  const traffic=trafficFresh?sampleTrafficAt(lon,lat):null,roadScore=Math.max(roadDb?Math.min(5,Math.max(0,(roadDb-40)/7)):0,road[0]?.cat?6-road[0].cat:0,traffic?.label==="saturé"?5:traffic?.label==="ralenti"?3:traffic?0.5:0),railScore=Math.max(railDb?Math.min(5,Math.max(0,(railDb-50)/5)):0,rail[0]?.cat?6-rail[0].cat:0);
  const airScore=localAirNoise,heatFeature=featureAtPoint(lon,lat,pressureData.heat),heatDay=heatFeature?Number(heatFeature.properties.day)+1:null,temp=(pressureData.temperaturePoints||[]).map(p=>({...p,d:distanceMeters(lon,lat,p.lon,p.lat)})).sort((a,b)=>a.d-b.d)[0],weather=weatherStress(temp),heatExtreme=Math.max(Number(temp?.temperature),Number(temp?.apparent))>=27,climateScore=weather.score==null&&heatDay==null?null:Math.max(weather.score||0,heatExtreme?Math.min(5,heatDay||0):0);
  const aircraftNear=movingAircraft.map(a=>{const p=a.marker.getLatLng();return distanceMeters(lon,lat,p.lng,p.lat)}).filter(d=>d<=5000),aircraftScore=Math.min(5,aircraftNear.length),artificialScore=artificial==null?null:Math.min(5,artificial.share*5);
  const rows=[
    {name:"Mobilité & fréquentation",score:mobility5,value:stationHits[0]?`${stationHits[0].name} · ${fmt(stationHits[0].hourValue)} validations entre ${currentHour} h et ${currentHour+1} h · à ${fmt(stationHits[0].d)} m`:`${busHits.length} arrêt(s) à moins de 300 m`,why:stationHits[0]?`La gare atteint ${fmt((stationHits[0].hourValue/hourlyMax)*100)} % du maximum départemental à cette heure, puis son influence décroît avec la distance (${fmt(stationHits[0].distanceFactor*100)} % conservés ici).`:"Aucune gare n’exerce d’influence sur ce point ; seuls les arrêts proches contribuent.",detail:`Décroissance continue du centre jusqu’à 0 au bord du rayon · ${busHits.length} arrêt(s) proches`,source:"IDFM · profil horaire du jour ouvré moyen · heure actuelle"},
    {name:"Équipements & services",score:equipmentScore,value:`${equipmentHits.length} lieux à moins de 750 m · masse pondérée ${fmt(equipmentMass,1)}`,why:`Les ${equipmentHits.length} lieux ne comptent pas tous entièrement : chacun perd progressivement son influence avec la distance. La masse équivalente au point est ${fmt(equipmentMass,1)}.`,detail:"Décroissance linéaire jusqu’à 750 m puis progression logarithmique",source:"BPE Insee + OpenStreetMap · millésimes publiés"},
    {name:"Pression routière",score:roadScore,value:`${roadDb?`${roadDb}–${roadDb+5} dB(A) · `:""}${traffic?`trafic ${traffic.label}`:trafficFresh?"trafic local non lu":"trafic temps réel indisponible"}`,why:road[0]?`Le point se trouve dans le secteur affecté par une infrastructure de catégorie ${road[0].cat}${roadDb?` et dans une classe sonore de ${roadDb} à ${roadDb+5} dB(A)`:""}. La valeur la plus contraignante fixe la note.`:"Aucun secteur réglementaire routier classé ne couvre le point ; seul le bruit mesuré ou le trafic actuel peut contribuer.",detail:road[0]?`Classement sonore catégorie ${road[0].cat} · arrêté n°17-146${traffic?" · état actuel intégré":""}`:"Hors secteur routier classé",source:`DDT 95 · Bruitparif · ${trafficFresh?"Sytadin actuel":"Sytadin ancien : exclu de la note"}`},
    {name:"Pression ferroviaire",score:railScore,value:railDb?`${railDb}–${railDb+5} dB(A)`:"Pas de niveau sonore local",why:rail[0]?`Le point appartient au secteur affecté d’une voie ferrée de catégorie ${rail[0].cat} ; le niveau raster et la catégorie la plus sévère déterminent la note.`:"Le point est hors des secteurs ferroviaires classés et aucun niveau sonore ferroviaire local n’est détecté.",detail:rail[0]?`Classement sonore catégorie ${rail[0].cat} · arrêté n°16249`:"Hors secteur ferroviaire classé",source:"DDT 95 · SNCF/RATP/SGP · classement réglementaire"},
    {name:"Air & bruit",score:airScore,value:localAirNoise?`Coexposition locale : classe ${localAirNoise}/5`:"Classe locale indisponible",why:localAirNoise?`La couleur du raster au point correspond directement à la classe locale ${localAirNoise}/5 ; les pourcentages communaux sont conservés comme contexte, sans remplacer la mesure locale.`:"Le raster local ne fournit pas de classe exploitable à ce point.",detail:air?`Commune : air dégradé ${fmt(air.air_degrade_pct,1)} % · bruit dégradé ${fmt(air.bruit_degrade_pct,1)} %`:"Contexte communal indisponible",source:"Airparif + Bruitparif · raster local 2024"},
    {name:"Météo & extrêmes",score:climateScore,value:temp?`${fmt(temp.temperature,1)} °C · ressenti ${fmt(temp.apparent,1)} °C · ${weather.detail}`:"Observation indisponible",why:climateScore?`Un phénomène actuel ou une température extrême active la pression météo ; l’aléa morphoclimatique renforce uniquement les épisodes chauds.`:"Les températures sont dans la plage ordinaire et aucun phénomène météo notable n’ajoute de stress.",detail:heatExtreme&&heatDay?`Extrême thermique : aléa morphoclimatique ${heatDay}/5 intégré`:"Température ordinaire : aucun stress thermique ajouté",source:`Open-Meteo · observation ${temp?.time||"actuelle"} · IPR`},
    {name:"Artificialisation",score:artificialScore,value:artificial==null?"Lecture indisponible":`${fmt(artificial.share*100)} % de surface artificialisée autour du point`,why:artificial?`La note suit directement la part artificialisée observée dans un voisinage d’environ 200 m. Au point exact, le sol est ${artificial.atPoint?"artificialisé":"non artificialisé"}.`:"Lecture locale indisponible.",detail:"0 % = 0/5 · 100 % = 5/5 · voisinage d’environ 200 m",source:"OCS GE IGN · échantillonnage local autour du clic"},
    {name:"Trafic aérien",score:aircraftScore,value:`${aircraftNear.length} aéronef(s) à moins de 5 km`,why:aircraftNear.length?`${aircraftNear.length} aéronef(s) sont actuellement observés dans le voisinage du point ; la pression augmente avec leur nombre.`:"Aucun aéronef n’est actuellement observé dans un rayon de 5 km.",detail:"1 niveau de stress par aéronef proche, plafonné à 5",source:`ADSB.lol · positions en direct · ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`}
  ];
  const global=globalStress(rows.map(r=>r.score)),stress={generatedAt:new Date().toISOString(),coordinates:{lat,lon},nearestAddress:ban?.label||null,commune:air?.nom||ban?.city||null,score:global,criteria:rows};state.currentStress=stress;
  const cards=rows.map(stressCard).join("");
  openDetail(`<span class="detail-tag">CARTE DE STRESS · DIAGNOSTIC LOCAL</span><h2>${esc(air?.nom||ban?.city||"Val-d’Oise")}</h2><p class="zone-address">${esc(ban?.label||"Adresse la plus proche indisponible")}</p><p class="point-location"><b>Point analysé</b> ${lat.toFixed(6)}, ${lon.toFixed(6)} · BAN : adresse la plus proche</p><div class="stress-global" style="--stress:${stressColor(global)}"><small>NIVEAU DE STRESS À ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small><strong>${displayScore(global)}</strong><em>${stressLabel(global)}</em></div><p class="stress-intro">Chaque note est directement reliée ci-dessous à sa mesure, à la règle appliquée et à la fraîcheur de la source.</p><div class="stress-grid">${cards}</div><p class="flag-note">Note globale = moyenne quadratique des trois pressions les plus fortes. Elle reflète leur cumul mais ne peut jamais dépasser la composante la plus élevée. Diagnostic exploratoire, non sanitaire.</p><div class="stress-actions"><button id="printStress">Ouvrir la fiche PDF</button><button id="exportStress">Exporter les données</button></div>`);
  $("printStress").onclick=()=>openStressPdf(stress);$("exportStress").onclick=()=>{const blob=new Blob([JSON.stringify(stress,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`pulse95-stress-${lat.toFixed(5)}-${lon.toFixed(5)}.json`;a.click();URL.revokeObjectURL(a.href)};
}
function openStressPdf(stress){const {jsPDF}=window.jspdf||{};if(!jsPDF)return;const doc=new jsPDF({unit:"mm",format:"a4"}),c=stressColor(stress.score),rgb=c.match(/\w\w/g).map(x=>parseInt(x,16)),drivers=[...stress.criteria].filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,3);doc.setFillColor(...rgb);doc.rect(0,0,210,50,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text("DDT DU VAL-D'OISE · CARTE DE STRESS",16,11);doc.setFontSize(24);doc.text(stress.commune||"Zone analysée",16,27);doc.setFontSize(10);doc.text(stress.nearestAddress||"Adresse BAN indisponible",16,37,{maxWidth:120});doc.setFontSize(22);doc.text(displayScore(stress.score),153,25);doc.setFontSize(10);doc.text(stressLabel(stress.score),153,34);doc.setTextColor(22,32,43);doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.text(`Point exact : ${stress.coordinates.lat.toFixed(6)}, ${stress.coordinates.lon.toFixed(6)} · calcul ${new Date(stress.generatedAt).toLocaleString("fr-FR")}`,16,58);doc.setFillColor(245,246,254);doc.roundedRect(16,64,178,25,3,3,"F");doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(0,0,145);doc.text("CE QUI EXPLIQUE PRINCIPALEMENT LE NIVEAU",21,72);doc.setTextColor(22,32,43);doc.setFontSize(8);doc.text(drivers.map(r=>`${r.name} ${displayScore(r.score)}`).join("   ·   "),21,80,{maxWidth:168});doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("Les facteurs les plus élevés sont présentés en premier ; le détail ci-dessous relie chaque note à sa mesure.",21,85,{maxWidth:168});doc.autoTable({startY:95,head:[["PRESSION / NOTE","POURQUOI ?","MESURE ET SOURCE"]],body:stress.criteria.map(r=>[`${r.name}\n${displayScore(r.score)} · ${stressLabel(r.score)}`,r.why||r.detail,`${r.value}\n${r.detail}\n${r.source||"Donnée publique"}`]),styles:{fontSize:6.8,cellPadding:2.8,valign:"middle",lineColor:[220,225,232],lineWidth:.2,overflow:"linebreak"},headStyles:{fillColor:[0,0,145],fontSize:7.3},alternateRowStyles:{fillColor:[247,248,250]},columnStyles:{0:{cellWidth:39,fontStyle:"bold"},1:{cellWidth:65},2:{cellWidth:80}},didParseCell:d=>{if(d.section==="body"&&d.column.index===0){const col=stressColor(stress.criteria[d.row.index].score||0).match(/\w\w/g).map(x=>parseInt(x,16));d.cell.styles.textColor=col}}});let y=doc.lastAutoTable.finalY+7;if(y<272){doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text("COMMENT LIRE LE CUMUL ?",16,y);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("La note globale est la moyenne quadratique des trois pressions les plus fortes. Elle traduit leur cumul mais ne peut jamais dépasser la composante la plus élevée. Indice exploratoire, non sanitaire.",16,y+5,{maxWidth:178})}doc.setTextColor(90);doc.setFontSize(7);doc.text("Carte de stress · données publiques · DDT du Val-d'Oise",16,287);const url=URL.createObjectURL(doc.output("blob"));window.open(url,"_blank","noopener")}
function sampleNoise(key, latlng) {
  const s = samplers[key];
  if (!s) return null;
  const x = Math.floor(
      ((latlng.lng - 1.6035671) / (2.5965671 - 1.6035671)) * s.w,
    ),
    y = Math.floor(((49.248488 - latlng.lat) / (49.248488 - 48.911488)) * s.h);
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const d = s.canvas.getContext("2d").getImageData(x, y, 1, 1).data;
  if (d[3] < 20) return null;
  const palette = [
    [87, 171, 210, 40],
    [116, 196, 118, 45],
    [255, 224, 91, 50],
    [245, 166, 35, 55],
    [224, 91, 49, 60],
    [171, 32, 47, 65],
    [105, 22, 53, 70],
    [66, 11, 36, 75],
  ];
  return palette.sort(
    (a, b) =>
      (a[0] - d[0]) ** 2 +
      (a[1] - d[1]) ** 2 +
      (a[2] - d[2]) ** 2 -
      ((b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2),
  )[0][3];
}
map.on("click", (e) => showNuisancesAt(e.latlng.lng, e.latlng.lat));
function setupSearch(geo) {
  const items = geo.features
    .map((f) => {
      const code = String(
        f.properties.code || f.properties.insee || f.properties.INSEE_COM || "",
      );
      return { code, name: state.stats[code]?.nom || f.properties.nom, f };
    })
    .filter((x) => x.name);
  function run() {
    const q = $("searchInput").value.trim().toLowerCase(),
      hits = items.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 8);
    $("searchResults").innerHTML = hits
      .map((x) => `<button data-code="${x.code}">${esc(x.name)}</button>`)
      .join("");
    $("searchResults").hidden = !q || !hits.length;
    $("searchResults")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const x = items.find((i) => i.code === b.dataset.code);
            map.fitBounds(L.geoJSON(x.f).getBounds(), { maxZoom: 13 });
            $("searchResults").hidden = true;
          }),
      );
  }
  $("searchInput").oninput = run;
  $("searchButton").onclick = run;
}
const aircraft = L.layerGroup();
state.layers.aircraft = aircraft;
let movingAircraft = [];

function projectedPosition(item, now) {
  const elapsed = Math.min((now - item.seenAt) / 1000, 75);
  const speedKmh = Number(item.data.gs) * 1.852;
  const heading = Number(item.data.track);
  if (
    !Number.isFinite(speedKmh) ||
    !Number.isFinite(heading) ||
    speedKmh < 15 ||
    elapsed <= 0
  )
    return [item.data.lat, item.data.lon];
  const distanceKm = (speedKmh * elapsed) / 3600;
  const angularDistance = distanceKm / 6371.0088;
  const bearing = (heading * Math.PI) / 180;
  const lat1 = (item.data.lat * Math.PI) / 180;
  const lon1 = (item.data.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function animateAircraft(now) {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    movingAircraft.forEach((item) => {
      const position = projectedPosition(item, now);
      item.marker.setLatLng(position);
      item.circle.setLatLng(position);
    });
  }
  requestAnimationFrame(animateAircraft);
}
requestAnimationFrame(animateAircraft);

function band(ft) {
  if (!Number.isFinite(ft))
    return { label: "Altitude inconnue", color: "#718096", radius: 500 };
  if (ft < 3000) return { label: "Survol bas", color: "#b21f35", radius: 3500 };
  if (ft < 7000)
    return { label: "Survol intermédiaire", color: "#db6b2f", radius: 2200 };
  if (ft < 12000)
    return { label: "Survol élevé", color: "#d5a42d", radius: 1200 };
  return { label: "Haute altitude", color: "#66758b", radius: 450 };
}
async function loadAircraft() {
  try {
    let d;
    try {
      const r = await fetch(
        "https://api.adsb.lol/v2/lat/49.08/lon/2.10/dist/45",
      );
      if (!r.ok) throw Error();
      d = await r.json();
    } catch {
      d = await fetch(`data/aircraft-live.json?v=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json());
    }
    const planes = (d.ac || []).filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        insideTerritory(p.lon, p.lat),
    );
    aircraft.clearLayers();
    movingAircraft = [];
    const seenAt = performance.now();
    planes.forEach((p) => {
      const ft = Number(p.alt_baro),
        b = band(ft);
      const circle = L.circle([p.lat, p.lon], {
        radius: b.radius,
        color: b.color,
        weight: 1,
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(aircraft);
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          html: `<div class="plane-marker" style="transform:rotate(${Number(p.track) || 0}deg)">✈</div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      })
        .addTo(aircraft)
        .bindTooltip(
          `${esc((p.flight || p.r || "Aéronef").trim())} · ${Number.isFinite(ft) ? fmt(ft) + " ft" : "altitude inconnue"}`,
        )
        .on("click", () =>
          openDetail(
            `<span class="detail-tag">AÉRONEF · DIRECT</span><h2>${esc((p.flight || p.r || p.hex || "Aéronef").trim())}</h2><div class="kpi-grid"><div class="kpi-tile warn"><small>Altitude</small><strong>${Number.isFinite(ft) ? fmt(ft) + " ft" : "—"}</strong><em>${Number.isFinite(ft) ? fmt(ft * 0.3048) + " m" : ""}</em></div><div class="kpi-tile"><small>Vitesse sol</small><strong>${Number.isFinite(Number(p.gs)) ? fmt(Number(p.gs) * 1.852) + " km/h" : "—"}</strong></div><div class="kpi-tile"><small>Type</small><strong>${esc(p.t || "—")}</strong></div><div class="kpi-tile warn"><small>Lecture</small><strong>${b.label}</strong></div></div><p class="flag-note">Position ADS-B en direct. L’anneau traduit uniquement l’altitude : ce n’est pas un niveau en dB(A).</p>`,
          ),
        );
      marker.off("click").on("click",e=>{L.DomEvent.stopPropagation(e);showNuisancesAt(e.latlng.lng,e.latlng.lat)});
      movingAircraft.push({ data: p, marker, circle, seenAt });
    });
    $("aircraftMenuStatus").textContent =
      `${planes.length} avions en mouvement · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    $("aircraftMenuStatus").textContent = "Dernier flux indisponible";
  }
}
loadAircraft();
setInterval(loadAircraft, 60000);
const pressureData={stations:[],stops:[],equipment:[],heat:[],temperaturePoints:[]};
function pressureColor(v,max){const r=v/(max||1);return r>.75?"#a90028":r>.5?"#ef6c35":r>.25?"#f2c94c":"#2fb9b3"}
function equipmentInfluenceLayer(records,centres){
  const latStep=.0045,lonStep=.007,bins=new Map(),cells=new Set();
  const key=(y,x)=>`${y}:${x}`;
  records.forEach(p=>{if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return;const y=Math.floor(p.lat/latStep),x=Math.floor(p.lon/lonStep),k=key(y,x);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(p);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)cells.add(key(y+dy,x+dx))});
  const summaries=[...cells].map(k=>{const [y,x]=k.split(":").map(Number),near=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)near.push(...(bins.get(key(y+dy,x+dx))||[]));return{y,x,near}}).filter(c=>c.near.length);
  const maximum=Math.max(...summaries.map(c=>c.near.length),1),colors=["#edf8fb","#b3cde3","#8c96c6","#8856a7","#7a0177"];
  const group=L.layerGroup(),renderer=L.canvas({pane:"pulse",padding:.6});
  summaries.forEach(c=>{const intensity=Math.log1p(c.near.length)/Math.log1p(maximum),color=colors[Math.min(4,Math.floor(intensity*5))],bounds=[[c.y*latStep,c.x*lonStep],[(c.y+1)*latStep,(c.x+1)*lonStep]];const layer=L.rectangle(bounds,{pane:"pulse",renderer,stroke:false,fillColor:color,fillOpacity:.015+.09*intensity,bubblingMouseEvents:false}).addTo(group);layer.bindTooltip(`<strong>${fmt(c.near.length)} équipements et services</strong><br>dans la zone d’influence (~750 m)`,{sticky:true});layer.on("click",e=>{L.DomEvent.stopPropagation(e);showNuisancesAt(e.latlng.lng,e.latlng.lat)});});
  centres.forEach(c=>{const halo=L.circle([c.lat,c.lon],{pane:"pulse",renderer,radius:1000,color:"#7a0177",weight:1,opacity:.18,fillColor:"#c51b8a",fillOpacity:.025,bubblingMouseEvents:false}).addTo(group);halo.bindTooltip(`<strong>${esc(c.name)}</strong><br>grand pôle commercial · repère 1 km`,{sticky:true});halo.on("click",e=>showNuisancesAt(e.latlng.lng,e.latlng.lat))});
  return group;
}
async function loadPressureLayers(){
  const [idfm,heat,equipment,stops,shopping]=await Promise.all([
    fetch("data/idfm-validations.json").then(r=>r.json()),
    fetch("data/heat_polygons.geojson").then(r=>r.json()),
    fetch("data/equipment-public.json").then(r=>r.json()),
    fetch("data/idfm-stops.json").then(r=>r.json()),
    fetch("data/shopping-centres.json").then(r=>r.json())
  ]);
  pressureData.stations=idfm.stations;const currentHour=Math.max(6,Math.min(23,new Date().getHours()));const maximum=Math.max(...idfm.stations.map(s=>s.hourly[currentHour]||0)),dailyMaximum=Math.max(...idfm.stations.map(s=>s.weekdayAverage||0)),mobilityRenderer=L.canvas({pane:"pulse",padding:.7});
  pressureData.stops=stops.stops;pressureData.equipment=equipment.records;pressureData.heat=heat.features;
  stops.stops.forEach(s=>{const lineCount=s.lines.length,halo=L.circle([s.lat,s.lon],{pane:"pulse",renderer:mobilityRenderer,radius:200,stroke:false,fillColor:"#1666a8",fillOpacity:Math.min(.11,.035+lineCount*.012),bubblingMouseEvents:false}).addTo(state.layers.stations);halo.on("click",()=>showNuisancesAt(s.lon,s.lat));halo.bindTooltip(`<strong>${esc(s.name)}</strong><br>${fmt(lineCount)} ligne${lineCount>1?"s":""} · aire piétonne 200 m`,{sticky:true});halo.on("click",()=>openDetail(`<span class="detail-tag">ARRÊT · IDFM GTFS</span><h2>${esc(s.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Lignes desservies</small><strong>${fmt(lineCount)}</strong></div><div class="kpi-tile warn"><small>Aire représentée</small><strong>200 m</strong><em>accessibilité piétonne indicative</em></div></div><p>${s.lines.slice(0,12).map(esc).join(" · ")}</p>`))});
  idfm.stations.forEach(s=>{const value=s.hourly[currentHour]||0,daily=s.weekdayAverage||0,ratio=Math.sqrt(daily/(dailyMaximum||1)),radius=800+700*ratio,color=pressureColor(value,maximum),detail=`<span class="detail-tag">PÔLE-GARE · IDFM</span><h2>${esc(s.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>${currentHour} h – ${currentHour+1} h</small><strong>${fmt(value)}</strong><em>validations</em></div><div class="kpi-tile warn"><small>Jour ouvré moyen</small><strong>${fmt(daily)}</strong><em>${esc(idfm.period)}</em></div><div class="kpi-tile"><small>Aire d’influence affichée</small><strong>${fmt(radius)} m</strong><em>socle 800 m + fréquentation</em></div></div>`;const halo=L.circle([s.lat,s.lon],{pane:"pulse",renderer:mobilityRenderer,radius,color,stroke:false,fillColor:color,fillOpacity:.10+.18*ratio,bubblingMouseEvents:false}).addTo(state.layers.stations);halo.on("click",()=>showNuisancesAt(s.lon,s.lat));halo.bindTooltip(`<strong>${esc(s.name)}</strong><br>${fmt(daily)} validations/jour · influence ${fmt(radius)} m`,{sticky:true});halo.on("click",()=>openDetail(detail));const marker=L.circleMarker([s.lat,s.lon],{pane:"pulse",renderer:mobilityRenderer,radius:5+8*Math.sqrt(value/(maximum||1)),color:"#fff",fillColor:color,weight:1.5,fillOpacity:.92,bubblingMouseEvents:false,className:"station-pressure"}).addTo(state.layers.stations);marker.on("click",()=>showNuisancesAt(s.lon,s.lat));marker.bindTooltip(`<strong>${esc(s.name)}</strong><br>${fmt(value)} validations · ${currentHour} h`,{sticky:true});marker.on("click",()=>openDetail(detail))});
  state.layers.stations.eachLayer(layer=>layer.off("click").on("click",e=>{L.DomEvent.stopPropagation(e);showNuisancesAt(e.latlng.lng,e.latlng.lat)}));
  $("stationStatus").textContent=`${idfm.stations.length} gares + ${stops.count} arrêts · IDFM`;
  state.layers.heat=L.geoJSON(heat,{pane:"noise",renderer:L.canvas({pane:"noise",padding:.4}),style:f=>{const n=Number(f.properties.day);return{stroke:false,fillColor:["#2c7bb6","#74add1","#c7e9d4","#fee08b","#f46d43","#b2182b"][Math.max(0,Math.min(5,Math.round(n+1)))],fillOpacity:.42,bubblingMouseEvents:false}},onEachFeature:(f,l)=>l.on("click",e=>{L.DomEvent.stopPropagation(e);showNuisancesAt(e.latlng.lng,e.latlng.lat);openDetail(`<span class="detail-tag">CHALEUR · INSTITUT PARIS REGION</span><h2>Îlot morphoclimatique</h2><div class="kpi-grid"><div class="kpi-tile warn"><small>Aléa de jour</small><strong>${fmt(Number(f.properties.day)+1)} / 5</strong></div><div class="kpi-tile"><small>Aléa de nuit</small><strong>${fmt(Number(f.properties.night)+1)} / 5</strong></div></div><p>Zone climatique locale : <b>${esc(f.properties.lcz||"—")}</b></p>`)} )});
  state.layers.heat.eachLayer(layer=>layer.off("click").on("click",e=>{L.DomEvent.stopPropagation(e);showNuisancesAt(e.latlng.lng,e.latlng.lat)}));
  state.layers.equipment=equipmentInfluenceLayer(equipment.records,shopping.centres);if(state.active.has("equipment"))state.layers.equipment.addTo(map);
  loadTemperatures();
}
async function loadTemperatures(){
  try{
    const points=[[49.04,2.08,"Cergy"],[48.95,2.25,"Argenteuil"],[49.00,2.52,"Roissy"],[49.15,2.28,"Persan"],[49.15,1.79,"Magny-en-Vexin"]];
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${points.map(p=>p[0]).join(",")}&longitude=${points.map(p=>p[1]).join(",")}&current=temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_gusts_10m&timezone=Europe%2FParis`;
    let json=await fetch(url).then(r=>r.json());if(!Array.isArray(json))json=[json];pressureData.temperatures=json;
    pressureData.temperaturePoints=json.map((d,i)=>({lat:points[i][0],lon:points[i][1],name:points[i][2],temperature:d.current?.temperature_2m,apparent:d.current?.apparent_temperature,precipitation:d.current?.precipitation,weatherCode:d.current?.weather_code,gust:d.current?.wind_gusts_10m,time:d.current?.time}));
  }catch{pressureData.temperaturePoints=[]}
}
loadPressureLayers().catch(error=>console.error("Couches Pulse",error));
function toggle(name, on) {
  state.active[on ? "add" : "delete"](name);
  const layer = state.layers[name];
  if (layer) {
    if (on) layer.addTo(map);
    else map.removeLayer(layer);
  }
  updateLegend();
}
document.querySelectorAll(".layer-card").forEach(
  (b) =>
    (b.onclick = () => {
      b.classList.toggle("active");
      toggle(b.dataset.layer, b.classList.contains("active"));
    }),
);
function updateLegend() {
  const parts = [];
  if(state.active.has("stations"))parts.push('<span><i class="plane-dot" style="background:#b40025"></i>Influence gares et arrêts · IDFM</span>');
  if(state.active.has("airNoise"))parts.push('<span><i class="air-ramp"></i>Coexposition air-bruit · 2024</span>');
  if(state.active.has("heat"))parts.push('<span><i class="noise-ramp"></i>Aléa chaleur morphoclimatique</span>');
  if(state.active.has("artificial"))parts.push('<span><i class="road-line" style="background:#ff377a"></i>Sols artificialisés · OCS GE</span>');
  if(state.active.has("equipment"))parts.push('<span><i class="plane-dot" style="background:#7a1f78"></i>Influence cumulée des équipements · ~750 m</span>');
  if(state.active.has("temperature"))parts.push('<span><i class="plane-dot" style="background:#d7191c"></i>Température actuelle</span>');
  if (state.active.has("traffic"))
    parts.push(
      '<span class="traffic-key"><i></i><b>fluide</b><i></i><b>ralenti</b><i></i><b>saturé</b></span>',
    );
  if (state.active.has("roadNoise"))
    parts.push(
      '<span><i class="noise-ramp"></i>Bruit routier · Ln 40–75 dB(A)</span>',
    );
  if (state.active.has("railNoise"))
    parts.push(
      '<span><i class="noise-ramp"></i>Bruit ferroviaire · Lden 55–75 dB(A)</span>',
    );
  if (state.active.has("csRoad"))
    parts.push(
      '<span><i class="cs-line-swatch"></i>Classement sonore routier (1 à 5)</span>',
    );
  if (state.active.has("csRail"))
    parts.push(
      '<span><i class="cs-line-swatch"></i>Classement sonore ferroviaire (1 à 5)</span>',
    );
  if (state.active.has("roads"))
    parts.push('<span><i class="road-line"></i>Axes routiers</span>');
  if (state.active.has("rails"))
    parts.push('<span><i class="rail-line"></i>Voies ferrées</span>');
  if (state.active.has("aircraft"))
    parts.push('<span><i class="plane-dot"></i>Avions maintenant</span>');
  $("legendContent").innerHTML =
    parts.join("") || "<small>Aucune couche active</small>";
}
function openSynthesis() {
  const pop = 1221750,
    noise = 26794.99;
  const communes = Object.values(state.stats || {});
  const noiseRanking = communes
    .map((commune) => ({
      ...commune,
      exposed: (commune.population * commune.bruit_degrade_pct) / 100,
    }))
    .sort((a, b) => b.exposed - a.exposed)
    .slice(0, 5);
  const hour=Math.max(6,Math.min(23,new Date().getHours())),hourTotals=Array.from({length:18},(_,i)=>i+6).map(h=>(pressureData.stations||[]).reduce((n,s)=>n+(s.hourly?.[h]||0),0)),validations=hourTotals[hour-6]||0,peakValidations=Math.max(...hourTotals,1),activityRatio=validations/peakValidations,activityLabel=activityRatio>=.8?"Très forte":activityRatio>=.5?"Soutenue":activityRatio>=.3?"Intermédiaire":"Calme",temps=(pressureData.temperaturePoints||[]).map(p=>Number(p.temperature)).filter(Number.isFinite),meanTemp=temps.length?temps.reduce((a,b)=>a+b,0)/temps.length:null,planes=movingAircraft.length,trafficText=$("trafficStatus")?.textContent||"Flux Sytadin";
  $("synthesisContent").innerHTML =
    `<div class="synthesis-dashboard-head"><span class="detail-tag">CARTE DE STRESS · VAL-D’OISE</span><h2>Le département maintenant</h2><p>${new Date().toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})} · données actuelles et repères structurels</p></div><div class="synthesis-now"><article><small>ACTIVITÉ ESTIMÉE DES GARES · ${hour} H–${hour+1} H</small><strong>${activityLabel}</strong><span>${fmt(validations)} validations · ${fmt(activityRatio*100)} % du pic journalier</span></article><article><small>TRAFIC ROUTIER</small><strong>Direct</strong><span>${esc(trafficText.replace(/^Sytadin · /,""))}</span></article><article><small>TRAFIC AÉRIEN</small><strong>${fmt(planes)}</strong><span>aéronefs observés maintenant</span></article><article><small>MÉTÉO DÉPARTEMENTALE</small><strong>${meanTemp==null?"—":fmt(meanTemp,1)+" °C"}</strong><span>moyenne des 5 points actuels</span></article></div><div class="synthesis-columns"><section class="synthesis-viz"><strong>Exposition structurelle au bruit</strong><small class="synthesis-caption">${fmt(noise)} habitants estimés · ${fmt((100*noise)/pop,1)} % de la population étudiée</small>${bar("Part départementale",(100*noise)/pop,"#d66b32")}</section><section class="synthesis-viz"><strong>Communes les plus concernées</strong><small class="synthesis-caption">Effectifs estimés dans les classes les plus dégradées · Bruitparif 2024</small>${rankingBars(noiseRanking,"bruit_degrade_pct","#d66b32")}</section></div>`;
  $("synthesisDialog").showModal();
}
function rankingBars(rows, percentageKey, color) {
  const maximum = Math.max(...rows.map((row) => row.exposed), 1);
  return rows
    .map(
      (row) =>
        `<div class="synthesis-bar-row"><div><span>${esc(row.nom)}</span><b>${fmt(row.exposed)} hab. · ${fmt(row[percentageKey], 1)} %</b></div><div class="synthesis-bar-track"><i style="--bar-width:${(100 * row.exposed) / maximum}%;--bar-color:${color}"></i></div></div>`,
    )
    .join("");
}
function bar(label, v, color) {
  return `<div class="synthesis-bar-row"><div><span>${label}</span><b>${fmt(v, 1)} %</b></div><div class="synthesis-bar-track"><i style="--bar-width:${Math.min(100, v)}%;--bar-color:${color}"></i></div></div>`;
}
$("clearAll").onclick = () => {
  document.querySelectorAll(".layer-card.active").forEach((button) => {
    button.classList.remove("active");
    toggle(button.dataset.layer, false);
  });
  closeDetail();
};
$("resetView").onclick = () =>
  state.layers.communes &&
  map.fitBounds(state.layers.communes.getBounds(), { padding: [10, 10] });
$("closeDetail").onclick = closeDetail;
$("openData").onclick = $("openDataTop").onclick = openSynthesis;
$("openMethod").onclick = () => $("methodDialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
$("mobileLayers").onclick = () => $("layerSidebar").classList.toggle("open");
const layersScroller=document.querySelector(".layers-scroll");
layersScroller.addEventListener("wheel",event=>event.stopPropagation(),{passive:true});
updateLegend();
