/**
 * crs.js
 * ------------------------------------------------------------------
 * Tabla central de sistemas de referencia / coordenadas usados en el
 * proyecto y definiciones proj4 necesarias para convertir entre ellos.
 *
 * IMPORTANTE:
 * - Leaflet siempre trabaja internamente en WGS84 (EPSG:4326) para las
 *   coordenadas de sus objetos (marcadores, geometrías, mapa base).
 *   Por eso NO reproyectamos el mapa en sí: solo convertimos los
 *   valores numéricos que se MUESTRAN al usuario (lectura del cursor,
 *   atributos de capas, etc.) usando proj4js.
 * - Los parámetros de MAGNA-SIRGAS / Origen Nacional (EPSG:9377) y de
 *   MAGNA-SIRGAS / Bogotá (EPSG:3116) fueron tomados de las fichas
 *   oficiales EPSG (epsg.io) y de las resoluciones IGAC.
 * ------------------------------------------------------------------
 */

// ---- 1. Definiciones proj4 --------------------------------------
proj4.defs([
  // WGS84 geográfico (el estándar universal, usado por GPS)
  ['EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs'],

  // MAGNA-SIRGAS geográfico: datum oficial de Colombia.
  // A nivel de +/-1m es equivalente a WGS84 (según ficha EPSG 4686),
  // suficiente para un visor educativo; para trabajos catastrales de
  // alta precisión se debe usar la transformación oficial IGAC.
  ['EPSG:4686', '+proj=longlat +ellps=GRS80 +no_defs'],

  // MAGNA-SIRGAS / Colombia Bogotá zone (el "origen Bogotá" clásico,
  // usado antes de 2020). Central meridian ≈ -74°04'39" (meridiano de Bogotá).
  ['EPSG:3116', '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +units=m +no_defs'],

  // MAGNA-SIRGAS 2018 / Origen-Nacional (alias CTM12). Sistema único
  // oficial desde la Resolución IGAC 371 de 2020 / 370 de 2021.
  ['EPSG:9377', '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs'],

  // WGS84 UTM — Colombia continental cae en las zonas 17N, 18N y 19N
  ['EPSG:32617', '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs'],
  ['EPSG:32618', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs'],
  ['EPSG:32619', '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs'],
]);

// ---- 2. Catálogo de sistemas disponibles en la interfaz ----------
// "kind" determina cómo se etiquetan y formatean los valores:
//   'geografico'  -> se muestran como LAT / LON en grados
//   'proyectado'  -> se muestran como ESTE (X) / NORTE (Y) en metros
const CRS_CATALOG = [
  { epsg: 'EPSG:4326',  label: 'WGS84 (Geográfico)',                 kind: 'geografico' },
  { epsg: 'EPSG:4686',  label: 'MAGNA-SIRGAS (Geográfico)',           kind: 'geografico' },
  { epsg: 'EPSG:3116',  label: 'MAGNA-SIRGAS / Bogotá (Origen único, pre-2020)', kind: 'proyectado' },
  { epsg: 'EPSG:9377',  label: 'MAGNA-SIRGAS 2018 / Origen Nacional (CTM12)',    kind: 'proyectado' },
  { epsg: 'EPSG:32618', label: 'WGS84 / UTM zona 18N',                kind: 'proyectado' },
  { epsg: 'EPSG:32617', label: 'WGS84 / UTM zona 17N',                kind: 'proyectado' },
  { epsg: 'EPSG:32619', label: 'WGS84 / UTM zona 19N',                kind: 'proyectado' },
];

function getCrsInfo(epsg) {
  return CRS_CATALOG.find((c) => c.epsg === epsg);
}

/**
 * Convierte una coordenada lat/lon (WGS84, como la entrega Leaflet)
 * al sistema destino indicado.
 * @param {number} lat
 * @param {number} lon
 * @param {string} toEpsg  ej. 'EPSG:9377'
 * @returns {{x:number, y:number}}
 */
function convertFromWGS84(lat, lon, toEpsg) {
  if (toEpsg === 'EPSG:4326') return { x: lon, y: lat };
  const [x, y] = proj4('EPSG:4326', toEpsg, [lon, lat]);
  return { x, y };
}

/**
 * Convierte una coordenada de un sistema de origen arbitrario a WGS84
 * (lat/lon), que es lo único que Leaflet puede dibujar. Se usa al
 * cargar una capa que no está en WGS84.
 */
function convertToWGS84(x, y, fromEpsg) {
  if (fromEpsg === 'EPSG:4326') return { lat: y, lon: x };
  const [lon, lat] = proj4(fromEpsg, 'EPSG:4326', [x, y]);
  return { lat, lon };
}

/**
 * Rellena un <select> con el catálogo de sistemas, EXCLUYENDO el que
 * ya está activo (no tiene sentido ofrecer "cambiar a WGS84" si ya
 * se está mostrando en WGS84).
 */
function populateCrsSelect(selectEl, currentEpsg) {
  selectEl.innerHTML = '';
  CRS_CATALOG.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.epsg;
    const isCurrent = c.epsg === currentEpsg;
    opt.textContent = isCurrent
      ? `${c.label} — ${c.epsg} (en uso)`
      : `${c.label} — ${c.epsg}`;
    if (isCurrent) {
      opt.selected = true;
      opt.disabled = true;
    }
    selectEl.appendChild(opt);
  });
}

/** Formatea un número según sea grados (geográfico) o metros (proyectado). */
function formatCoordValue(value, kind) {
  return kind === 'geografico' ? value.toFixed(6) + '°' : value.toFixed(2) + ' m';
}
