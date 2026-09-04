/**
 * main.js
 * ------------------------------------------------------------------
 * Inicializa el mapa Leaflet y conecta los controles de la interfaz:
 * carga de capas, confirmación de CRS, y lectura de coordenadas del
 * cursor en el sistema que el usuario elija.
 * ------------------------------------------------------------------
 */

// Estado: sistema en el que se muestran las coordenadas actualmente
let currentDisplayEpsg = 'EPSG:4326';

// ---- Mapa base -----------------------------------------------------
const map = L.map('map', { zoomControl: false }).setView([4.6, -74.1], 6);

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

initInstitucionesLayer(map);

// ---- Selector de sistema de visualización --------------------------
const displaySelect = document.getElementById('display-crs-select');

function refreshDisplaySelect() {
  populateCrsSelect(displaySelect, currentDisplayEpsg);
}
refreshDisplaySelect();

function updateReadoutHeader() {
  const info = getCrsInfo(currentDisplayEpsg);
  document.getElementById('readout-system').textContent = `${currentDisplayEpsg} · ${info.label}`;

  const label1 = document.getElementById('readout-label-1');
  const label2 = document.getElementById('readout-label-2');
  if (info.kind === 'geografico') {
    label1.textContent = 'LAT';
    label2.textContent = 'LON';
  } else {
    label1.textContent = 'NORTE (Y)';
    label2.textContent = 'ESTE (X)';
  }
}
updateReadoutHeader();

displaySelect.addEventListener('change', (e) => {
  currentDisplayEpsg = e.target.value;
  refreshDisplaySelect();
  updateReadoutHeader();
});

// ---- Lectura de coordenadas del cursor ------------------------------
map.on('mousemove', (e) => {
  const { lat, lng } = e.latlng;
  const info = getCrsInfo(currentDisplayEpsg);
  const { x, y } = convertFromWGS84(lat, lng, currentDisplayEpsg);

  const value1 = document.getElementById('readout-value-1');
  const value2 = document.getElementById('readout-value-2');

  if (info.kind === 'geografico') {
    value1.textContent = formatCoordValue(y, info.kind); // lat
    value2.textContent = formatCoordValue(x, info.kind); // lon
  } else {
    value1.textContent = formatCoordValue(y, info.kind); // norte
    value2.textContent = formatCoordValue(x, info.kind); // este
  }
});

// ---- Carga de archivos -----------------------------------------------
const fileInput = document.getElementById('file-input');
const filedropLabel = document.getElementById('filedrop-label');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  filedropLabel.textContent = file.name;
  handleFileSelected(file, map);
});

document.getElementById('crs-detect-confirm').addEventListener('click', () => {
  confirmPendingLayer(map);
});
