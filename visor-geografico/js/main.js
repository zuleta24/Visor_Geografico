/**
 * main.js
 * ------------------------------------------------------------------
 * Inicializa el visor geográfico con Leaflet.
 * Incluye capas base OpenStreetMap, controles, coordenadas,
 * instituciones, vías, carga de archivos y geolocalización.
 * ------------------------------------------------------------------
 */

// Sistema de coordenadas mostrado en el panel
let currentDisplayEpsg = "EPSG:4326";

// Coordenadas iniciales de Sabaneta, Antioquia
const SABANETA_CENTER = [6.1515, -75.6165];
const SABANETA_ZOOM = 14;

/* ------------------------------------------------------------------
   CREAR MAPA
   ------------------------------------------------------------------ */

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
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

// Capa oficial de OpenStreetMap
const osmEstandar = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
  }
);

// Mapa claro, con estilo moderno
const osmClaro = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> &copy; CARTO'
  }
);

// Mapa oscuro, recomendado para combinar con tu panel lateral oscuro
const osmOscuro = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> &copy; CARTO'
  }
);

// Mapa con relieve y curvas de nivel
const osmTopografico = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 17,
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, SRTM | Map style: &copy; OpenTopoMap'
  }
);

// Capa inicial
osmEstandar.addTo(map);

/* ------------------------------------------------------------------
   GRUPOS DE CAPAS TEMÁTICAS
   ------------------------------------------------------------------ */

const grupoInstituciones = L.layerGroup();
const grupoVias = L.layerGroup();
const grupoLimiteMunicipal = L.layerGroup();

/*
  IMPORTANTE:
  Tus funciones existentes deben aceptar el segundo parámetro.

  Ejemplo:
  function initInstitucionesLayer(map, grupoInstituciones) {
    L.geoJSON(datos).addTo(grupoInstituciones);
    grupoInstituciones.addTo(map);
  }

  Si actualmente tus capas se añaden directamente al mapa,
  puedes conservar temporalmente:
  initInstitucionesLayer(map);
  initViasLayer(map);
  initViviendasPriorizadas(map);
*/

initInstitucionesLayer(map, grupoInstituciones);
initViasLayer(map, grupoVias);

/* ------------------------------------------------------------------
   CONTROL DE CAPAS
   ------------------------------------------------------------------ */

const mapasBase = {
  "OpenStreetMap estándar": osmEstandar,
  "OpenStreetMap claro": osmClaro,
  "OpenStreetMap oscuro": osmOscuro,
  "OpenStreetMap topográfico": osmTopografico
};

const capasTematicas = {
  "Instituciones educativas": grupoInstituciones,
  "Vías de Sabaneta": grupoVias,
  "Límite municipal": grupoLimiteMunicipal
};

L.control.layers(mapasBase, capasTematicas, {
  collapsed: false,
  position: "topright"
}).addTo(map);

/* ------------------------------------------------------------------
   LÍMITE MUNICIPAL OPCIONAL
   ------------------------------------------------------------------

   Para que funcione debes crear esta ruta:

   datos/limite-sabaneta.geojson

   Si todavía no tienes el archivo, el resto del mapa funcionará.
*/

fetch("datos/limite-sabaneta.geojson")
  .then((response) => {
    if (!response.ok) {
      throw new Error("No se encontró el límite municipal.");
    }

    return response.json();
  })
  .then((geojson) => {
    const limite = L.geoJSON(geojson, {
      style: {
        color: "#00d9a5",
        weight: 3,
        opacity: 1,
        fillColor: "#00d9a5",
        fillOpacity: 0.08,
        dashArray: "7, 5"
      },
      onEachFeature: (feature, layer) => {
        const nombre =
          feature.properties?.name ||
          feature.properties?.NOMBRE ||
          "Sabaneta";

        layer.bindPopup(`
          <strong>Límite municipal</strong><br>
          ${nombre}
        `);
      }
    });

    limite.addTo(grupoLimiteMunicipal);
  })
  .catch((error) => {
    console.info("Límite municipal no cargado:", error.message);
  });

/* ------------------------------------------------------------------
   SELECTOR DE SISTEMA DE COORDENADAS
   ------------------------------------------------------------------ */

const displaySelect = document.getElementById("display-crs-select");

function refreshDisplaySelect() {
  populateCrsSelect(displaySelect, currentDisplayEpsg);
}

refreshDisplaySelect();

function updateReadoutHeader() {
  const info = getCrsInfo(currentDisplayEpsg);

  document.getElementById("readout-system").textContent =
    `${currentDisplayEpsg} · ${info.label}`;

  const label1 = document.getElementById("readout-label-1");
  const label2 = document.getElementById("readout-label-2");

  if (info.kind === "geografico") {
    label1.textContent = "LAT";
    label2.textContent = "LON";
  } else {
    label1.textContent = "NORTE (Y)";
    label2.textContent = "ESTE (X)";
  }
}

updateReadoutHeader();

displaySelect.addEventListener("change", (event) => {
  currentDisplayEpsg = event.target.value;

  refreshDisplaySelect();
  updateReadoutHeader();
});

/* ------------------------------------------------------------------
   COORDENADAS DEL CURSOR
   ------------------------------------------------------------------ */

map.on("mousemove", (event) => {
  const { lat, lng } = event.latlng;
  const info = getCrsInfo(currentDisplayEpsg);

  const { x, y } = convertFromWGS84(
    lat,
    lng,
    currentDisplayEpsg
  );

  const value1 = document.getElementById("readout-value-1");
  const value2 = document.getElementById("readout-value-2");

  if (info.kind === "geografico") {
    value1.textContent = formatCoordValue(y, info.kind);
    value2.textContent = formatCoordValue(x, info.kind);
  } else {
    value1.textContent = formatCoordValue(y, info.kind);
    value2.textContent = formatCoordValue(x, info.kind);
  }
});

/* ------------------------------------------------------------------
   CARGA DE ARCHIVOS
   ------------------------------------------------------------------ */

const fileInput = document.getElementById("file-input");
const filedropLabel = document.getElementById("filedrop-label");

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];

  if (!file) {
    return;
  }

  filedropLabel.textContent = file.name;
  handleFileSelected(file, map);
});

document
  .getElementById("crs-detect-confirm")
  .addEventListener("click", () => {
    confirmPendingLayer(map);
  });

/* ------------------------------------------------------------------
   BOTÓN: CENTRAR EN SABANETA
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

/* ------------------------------------------------------------------
   BOTÓN: UBICACIÓN DEL USUARIO
   ------------------------------------------------------------------ */

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

let userLocationMarker;
let userAccuracyCircle;

map.on("locationfound", (event) => {
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
  }

  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
  }

  userLocationMarker = L.circleMarker(event.latlng, {
    radius: 8,
    color: "#ffffff",
    weight: 2,
    fillColor: "#1976d2",
    fillOpacity: 1
  })
    .addTo(map)
    .bindPopup("Tu ubicación aproximada");

  userAccuracyCircle = L.circle(event.latlng, {
    radius: event.accuracy,
    color: "#1976d2",
    weight: 1,
    fillColor: "#1976d2",
    fillOpacity: 0.12
  }).addTo(map);

  userLocationMarker.openPopup();
});

map.on("locationerror", (event) => {
  console.warn("No se pudo obtener la ubicación:", event.message);

  alert(
    "No fue posible obtener tu ubicación. " +
    "Verifica que el navegador tenga permiso para acceder a tu ubicación."
  );
});