/**
 * viviendas.js
 * ------------------------------------------------------------------
 * Viviendas priorizadas cerca de colegios:
 *   - Puntos (vector tiles .pbf), coloreados por prioridad.
 *   - Zona de influencia (buffer) interactiva desde el GeoJSON, con un
 *     popup que muestra TODOS los campos que traiga cada vivienda.
 *   - Contador (badge) y filtros por prioridad en el panel izquierdo.
 *
 * Si el GeoJSON trae polígonos (el buffer ya calculado en QGIS), se
 * dibujan tal cual. Si trae puntos, se dibuja un círculo en METROS
 * (crece y decrece con el zoom), usando el campo de radio si existe o
 * BUFFER_POR_DEFECTO_M si no.
 * ------------------------------------------------------------------
 */

(function () {
'use strict';

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const URL_VIVIENDAS_GEOJSON = 'data/viviendas_priorizadas_colegios.geojson';
const URL_VIVIENDAS_TILES = 'tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf';

const COLORES_PRIORIDAD = { alta: '#ef4444', media: '#f97316', baja: '#eab308' };
const COLOR_SIN_PRIORIDAD = '#ef4444';
const SIN_PRIORIDAD = 'sin prioridad';

// Radio del buffer (en metros) cuando la vivienda es un punto y no trae campo de radio.
// AJÚSTALO al valor real del buffer que calculaste en QGIS.
const BUFFER_POR_DEFECTO_M = 100;

// Nombres posibles de cada campo (se usa el primero que exista con valor).
const CAMPOS_COLEGIO = ['colegio_nombre', 'colegio', 'nombre_colegio', 'institucion', 'nombre'];
const CAMPOS_DISTANCIA = ['distancia_metros', 'distancia_m', 'distancia', 'dist_m', 'dist'];
const CAMPOS_BUFFER = ['buffer_m', 'radio_m', 'radio_influencia', 'buffer', 'radio'];

// Campos técnicos que no tiene sentido mostrar en el popup.
const CAMPOS_OCULTOS = new Set(['id', 'fid', 'gid', 'geom', 'geometry', 'created_at', 'updated_at']);

// Etiquetas amigables para campos conocidos; los demás se generan a partir del nombre.
const ETIQUETAS = {
  predio: 'Predio',
  barrio: 'Barrio',
  tipo: 'Tipo',
  sector: 'Sector',
  total_edificios: 'Edificios',
  total_unidades_prediales: 'Unidades prediales',
  area_m2: 'Área',
};

// ==========================================
// 2. ESTADO
// ==========================================
let viviendasTiles = null;
let viviendasBuffer = null;
let viviendasData = null;            // GeoJSON completo
let prioridadesVisibles = null;      // null = todas visibles (antes de cargar datos)

// ==========================================
// 3. UTILIDADES
// ==========================================
function esc(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buscarCampo(props, candidatos) {
  for (const clave of candidatos) {
    const valor = props[clave];
    if (valor !== null && valor !== undefined && valor !== '') return { clave, valor };
  }
  return null;
}

function prioridadDe(props) {
  const texto = String((props && props.prioridad) ?? '').trim().toLowerCase();
  return texto || SIN_PRIORIDAD;
}

function colorDe(props) {
  return COLORES_PRIORIDAD[prioridadDe(props)] || COLOR_SIN_PRIORIDAD;
}

function etiqueta(clave) {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave];
  const texto = clave.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function conUnidad(valor, unidad) {
  const n = Number(valor);
  return Number.isFinite(n)
    ? `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} ${unidad}`
    : esc(valor);
}

function formatearValor(clave, valor) {
  if (typeof valor === 'number') {
    const n = valor.toLocaleString('es-CO', { maximumFractionDigits: 2 });
    if (/area/i.test(clave)) return `${n} m²`;
    if (/dist|buffer|radio/i.test(clave)) return `${n} m`;
    return n;
  }
  return esc(valor);
}

function radioBuffer(props) {
  const campo = buscarCampo(props, CAMPOS_BUFFER);
  const n = campo ? Number(campo.valor) : NaN;
  return Number.isFinite(n) && n > 0 ? n : BUFFER_POR_DEFECTO_M;
}

// ==========================================
// 4. POPUP
// ==========================================
function popupVivienda(p) {
  const usados = new Set(['prioridad']);
  const marcar = (campo) => { if (campo) usados.add(campo.clave); return campo; };

  const colegio = marcar(buscarCampo(p, CAMPOS_COLEGIO));
  const distancia = marcar(buscarCampo(p, CAMPOS_DISTANCIA));
  const buffer = marcar(buscarCampo(p, CAMPOS_BUFFER));
  const predio = marcar(buscarCampo(p, ['predio']));
  const barrio = marcar(buscarCampo(p, ['barrio']));
  const prioridad = prioridadDe(p);

  // Primero los datos destacados, luego todo lo demás que traiga la fila.
  const filas = [];
  if (colegio) filas.push(['Colegio cercano', esc(colegio.valor)]);
  if (distancia) filas.push(['Distancia al colegio', conUnidad(distancia.valor, 'm')]);
  if (buffer) filas.push(['Zona de influencia', conUnidad(buffer.valor, 'm')]);

  Object.entries(p).forEach(([clave, valor]) => {
    if (usados.has(clave) || CAMPOS_OCULTOS.has(clave.toLowerCase())) return;
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'object') return;
    filas.push([etiqueta(clave), formatearValor(clave, valor)]);
  });

  const tabla = filas.length
    ? `<table class="vivienda-popup__tabla">${filas
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`)
        .join('')}</table>`
    : '<p class="vivienda-popup__sub">Sin más datos registrados.</p>';

  const badge = prioridad !== SIN_PRIORIDAD
    ? `<span class="vivienda-popup__prio" style="--prio-color:${colorDe(p)}">Prioridad ${esc(prioridad)}</span>`
    : '';

  return `
    <div class="vivienda-popup">
      <h4 class="vivienda-popup__titulo">${predio ? `Predio ${esc(predio.valor)}` : 'Vivienda priorizada'}</h4>
      ${barrio ? `<p class="vivienda-popup__sub">${esc(barrio.valor)}</p>` : ''}
      ${badge}
      ${tabla}
    </div>
  `;
}

// ==========================================
// 5. CAPAS
// ==========================================
function crearTiles() {
  return L.vectorGrid.protobuf(URL_VIVIENDAS_TILES, {
    rendererFactory: L.canvas.tile,
    interactive: false,
    maxNativeZoom: 17,
    vectorTileLayerStyles: {
      viviendas: function (properties) {
        const prio = prioridadDe(properties);
        // Si el usuario apagó esta prioridad en los filtros, el punto no se dibuja.
        if (prioridadesVisibles && !prioridadesVisibles.has(prio)) {
          return { radius: 0, fill: false, stroke: false };
        }
        return {
          radius: 6,
          fillColor: COLORES_PRIORIDAD[prio] || '#f97316',
          color: '#ffffff',
          weight: 1.5,
          fillOpacity: 0.9,
          fill: true,
        };
      },
    },
  });
}

function estiloZona(props) {
  const color = colorDe(props);
  return {
    color,
    weight: 2,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: 0.25,
    // Va aquí también porque Leaflet reaplica el estilo al crear el círculo
    // y, sin radio, un L.circle dentro de L.geoJSON puede perder su tamaño.
    radius: radioBuffer(props),
  };
}

function construirBuffer() {
  return L.geoJSON(viviendasData, {
    filter: (feature) => !prioridadesVisibles || prioridadesVisibles.has(prioridadDe(feature.properties)),
    style: (feature) => estiloZona(feature.properties),
    pointToLayer: (feature, latlng) => L.circle(latlng, {
      ...estiloZona(feature.properties),
      pane: 'viviendasPane',
    }),
    onEachFeature: (feature, capa) => {
      capa.bindPopup(popupVivienda(feature.properties || {}), { maxWidth: 280, minWidth: 220 });
      capa.on('mouseover', () => capa.setStyle({ fillOpacity: 0.5 }));
      capa.on('mouseout', () => capa.setStyle({ fillOpacity: 0.25 }));
    },
    pane: 'viviendasPane',
  });
}

function refrescarViviendas(map) {
  const visible = document.getElementById('toggle-viviendas')?.checked;

  if (viviendasBuffer) map.removeLayer(viviendasBuffer);
  viviendasBuffer = construirBuffer();
  if (visible) viviendasBuffer.addTo(map);

  if (viviendasTiles) viviendasTiles.redraw();
}

// ==========================================
// 6. PANEL IZQUIERDO (checkbox, badge y filtros)
// ==========================================
function crearControlViviendas(map) {
  const list = document.getElementById('category-list');
  if (!list) return;

  const li = document.createElement('li');
  li.className = 'category-item';
  li.innerHTML = `
    <label class="category-toggle">
      <input type="checkbox" id="toggle-viviendas" checked />
      <span class="category-swatch" style="background:${COLOR_SIN_PRIORIDAD}"></span>
      <span class="category-toggle__label">Viviendas priorizadas</span>
      <span class="category-count" id="count-viviendas">…</span>
    </label>
    <div class="vivienda-filtros" id="vivienda-filtros" hidden></div>
  `;
  list.appendChild(li);

  document.getElementById('toggle-viviendas').addEventListener('change', (e) => {
    if (e.target.checked) {
      if (viviendasTiles) map.addLayer(viviendasTiles);
      if (viviendasBuffer) map.addLayer(viviendasBuffer);
    } else {
      if (viviendasTiles) map.removeLayer(viviendasTiles);
      if (viviendasBuffer) map.removeLayer(viviendasBuffer);
    }
  });
}

function construirFiltrosPrioridad(map, features) {
  const contenedor = document.getElementById('vivienda-filtros');
  if (!contenedor) return;

  const conteo = {};
  features.forEach((f) => {
    const prio = prioridadDe(f.properties);
    conteo[prio] = (conteo[prio] || 0) + 1;
  });

  // Si ninguna vivienda trae prioridad, los filtros no aportan nada.
  const claves = Object.keys(conteo);
  if (claves.length === 1 && conteo[SIN_PRIORIDAD]) return;

  const orden = ['alta', 'media', 'baja'];
  claves.sort((a, b) => {
    const ia = orden.indexOf(a); const ib = orden.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  prioridadesVisibles = new Set(claves);

  contenedor.innerHTML = claves.map((clave) => `
    <label class="vivienda-chip" style="--chip-color:${COLORES_PRIORIDAD[clave] || COLOR_SIN_PRIORIDAD}">
      <input type="checkbox" data-prioridad="${esc(clave)}" checked />
      <span class="vivienda-chip__dot"></span>
      ${esc(clave.charAt(0).toUpperCase() + clave.slice(1))}
      <b>${conteo[clave]}</b>
    </label>
  `).join('');
  contenedor.hidden = false;

  contenedor.addEventListener('change', (e) => {
    const clave = e.target.dataset.prioridad;
    if (!clave) return;
    if (e.target.checked) prioridadesVisibles.add(clave);
    else prioridadesVisibles.delete(clave);
    refrescarViviendas(map);
  });
}

// ==========================================
// 7. INICIALIZACIÓN
// ==========================================
function initViviendasPriorizadas(map) {
  // Pane propio: por encima de las capas normales (400) y los marcadores (600),
  // pero por debajo de los popups (700).
  if (!map.getPane('viviendasPane')) {
    map.createPane('viviendasPane');
    map.getPane('viviendasPane').style.zIndex = 650;
    map.getPane('viviendasPane').style.pointerEvents = 'auto';
  }

  crearControlViviendas(map);

  viviendasTiles = crearTiles();
  viviendasTiles.addTo(map);

  fetch(URL_VIVIENDAS_GEOJSON)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} al cargar ${URL_VIVIENDAS_GEOJSON}`);
      return response.json();
    })
    .then((data) => {
      viviendasData = data;
      const features = data.features || [];

      // Diagnóstico: muestra en consola con qué campos viene realmente la capa.
      console.log(`Viviendas priorizadas: ${features.length} registros.`);
      if (features[0]) console.log('Campos disponibles:', Object.keys(features[0].properties || {}), features[0].properties);

      const badge = document.getElementById('count-viviendas');
      if (badge) badge.textContent = features.length;

      construirFiltrosPrioridad(map, features);
      refrescarViviendas(map);
    })
    .catch((error) => {
      console.error('Error cargando viviendas priorizadas:', error);
      const badge = document.getElementById('count-viviendas');
      if (badge) badge.textContent = '!';
    });
}

// Única función pública: la llama main.js
window.initViviendasPriorizadas = initViviendasPriorizadas;
})();