/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga instituciones educativas desde 3 fuentes de Supabase:
 *  - instituciones_educativas: directorio oficial de la Alcaldía
 *  - capa1_colegios_geojson: colegios básicos descargados con QuickOSM
 *  - capa2_colegios_detalle_geojson: colegios con más datos de QuickOSM
 * Cada categoría se dibuja con su color y tiene su propio checkbox.
 *
 * Las instituciones de OSM que ya existen en el directorio oficial
 * se filtran para no mostrar el punto duplicado dos veces.
 *
 * Además, carga el límite administrativo de Sabaneta (Capa 4, un
 * polígono, no un punto) como una capa de contexto aparte.
 * ------------------------------------------------------------------
 */

const CATEGORIAS_INSTITUCIONES = [
  { key: 'colegio-publico',      label: 'Colegios públicos',                color: '#3b82f6', source: 'oficial', tipo: 'colegio',     sector: 'publico' },
  { key: 'colegio-privado',      label: 'Colegios privados',                color: '#f97316', source: 'oficial', tipo: 'colegio',     sector: 'privado' },
  { key: 'universidad-publico',  label: 'Universidades públicas',           color: '#22c55e', source: 'oficial', tipo: 'universidad', sector: 'publico', sinDatos: true },
  { key: 'universidad-privado',  label: 'Universidades privadas',           color: '#a855f7', source: 'oficial', tipo: 'universidad', sector: 'privado' },
  { key: 'osm-colegios-basico',  label: 'Colegios (OSM · consulta básica)', color: '#eab308', source: 'capa1' },
  { key: 'osm-colegios-detalle', label: 'Colegios (OSM · consulta detallada)', color: '#06b6d4', source: 'capa2' },
];

const institucionesLayers = {};
let limiteSabanetaLayer = null;

function categoriaKeyDe(props) {
  return `${props.tipo}-${props.sector}`;
}

function normalizarNombre(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(i\.?e\.?|institucion educativa|colegio|instituto|gimnasio)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['de', 'la', 'el', 'los', 'las', 'del'].includes(w));
}

function esDuplicado(nombreA, nombreB) {
  const tokensA = normalizarNombre(nombreA);
  const tokensB = normalizarNombre(nombreB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const setA = new Set(tokensA);
  const comunes = tokensB.filter((t) => setA.has(t));
  const minLen = Math.min(tokensA.length, tokensB.length);
  return comunes.length / minLen >= 0.6;
}

function quitarDuplicados(features, nombresOficiales) {
  return features.filter(
    (f) => !nombresOficiales.some((nombreOficial) => esDuplicado(f.properties.nombre, nombreOficial))
  );
}

function popupInstitucion(props, categoria) {
  const estrato = (props.estrato === null || props.estrato === undefined) ? 'No disponible' : props.estrato;
  const sectorTexto = props.sector ? props.sector : 'No especificado (OSM)';

  const imagenHtml = props.imagen_url
    ? `<img src="${props.imagen_url}" alt="${props.nombre}"
         style="display:block;width:100%;max-width:200px;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:1px solid #223049;"
         onerror="this.style.display='none'" />`
    : '';

  return (
    `<div class="institucion-popup">`
    + imagenHtml
    + `<strong>${props.nombre}</strong><br/>`
    + `<span class="institucion-popup__categoria">${categoria ? categoria.label : ''}</span><br/>`
    + `<span>${props.direccion || 'Sin dirección registrada'}</span><br/>`
    + `<span>Sector: ${sectorTexto}</span><br/>`
    + `<span>Estrato: ${estrato}</span>`
    + `</div>`
  );
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  if (!list) return;
  list.innerHTML = '';

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    const li = document.createElement('li');
    if (cat.sinDatos) {
      li.className = 'category-item category-item--empty';
      li.innerHTML = `
        <span class="category-swatch category-swatch--muted" style="background:${cat.color}"></span>
        <span class="category-note">${cat.label}: no hay ninguna en Sabaneta</span>
      `;
    } else {
      li.className = 'category-item';
      li.innerHTML = `
        <label class="category-toggle">
          <input type="checkbox" data-category="${cat.key}" checked />
          <span class="category-swatch" style="background:${cat.color}"></span>
          <span class="category-toggle__label">${cat.label}</span>
          <span class="category-count" id="count-${cat.key}">0</span>
        </label>
      `;
    }
    list.appendChild(li);
  });

  // Fila extra para el límite municipal (Capa 4), dentro de la misma lista
  const liLimite = document.createElement('li');
  liLimite.className = 'category-item';
  liLimite.innerHTML = `
    <label class="category-toggle">
      <input type="checkbox" id="toggle-limite-sabaneta" checked />
      <span class="category-swatch" style="background:#29e2b8"></span>
      <span class="category-toggle__label">Límite municipal de Sabaneta</span>
    </label>
  `;
  list.appendChild(liLimite);
}

function filaAFeature(row) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [row.longitud, row.latitud] },
    properties: {
      nombre: row.nombre,
      tipo: row.tipo,
      sector: row.sector,
      direccion: row.direccion,
      estrato: row.estrato,
      imagen_url: row.imagen_url,
    },
  };
}

async function fetchFeatures(tableName) {
  const { data, error } = await supabaseClient.from(tableName).select('*');
  if (error) {
    console.error(`Error cargando ${tableName}:`, error);
    return [];
  }
  return data
    .filter((row) => row.longitud !== null && row.latitud !== null && row.longitud !== undefined)
    .map(filaAFeature);
}

/** Carga el polígono del límite municipal (Capa 4) y su checkbox. */
async function initLimiteMunicipal(map) {
  const { data, error } = await supabaseClient.from('capa4_limite_sabaneta_geojson').select('*');
  if (error) {
    console.error('Error cargando el límite municipal (Capa 4):', error);
    return;
  }
  if (!data || data.length === 0) return;

  const geometry = JSON.parse(data[0].geojson);
  const feature = {
    type: 'Feature',
    properties: { nombre: data[0].nombre, divipola: data[0].divipola },
    geometry,
  };

  limiteSabanetaLayer = L.geoJSON(feature, {
    style: { color: '#29e2b8', weight: 2, dashArray: '6 4', fill: false },
  }).bindPopup(`<strong>${data[0].nombre}</strong><br/>DIVIPOLA: ${data[0].divipola}`);

  limiteSabanetaLayer.addTo(map);

  const checkbox = document.getElementById('toggle-limite-sabaneta');
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        limiteSabanetaLayer.addTo(map);
      } else {
        map.removeLayer(limiteSabanetaLayer);
      }
    });
  }
}

async function initInstitucionesLayer(map) {
  renderCategoryList();

  const totalEl = document.getElementById('instituciones-total');
  if (!supabaseClient) {
    console.warn('Supabase no está configurado (ver js/supabaseClient.js).');
    if (totalEl) totalEl.textContent = 'Supabase no configurado';
    return;
  }

  const [featuresOficial, featuresCapa1Raw, featuresCapa2Raw] = await Promise.all([
    fetchFeatures('instituciones_educativas'),
    fetchFeatures('capa1_colegios_geojson'),
    fetchFeatures('capa2_colegios_detalle_geojson'),
  ]);

  const nombresOficiales = featuresOficial.map((f) => f.properties.nombre);
  const featuresCapa1 = quitarDuplicados(featuresCapa1Raw, nombresOficiales);
  const featuresCapa2 = quitarDuplicados(featuresCapa2Raw, nombresOficiales);

  let totalGeneral = 0;

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    let featuresCategoria;
    if (cat.source === 'oficial') {
      featuresCategoria = featuresOficial.filter((f) => categoriaKeyDe(f.properties) === cat.key);
    } else if (cat.source === 'capa1') {
      featuresCategoria = featuresCapa1;
    } else if (cat.source === 'capa2') {
      featuresCategoria = featuresCapa2;
    } else {
      featuresCategoria = [];
    }

    const layer = L.geoJSON(
      { type: 'FeatureCollection', features: featuresCategoria },
      {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          radius: 7,
          color: '#0b1220',
          weight: 1,
          fillColor: cat.color,
          fillOpacity: 0.9,
        }).bindPopup(popupInstitucion(feature.properties, cat)),
      }
    );

    institucionesLayers[cat.key] = layer;
    layer.addTo(map);
    totalGeneral += featuresCategoria.length;

    const countEl = document.getElementById(`count-${cat.key}`);
    if (countEl) countEl.textContent = featuresCategoria.length;

    const checkbox = document.querySelector(`input[data-category="${cat.key}"]`);
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          layer.addTo(map);
        } else {
          map.removeLayer(layer);
        }
      });
    }
  });

  if (totalEl) totalEl.textContent = `${totalGeneral} instituciones`;

  // Capa 4: límite municipal (no es una institución, se carga aparte)
  initLimiteMunicipal(map);
}