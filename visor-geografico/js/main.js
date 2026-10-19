/**
 * main.js
 * ------------------------------------------------------------------
 * Inicializa el visor geográfico del usuario (index.html).
 * Incluye mapas base, lectura de coordenadas del cursor,
 * centrado y activación de las capas (Instituciones, Vías, Viviendas, Límite).
 * ------------------------------------------------------------------
 */

let currentDisplayEpsg = "EPSG:4326";

const SABANETA_CENTER = [6.1515, -75.6165];
const SABANETA_ZOOM = 14;

/* ------------------------------------------------------------------
   CREAR MAPA
   ------------------------------------------------------------------ */

const map = L.map("map", {
  zoomControl: false,
}).setView(SABANETA_CENTER, SABANETA_ZOOM);

L.control.zoom({
  position: "bottomright"
}).addTo(map);

L.control.scale({
  position: "bottomleft",
  imperial: false,
  metric: true
}).addTo(map);

/* ------------------------------------------------------------------
   MAPAS BASE
   ------------------------------------------------------------------ */

const osmEstandar = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
  }
);

const osmClaro = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }
);

const osmOscuro = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }
);

const osmTopografico = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 17,
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: OpenTopoMap'
  }
);

osmEstandar.addTo(map);

/* ------------------------------------------------------------------
   GRUPOS DE CAPAS TEMÁTICAS
   ------------------------------------------------------------------ */

const grupoInstituciones = L.layerGroup().addTo(map);
const grupoVias = L.layerGroup();
const grupoViviendas = L.layerGroup();
const grupoLimiteMunicipal = L.layerGroup();

// Inicializar capas locales
if (typeof initInstitucionesLayer === 'function') {
  initInstitucionesLayer(map, grupoInstituciones);
}

if (typeof initViasLayer === 'function') {
  initViasLayer(map, grupoVias);
}

if (typeof initViviendasPriorizadas === 'function') {
  initViviendasPriorizadas(map, grupoViviendas);
}

/* ------------------------------------------------------------------
   CONTROL DE CAPAS BASE Y DE CONMUTACIÓN
   ------------------------------------------------------------------ */

const mapasBase = {
  "OpenStreetMap estándar": osmEstandar,
  "OpenStreetMap claro": osmClaro,
  "OpenStreetMap oscuro": osmOscuro,
  "OpenStreetMap topográfico": osmTopografico
};

L.control.layers(mapasBase, null, {
  collapsed: true,
  position: "topright"
}).addTo(map);

/* ------------------------------------------------------------------
   LÍMITE MUNICIPAL
   ------------------------------------------------------------------ */

fetch("data/viviendas_priorizadas_colegios.geojson")
  .then((response) => {
    if (!response.ok) throw new Error("No se pudo cargar el archivo del límite.");
    return response.json();
  })
  .then((geojson) => {
    const limite = L.geoJSON(geojson, {
      style: {
        color: "#00d9a5",
        weight: 3,
        opacity: 0.9,
        fillColor: "#00d9a5",
        fillOpacity: 0.05,
        dashArray: "6, 6"
      },
      onEachFeature: (feature, layer) => {
        const nombre = feature.properties?.name || feature.properties?.NOMBRE || "Sabaneta";
        layer.bindPopup(`<strong>Límite municipal</strong><br>${nombre}`);
      }
    });
    limite.addTo(grupoLimiteMunicipal);
  })
  .catch((error) => {
    console.info("Info sobre límite municipal:", error.message);
  });

/* ------------------------------------------------------------------
   SELECTOR DE SISTEMA DE COORDENADAS
   ------------------------------------------------------------------ */

const displaySelect = document.getElementById("display-crs-select");

function refreshDisplaySelect() {
  if (displaySelect && typeof populateCrsSelect === 'function') {
    populateCrsSelect(displaySelect, currentDisplayEpsg);
  }
}

refreshDisplaySelect();

function updateReadoutHeader() {
  if (typeof getCrsInfo !== 'function') return;
  const info = getCrsInfo(currentDisplayEpsg);
  if (!info) return;

  const systemEl = document.getElementById("readout-system");
  if (systemEl) systemEl.textContent = `${currentDisplayEpsg} · ${info.label}`;

  const label1 = document.getElementById("readout-label-1");
  const label2 = document.getElementById("readout-label-2");

  if (label1 && label2) {
    if (info.kind === "geografico") {
      label1.textContent = "LAT";
      label2.textContent = "LON";
    } else {
      label1.textContent = "NORTE (Y)";
      label2.textContent = "ESTE (X)";
    }
  }
}

updateReadoutHeader();

if (displaySelect) {
  displaySelect.addEventListener("change", (event) => {
    currentDisplayEpsg = event.target.value;
    refreshDisplaySelect();
    updateReadoutHeader();
  });
}

/* ------------------------------------------------------------------
   COORDENADAS DEL CURSOR EN TIEMPO REAL
   ------------------------------------------------------------------ */

map.on("mousemove", (event) => {
  if (typeof getCrsInfo !== 'function' || typeof convertFromWGS84 !== 'function') return;
  const { lat, lng } = event.latlng;
  const info = getCrsInfo(currentDisplayEpsg);
  if (!info) return;

  const { x, y } = convertFromWGS84(lat, lng, currentDisplayEpsg);

  const value1 = document.getElementById("readout-value-1");
  const value2 = document.getElementById("readout-value-2");

  if (value1) value1.textContent = formatCoordValue(y, info.kind);
  if (value2) value2.textContent = formatCoordValue(x, info.kind);
});

/* ------------------------------------------------------------------
   CARGA DE CAPAS PERSISTENTES
   ------------------------------------------------------------------ */

if (window.LayerManager && typeof window.LayerManager.init === 'function') {
  window.LayerManager.init(map);
}

/* ------------------------------------------------------------------
   BOTONES OPCIONALES (UBICACIÓN Y CENTRADO)
   ------------------------------------------------------------------ */

const btnCenterSabaneta = document.getElementById("btn-center-sabaneta");
if (btnCenterSabaneta) {
  btnCenterSabaneta.addEventListener("click", () => {
    map.setView(SABANETA_CENTER, SABANETA_ZOOM, {
      animate: true,
      duration: 0.8
    });
  });
}

const btnMyLocation = document.getElementById("btn-my-location");
if (btnMyLocation) {
  btnMyLocation.addEventListener("click", () => {
    map.locate({
      setView: true,
      maxZoom: 17,
      enableHighAccuracy: true,
      timeout: 10000
    });
  });
}