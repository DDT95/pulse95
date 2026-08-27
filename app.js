const COMPONENTS = {
  road:{label:"Route",color:"#e1000f",weight:22}, transit:{label:"Transports",color:"#6957d9",weight:22},
  presence:{label:"Présence",color:"#ef7f32",weight:20}, active:{label:"Piétons / vélos",color:"#1ea775",weight:12},
  noise:{label:"Bruit",color:"#b34879",weight:14}, heat:{label:"Chaleur",color:"#e6b800",weight:10}
};
const HOTSPOTS = [
  [48.947,2.248,"Argenteuil",{road:78,transit:94,presence:95,active:68,noise:78,heat:85}],
  [48.990,2.259,"Sannois–Ermont",{road:80,transit:83,presence:78,active:55,noise:74,heat:72}],
  [49.034,2.079,"Cergy–Pontoise",{road:76,transit:90,presence:92,active:70,noise:61,heat:70}],
  [48.970,2.308,"Enghien–Deuil",{road:57,transit:79,presence:74,active:63,noise:66,heat:64}],
  [49.009,2.357,"Sarcelles–Garges",{road:69,transit:85,presence:90,active:58,noise:77,heat:82}],
  [49.069,2.324,"Domont",{road:61,transit:64,presence:56,active:41,noise:58,heat:47}],
  [49.142,2.279,"L’Isle-Adam",{road:42,transit:43,presence:48,active:57,noise:35,heat:28}],
  [49.102,2.438,"Roissy–Gonesse",{road:96,transit:76,presence:83,active:22,noise:100,heat:78}],
  [49.022,2.470,"Goussainville",{road:74,transit:70,presence:66,active:34,noise:94,heat:66}],
  [49.051,1.995,"Vauréal–Jouy",{road:54,transit:61,presence:66,active:62,noise:44,heat:51}],
  [49.165,1.785,"Magny-en-Vexin",{road:38,transit:25,presence:41,active:38,noise:32,heat:24}],
  [49.074,2.215,"Taverny–Franconville",{road:83,transit:76,presence:73,active:48,noise:71,heat:63}],
  [49.125,2.207,"Persan–Beaumont",{road:67,transit:72,presence:59,active:40,noise:59,heat:48}]
];
const labels={global:"Indice global",...Object.fromEntries(Object.entries(COMPONENTS).map(([k,v])=>[k,v.label]))};
let hour=8, indicator="global", playing=false, timer=null, department=null, cells=[], layers=[];
const weights=Object.fromEntries(Object.entries(COMPONENTS).map(([k,v])=>[k,v.weight]));
const map=L.map("map",{zoomControl:false,minZoom:9,maxZoom:14}).fitBounds([[48.89,1.60],[49.25,2.60]],{padding:[8,8]});
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:19,attribution:"© OpenStreetMap · © CARTO"}).addTo(map);
L.control.zoom({position:"bottomright"}).addTo(map);
const gridGroup=L.layerGroup().addTo(map);

function gaussian(h,peak,width){const d=Math.min(Math.abs(h-peak),24-Math.abs(h-peak));return Math.exp(-(d*d)/(2*width*width));}
function timeFactor(key,h,lat,lon){
  const urban=lon>2.15?1:0.88;
  if(key==="road")return .35+.68*gaussian(h,8,1.45)+.73*gaussian(h,18,1.65);
  if(key==="transit")return .25+.78*gaussian(h,8,1.25)+.70*gaussian(h,18,1.5);
  if(key==="presence")return .38+.48*gaussian(h,13,3.5)+.25*gaussian(h,19,2.6)*urban;
  if(key==="active")return .23+.38*gaussian(h,8,1.8)+.58*gaussian(h,18,2.4)+.25*gaussian(h,13,3);
  if(key==="noise")return .45+.45*gaussian(h,8,1.7)+.50*gaussian(h,18,2);
  return .18+.84*gaussian(h,16,3.2);
}
function pointInRing(lat,lon,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function insideDepartment(lat,lon){if(!department)return true;const polys=department.type==="MultiPolygon"?department.coordinates: [department.coordinates];return polys.some(p=>pointInRing(lat,lon,p[0]));}
function baseAt(lat,lon,key){let sum=0,den=0;for(const [y,x,,vals] of HOTSPOTS){const dx=(lon-x)*72,dy=(lat-y)*111,d=Math.sqrt(dx*dx+dy*dy),influence=Math.exp(-(d*d)/(2*8.5*8.5));sum+=vals[key]*influence;den+=influence;}const rural=key==="heat"?12:key==="active"?18:15;return Math.min(100,rural+sum/(Math.max(.8,den))*Math.min(1,den));}
function valuesFor(cell){const out={};for(const key of Object.keys(COMPONENTS))out[key]=Math.round(Math.min(100,baseAt(cell.lat,cell.lon,key)*timeFactor(key,hour,cell.lat,cell.lon)));const total=Object.values(weights).reduce((a,b)=>a+b,0);out.global=Math.round(Object.keys(COMPONENTS).reduce((s,k)=>s+out[k]*weights[k],0)/total);return out;}
function color(v){if(v<20)return "#d9f2e6";if(v<40)return "#78d1cc";if(v<60)return "#ffd35c";if(v<80)return "#ff8a3c";return "#b90020";}
function nearestPlace(cell){return HOTSPOTS.reduce((a,b)=>Math.hypot(cell.lat-b[0],cell.lon-b[1])<Math.hypot(cell.lat-a[0],cell.lon-a[1])?b:a)[2];}
function buildGrid(){cells=[];const stepLat=.009,stepLon=.0138;for(let lat=48.895;lat<=49.245;lat+=stepLat)for(let lon=1.61;lon<=2.59;lon+=stepLon)if(insideDepartment(lat+stepLat/2,lon+stepLon/2))cells.push({lat:lat+stepLat/2,lon:lon+stepLon/2,bounds:[[lat,lon],[lat+stepLat,lon+stepLon]]});render();}
function render(){gridGroup.clearLayers();layers=[];for(const cell of cells){const vals=valuesFor(cell),v=vals[indicator];const layer=L.rectangle(cell.bounds,{stroke:true,color:"#fff",weight:.25,opacity:.28,fillColor:color(v),fillOpacity:.72}).addTo(gridGroup);layer.bindTooltip(`${nearestPlace(cell)} · ${labels[indicator]} : <b>${v}</b>`,{sticky:true,className:"cell-tooltip"});layer.on("click",()=>selectCell(cell));layers.push(layer);}document.getElementById("mapKicker").textContent=labels[indicator].toUpperCase();document.getElementById("timeLabel").textContent=`${String(hour).padStart(2,"0")}:00`;document.getElementById("hourValue").textContent=`${String(hour).padStart(2,"0")} h`;document.getElementById("periodLabel").textContent=period(hour);}
function period(h){if(h<=6)return "Réveil du territoire";if(h<=9)return "Pointe du matin";if(h<=11)return "Installation de la journée";if(h<=14)return "Activité de mi-journée";if(h<=16)return "Pic thermique";if(h<=19)return "Pointe du soir";return "Retour résidentiel";}
function selectCell(cell){const vals=valuesFor(cell);document.getElementById("selectionCard").hidden=false;document.getElementById("cellHour").textContent=`${String(hour).padStart(2,"0")} H`;document.getElementById("cellScore").textContent=vals.global;document.getElementById("cellPlace").textContent=`Secteur de ${nearestPlace(cell)}`;document.getElementById("cellDetails").innerHTML=Object.entries(COMPONENTS).map(([k,v])=>`<div class="detail-row" style="--accent:${v.color}"><span>${v.label}</span><div><i style="width:${vals[k]}%"></i></div><b>${vals[k]}</b></div>`).join("");}
function buildControls(){document.getElementById("weightControls").innerHTML=Object.entries(COMPONENTS).map(([k,v])=>`<div class="weight-row" style="--accent:${v.color}"><i></i><div class="weight-copy"><label for="w-${k}">${v.label}</label><output id="o-${k}">${weights[k]} %</output><input id="w-${k}" data-key="${k}" type="range" min="0" max="40" value="${weights[k]}"></div><span id="n-${k}"></span></div>`).join("");document.querySelectorAll(".weight-row input").forEach(el=>el.addEventListener("input",e=>{weights[e.target.dataset.key]=+e.target.value;normalizeWeightLabels();render();}));normalizeWeightLabels();}
function normalizeWeightLabels(){const total=Object.values(weights).reduce((a,b)=>a+b,0)||1;for(const k of Object.keys(weights)){document.getElementById(`o-${k}`).textContent=`${weights[k]} %`;document.getElementById(`n-${k}`).textContent=`${Math.round(weights[k]/total*100)}%`;}}
document.getElementById("hour").addEventListener("input",e=>{hour=+e.target.value;render();});
document.getElementById("indicator").addEventListener("change",e=>{indicator=e.target.value;render();});
document.getElementById("play").addEventListener("click",e=>{playing=!playing;e.currentTarget.classList.toggle("playing",playing);e.currentTarget.firstElementChild.textContent=playing?"Ⅱ":"▶";clearInterval(timer);if(playing)timer=setInterval(()=>{hour=hour>=23?6:hour+1;document.getElementById("hour").value=hour;render();},900);});
document.getElementById("resetWeights").addEventListener("click",()=>{for(const [k,v] of Object.entries(COMPONENTS)){weights[k]=v.weight;document.getElementById(`w-${k}`).value=v.weight;}normalizeWeightLabels();render();});
document.getElementById("closeSelection").onclick=()=>document.getElementById("selectionCard").hidden=true;
document.getElementById("openMethod").onclick=()=>document.getElementById("methodDialog").showModal();document.getElementById("closeMethod").onclick=()=>document.getElementById("methodDialog").close();
document.getElementById("mobilePanel").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
buildControls();
fetch("https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ADMINEXPRESS-COG-CARTO-PE.LATEST%3Adepartement&outputFormat=application%2Fjson&CQL_FILTER=code_insee%3D%2795%27&srsName=EPSG%3A4326").then(r=>r.json()).then(data=>{department=data.features?.[0]?.geometry;if(department){L.geoJSON(data,{style:{color:"#070047",weight:2.2,fill:false},interactive:false}).addTo(map);map.fitBounds(L.geoJSON(data).getBounds(),{padding:[20,20]});}buildGrid();}).catch(buildGrid);
