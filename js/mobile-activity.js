// Pulse95 · Activité mobile observée · Ookla T1 2026
// Couche exploratoire indépendante du score global de pression.
(async function () {
  const DATA_URL = "data/mobile-activity-t1-2026.b64";
  const recurrenceLabels = ["Ponctuelle", "Occasionnelle", "Régulière", "Très régulière"];
  const confidenceLabels = ["Faible", "Moyenne", "Forte"];
  const recurrenceColors = ["#d8e7f2", "#7fc8c2", "#f2b84b", "#a8325e"];

  function mobileLegend() {
    return '<span><i style="display:inline-flex;align-items:flex-end;gap:2px;width:44px;height:16px;margin-right:7px"><b style="display:block;width:6px;height:6px;border-radius:50%;background:#7fc8c2"></b><b style="display:block;width:10px;height:10px;border-radius:50%;background:#f2b84b"></b><b style="display:block;width:15px;height:15px;border-radius:50%;background:#a8325e"></b></i>Activité mobile · taille = volume · couleur = récurrence</span>';
  }

  async function decodeDataset() {
    const b64 = (await fetch(DATA_URL).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })).trim();
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Décompression gzip non prise en charge par ce navigateur");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  function addMenuButton() {
    const groups = [...document.querySelectorAll(".layer-group")];
    const group = groups.find(g => /ÉQUIPEMENTS\s*&\s*PRÉSENCE/i.test(g.querySelector(":scope > span")?.textContent || ""));
    const cards = group?.querySelector(".layer-cards");
    if (!cards || cards.querySelector('[data-layer="mobileActivity"]')) return;
    const button = document.createElement("button");
    button.className = "layer-card";
    button.dataset.layer = "mobileActivity";
    button.innerHTML = '<i class="layer-swatch" style="background:radial-gradient(circle at 28% 72%,#7fc8c2 0 24%,transparent 25%),radial-gradient(circle at 72% 42%,#f2b84b 0 31%,transparent 32%),radial-gradient(circle at 52% 52%,#a8325e 0 46%,transparent 47%);border-radius:50%"></i><span><b>Activité mobile observée</b><small id="mobileActivityStatus">Ookla · T1 2026 · chargement…</small></span><i class="layer-switch"></i>';
    cards.appendChild(button);
    button.onclick = () => {
      button.classList.toggle("active");
      toggle("mobileActivity", button.classList.contains("active"));
    };
  }

  function openCellDetail(cell) {
    const [south, west, north, east, tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
    const recurrence = recurrenceLabels[recurrenceCode] || "—";
    const confidence = confidenceLabels[confidenceCode] || "—";
    const lat = (south + north) / 2;
    const lon = (west + east) / 2;
    openDetail(`<span class="detail-tag">ACTIVITÉ MOBILE OBSERVÉE · OOKLA · T1 2026</span><h2>Maille 500 m</h2><div class="kpi-grid"><div class="kpi-tile"><small>Mesures</small><strong>${fmt(tests)}</strong><em>tests crowdsourcés</em></div><div class="kpi-tile"><small>Jours distincts</small><strong>${fmt(days)}</strong><em>sur 91 jours</em></div><div class="kpi-tile"><small>Semaines</small><strong>${fmt(weeks)}</strong><em>sur 14 semaines</em></div><div class="kpi-tile warn"><small>Récurrence</small><strong>${esc(recurrence)}</strong><em>confiance ${esc(confidence.toLowerCase())} · ${fmt(confidenceScore,1)}/100</em></div></div><h3>Lecture</h3><p>Cette maille montre une activité numérique <b>${esc(recurrence.toLowerCase())}</b> au cours du trimestre. Le score de confiance mesure surtout la répétition du signal dans le temps : jours, semaines et étendue sur le trimestre.</p><p class="flag-note">Ce signal ne compte pas des personnes. Il représente des mesures Ookla crowdsourcées et peut être influencé par les usages, les appareils et la couverture de l’échantillon. Une absence de mesure ne signifie pas une absence de population ou d’activité.</p><button id="mobileFullDiagnostic" class="sources-inline" style="width:100%;margin-top:8px">Ouvrir aussi le diagnostic de pression</button>`);
    const diagnosticButton = document.getElementById("mobileFullDiagnostic");
    if (diagnosticButton) diagnosticButton.onclick = () => showNuisancesAt(lon, lat);
  }

  function clusterCells(cells) {
    const zoom = map.getZoom();
    const clusterPx = zoom <= 10 ? 70 : zoom <= 11 ? 62 : zoom <= 12 ? 52 : zoom <= 13 ? 42 : 28;
    const buckets = new Map();

    cells.forEach(cell => {
      const [south, west, north, east, tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
      const lat = (south + north) / 2;
      const lon = (west + east) / 2;
      const p = map.project([lat, lon], zoom);
      const key = `${Math.floor(p.x / clusterPx)}:${Math.floor(p.y / clusterPx)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { cells: [], tests: 0, latWeight: 0, lonWeight: 0, recurrenceWeight: 0, confidenceWeight: 0, days: 0, weeks: 0 };
        buckets.set(key, bucket);
      }
      const weight = Math.max(1, tests);
      bucket.cells.push(cell);
      bucket.tests += tests;
      bucket.latWeight += lat * weight;
      bucket.lonWeight += lon * weight;
      bucket.recurrenceWeight += recurrenceCode * weight;
      bucket.confidenceWeight += confidenceScore * weight;
      bucket.days = Math.max(bucket.days, days);
      bucket.weeks = Math.max(bucket.weeks, weeks);
    });

    return [...buckets.values()].map(bucket => ({
      ...bucket,
      lat: bucket.latWeight / Math.max(1, bucket.tests),
      lon: bucket.lonWeight / Math.max(1, bucket.tests),
      recurrenceCode: Math.max(0, Math.min(3, Math.round(bucket.recurrenceWeight / Math.max(1, bucket.tests)))),
      confidenceScore: bucket.confidenceWeight / Math.max(1, bucket.tests)
    }));
  }

  function clusterRadius(cluster) {
    const countBoost = cluster.cells.length > 1 ? Math.log2(cluster.cells.length + 1) * 1.8 : 0;
    return Math.max(5, Math.min(30, 4 + Math.sqrt(cluster.tests) * 1.15 + countBoost));
  }

  function renderClusters(dataset) {
    const group = state.layers.mobileActivity;
    if (!group) return;
    group.clearLayers();
    const renderer = L.canvas({ pane: "presence", padding: 0.6 });
    const clusters = clusterCells(dataset.cells);

    clusters.forEach(cluster => {
      const color = recurrenceColors[cluster.recurrenceCode] || recurrenceColors[0];
      const confidenceCode = cluster.confidenceScore >= 70 ? 2 : cluster.confidenceScore >= 40 ? 1 : 0;
      const radius = clusterRadius(cluster);
      const circle = L.circleMarker([cluster.lat, cluster.lon], {
        pane: "presence",
        renderer,
        radius,
        color: color,
        weight: 1 + confidenceCode * 0.55,
        opacity: 0.72 + confidenceCode * 0.08,
        fillColor: color,
        fillOpacity: 0.30 + cluster.recurrenceCode * 0.08 + confidenceCode * 0.05,
        bubblingMouseEvents: false
      }).addTo(group);

      const recurrence = recurrenceLabels[cluster.recurrenceCode];
      const confidence = confidenceLabels[confidenceCode];
      const groupText = cluster.cells.length > 1 ? `${fmt(cluster.cells.length)} mailles regroupées · ` : "";
      circle.bindTooltip(`<strong>${recurrence}</strong><br>${groupText}${fmt(cluster.tests)} mesures<br>${fmt(cluster.days)} jours · ${fmt(cluster.weeks)} semaines · confiance ${confidence.toLowerCase()}`, { sticky: true });

      circle.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (cluster.cells.length === 1 || map.getZoom() >= 14) {
          openCellDetail(cluster.cells[0]);
          return;
        }
        const bounds = L.latLngBounds(cluster.cells.map(cell => [
          (cell[0] + cell[2]) / 2,
          (cell[1] + cell[3]) / 2
        ]));
        map.fitBounds(bounds.pad(0.45), { maxZoom: Math.min(15, map.getZoom() + 2) });
      });
    });
  }

  addMenuButton();
  state.layers.mobileActivity = L.layerGroup();
  if (!map.getPane("presence")) {
    map.createPane("presence");
    map.getPane("presence").style.zIndex = 435;
  }

  try {
    const dataset = await decodeDataset();
    state.data.mobileActivity = dataset;
    renderClusters(dataset);
    map.on("zoomend", () => renderClusters(dataset));
    const status = document.getElementById("mobileActivityStatus");
    if (status) status.textContent = `${fmt(dataset.cells.length)} mailles · regroupement dynamique · Ookla T1 2026`;
  } catch (error) {
    console.error("Couche activité mobile", error);
    const status = document.getElementById("mobileActivityStatus");
    if (status) status.textContent = "Ookla · couche momentanément indisponible";
  }

  const baseUpdateLegend = updateLegend;
  updateLegend = function () {
    baseUpdateLegend();
    if (state.active.has("mobileActivity")) {
      const legend = document.getElementById("legendContent");
      if (legend) legend.insertAdjacentHTML("beforeend", mobileLegend());
    }
  };
})();
