// Pulse95 · Activité mobile observée · Ookla T1 2026
// Signal exploratoire : la couche reste visible indépendamment, mais son signal
// temporel renforce désormais de façon plafonnée le critère « Présence & mobilité ».
(async function () {
  const DATA_URL = "data/mobile-activity-t1-2026.b64";
  const recurrenceLabels = ["Ponctuelle", "Occasionnelle", "Régulière", "Très régulière"];
  const confidenceLabels = ["Faible", "Moyenne", "Forte"];
  const recurrenceColors = ["#d8e7f2", "#7fc8c2", "#f2b84b", "#a8325e"];
  const recurrenceScores = [1, 2, 3.5, 5];
  const confidenceFactors = [0.4, 0.7, 1];

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
    if (typeof DecompressionStream === "undefined") throw new Error("Décompression gzip non prise en charge par ce navigateur");
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

  function cellAt(dataset, lon, lat) {
    return dataset?.cells?.find(cell => lat >= cell[0] && lat <= cell[2] && lon >= cell[1] && lon <= cell[3]) || null;
  }

  function mobileSignal(cell) {
    if (!cell) return { score: 0, boost: 0, label: "Aucune observation", confidence: "—", tests: 0, days: 0, weeks: 0 };
    const [, , , , tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
    const recurrenceBase = recurrenceScores[recurrenceCode] || 0;
    const confidenceFactor = confidenceFactors[confidenceCode] ?? 0.4;
    // Le volume ne peut faire varier le score que de 25 % : il ne doit jamais dominer
    // la récurrence et la confiance du signal.
    const volumeFactor = 0.75 + 0.25 * Math.min(1, Math.log1p(tests) / Math.log1p(50));
    const score = Math.min(5, recurrenceBase * confidenceFactor * volumeFactor);
    return {
      score,
      label: recurrenceLabels[recurrenceCode] || "—",
      confidence: confidenceLabels[confidenceCode] || "—",
      confidenceScore,
      tests,
      days,
      weeks
    };
  }

  function applyMobileToStress(dataset, lon, lat) {
    const stress = state.currentStress;
    if (!stress?.criteria?.length) return;
    const row = stress.criteria.find(r => r.name === "Mobilité & fréquentation" || r.name === "Présence & mobilité");
    if (!row) return;

    const cell = cellAt(dataset, lon, lat);
    const mobile = mobileSignal(cell);
    const idfmScore = Number(row._idfmScore ?? row.score ?? 0);
    row._idfmScore = idfmScore;

    // Renfort plafonné : au maximum +2 points quand le score IDFM vaut 0,
    // puis effet décroissant quand la mobilité est déjà bien observée par IDFM.
    const addition = Math.min(2, 0.40 * mobile.score * (1 - idfmScore / 5));
    const combined = Math.min(5, idfmScore + addition);

    row.name = "Présence & mobilité";
    row.score = combined;
    row.value = cell
      ? `${row.value} · Ookla : ${fmt(mobile.tests)} mesures sur ${fmt(mobile.days)} jours et ${fmt(mobile.weeks)} semaines`
      : `${row.value} · Ookla : aucune observation dans cette maille`;
    row.detail = cell
      ? `Base IDFM ${displayScore(idfmScore)} · signal mobile ${displayScore(mobile.score)} · renfort Ookla +${fmt(addition,1)} · récurrence ${mobile.label.toLowerCase()} · confiance ${mobile.confidence.toLowerCase()}`
      : `Base IDFM ${displayScore(idfmScore)} · aucun renfort Ookla faute d’observation dans la maille`;
    row.source = "IDFM · validations et arrêts + ARCEP/Ookla · crowdsourcing T1 2026";
    row.why = cell
      ? `Le signal Ookla complète la lecture IDFM lorsque l’activité est répétée dans le temps. Son apport est plafonné à 2 points et décroît quand IDFM décrit déjà fortement la fréquentation. Ici il ajoute ${fmt(addition,1)} point(s).`
      : `Aucun test Ookla n’est observé dans la maille : la note reste celle issue d’IDFM.`;

    const global = globalStress(stress.criteria.map(r => r.contribution ?? r.score));
    stress.score = global;
    stress.mobileActivity = cell ? {
      tests: mobile.tests,
      days: mobile.days,
      weeks: mobile.weeks,
      recurrence: mobile.label,
      confidence: mobile.confidence,
      confidenceScore: mobile.confidenceScore,
      score: mobile.score,
      addition
    } : null;

    // Rafraîchit uniquement la carte de critère et le score global sans reconstruire
    // tout le diagnostic (les boutons PDF/JSON continuent d’utiliser state.currentStress).
    const cards = [...document.querySelectorAll("#detailContent .stress-card")];
    const mobilityCard = cards.find(card => /Mobilité\s*&\s*fréquentation|Présence\s*&\s*mobilité/i.test(card.textContent || ""));
    if (mobilityCard) mobilityCard.outerHTML = stressCard(row);
    const globalBox = document.querySelector("#detailContent .stress-global");
    if (globalBox) {
      globalBox.style.setProperty("--stress", stressColor(global));
      const strong = globalBox.querySelector("strong");
      const em = globalBox.querySelector("em");
      if (strong) strong.textContent = displayScore(global);
      if (em) em.textContent = stressLabel(global);
    }
  }

  function openCellDetail(cell) {
    const [south, west, north, east, tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
    const recurrence = recurrenceLabels[recurrenceCode] || "—";
    const confidence = confidenceLabels[confidenceCode] || "—";
    const lat = (south + north) / 2;
    const lon = (west + east) / 2;
    const mobile = mobileSignal(cell);
    openDetail(`<span class="detail-tag">ACTIVITÉ MOBILE OBSERVÉE · OOKLA · T1 2026</span><h2>Maille 500 m</h2><div class="kpi-grid"><div class="kpi-tile"><small>Mesures</small><strong>${fmt(tests)}</strong><em>tests crowdsourcés</em></div><div class="kpi-tile"><small>Jours distincts</small><strong>${fmt(days)}</strong><em>sur 91 jours</em></div><div class="kpi-tile"><small>Semaines</small><strong>${fmt(weeks)}</strong><em>sur 14 semaines</em></div><div class="kpi-tile warn"><small>Récurrence</small><strong>${esc(recurrence)}</strong><em>confiance ${esc(confidence.toLowerCase())} · ${fmt(confidenceScore,1)}/100</em></div><div class="kpi-tile"><small>Signal de présence</small><strong>${displayScore(mobile.score)}</strong><em>utilisé comme renfort plafonné du critère Présence & mobilité</em></div></div><h3>Lecture</h3><p>Cette maille montre une activité numérique <b>${esc(recurrence.toLowerCase())}</b> au cours du trimestre. Dans le diagnostic, ce signal peut renforcer la note IDFM, avec un maximum de +2 points et un effet décroissant lorsque les transports décrivent déjà fortement la fréquentation.</p><p class="flag-note">Ce signal ne compte pas des personnes. Il représente des mesures Ookla crowdsourcées et peut être influencé par les usages, les appareils et la couverture de l’échantillon.</p><button id="mobileFullDiagnostic" class="sources-inline" style="width:100%;margin-top:8px">Ouvrir aussi le diagnostic de pression</button>`);
    const diagnosticButton = document.getElementById("mobileFullDiagnostic");
    if (diagnosticButton) diagnosticButton.onclick = () => showNuisancesAt(lon, lat);
  }

  function clusterCells(cells) {
    const zoom = map.getZoom();
    const clusterPx = zoom <= 10 ? 70 : zoom <= 11 ? 62 : zoom <= 12 ? 52 : zoom <= 13 ? 42 : 28;
    const buckets = new Map();
    cells.forEach(cell => {
      const [south, west, north, east, tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
      const lat = (south + north) / 2, lon = (west + east) / 2, p = map.project([lat, lon], zoom);
      const key = `${Math.floor(p.x / clusterPx)}:${Math.floor(p.y / clusterPx)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { cells: [], tests: 0, latWeight: 0, lonWeight: 0, recurrenceWeight: 0, confidenceWeight: 0, days: 0, weeks: 0 };
        buckets.set(key, bucket);
      }
      const weight = Math.max(1, tests);
      bucket.cells.push(cell); bucket.tests += tests; bucket.latWeight += lat * weight; bucket.lonWeight += lon * weight;
      bucket.recurrenceWeight += recurrenceCode * weight; bucket.confidenceWeight += confidenceScore * weight;
      bucket.days = Math.max(bucket.days, days); bucket.weeks = Math.max(bucket.weeks, weeks);
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
        pane: "presence", renderer, radius, color,
        weight: 1 + confidenceCode * 0.55,
        opacity: 0.72 + confidenceCode * 0.08,
        fillColor: color,
        fillOpacity: 0.30 + cluster.recurrenceCode * 0.08 + confidenceCode * 0.05,
        bubblingMouseEvents: false
      }).addTo(group);
      const recurrence = recurrenceLabels[cluster.recurrenceCode], confidence = confidenceLabels[confidenceCode];
      const groupText = cluster.cells.length > 1 ? `${fmt(cluster.cells.length)} mailles regroupées · ` : "";
      circle.bindTooltip(`<strong>${recurrence}</strong><br>${groupText}${fmt(cluster.tests)} mesures<br>${fmt(cluster.days)} jours · ${fmt(cluster.weeks)} semaines · confiance ${confidence.toLowerCase()}`, { sticky: true });
      circle.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (cluster.cells.length === 1 || map.getZoom() >= 14) return openCellDetail(cluster.cells[0]);
        const bounds = L.latLngBounds(cluster.cells.map(cell => [(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2]));
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
    window.mobileActivityAt = (lon, lat) => cellAt(dataset, lon, lat);
    renderClusters(dataset);
    map.on("zoomend", () => renderClusters(dataset));

    // Branche le signal mobile dans le vrai diagnostic local.
    const baseShowNuisancesAt = showNuisancesAt;
    showNuisancesAt = async function(lon, lat) {
      await baseShowNuisancesAt(lon, lat);
      applyMobileToStress(dataset, lon, lat);
    };

    const status = document.getElementById("mobileActivityStatus");
    if (status) status.textContent = `${fmt(dataset.cells.length)} mailles · intégré au score Présence & mobilité · Ookla T1 2026`;
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
