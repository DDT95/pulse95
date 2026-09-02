// Pulse95 · Activité mobile observée · Ookla T1 2026
// Couche exploratoire indépendante du score global de pression.
(async function () {
  const DATA_URL = "data/mobile-activity-t1-2026.b64";
  const recurrenceLabels = ["Ponctuelle", "Occasionnelle", "Régulière", "Très régulière"];
  const confidenceLabels = ["Faible", "Moyenne", "Forte"];
  const recurrenceColors = ["#d8e7f2", "#7fc8c2", "#f2b84b", "#a8325e"];

  function mobileLegend() {
    return '<span><i style="display:inline-block;width:44px;height:8px;border-radius:5px;background:linear-gradient(90deg,#d8e7f2,#7fc8c2,#f2b84b,#a8325e);margin-right:7px"></i>Activité mobile · ponctuelle → très régulière</span>';
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
    button.innerHTML = '<i class="layer-swatch" style="background:linear-gradient(135deg,#7fc8c2 0 45%,#f2b84b 45% 70%,#a8325e 70%);border-radius:3px"></i><span><b>Activité mobile observée</b><small id="mobileActivityStatus">Ookla · T1 2026 · chargement…</small></span><i class="layer-switch"></i>';
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

  addMenuButton();
  state.layers.mobileActivity = L.layerGroup();
  if (!map.getPane("presence")) {
    map.createPane("presence");
    map.getPane("presence").style.zIndex = 435;
  }

  try {
    const dataset = await decodeDataset();
    state.data.mobileActivity = dataset;
    const renderer = L.canvas({ pane: "presence", padding: 0.5 });
    dataset.cells.forEach(cell => {
      const [south, west, north, east, tests, days, weeks, confidenceScore, confidenceCode, recurrenceCode] = cell;
      const color = recurrenceColors[recurrenceCode] || recurrenceColors[0];
      const opacity = 0.14 + recurrenceCode * 0.10 + confidenceCode * 0.055;
      const rectangle = L.rectangle([[south, west], [north, east]], {
        pane: "presence",
        renderer,
        color: color,
        weight: recurrenceCode >= 2 ? 0.8 : 0.35,
        opacity: Math.min(0.8, opacity + 0.18),
        fillColor: color,
        fillOpacity: Math.min(0.58, opacity),
        bubblingMouseEvents: false
      }).addTo(state.layers.mobileActivity);
      rectangle.bindTooltip(`<strong>${recurrenceLabels[recurrenceCode]}</strong><br>${fmt(tests)} mesures · ${fmt(days)} jours · ${fmt(weeks)} semaines<br>Confiance ${confidenceLabels[confidenceCode].toLowerCase()} · ${fmt(confidenceScore,1)}/100`, { sticky: true });
      rectangle.on("click", e => {
        L.DomEvent.stopPropagation(e);
        openCellDetail(cell);
      });
    });
    const status = document.getElementById("mobileActivityStatus");
    if (status) status.textContent = `${fmt(dataset.cells.length)} mailles observées · Ookla T1 2026`;
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
