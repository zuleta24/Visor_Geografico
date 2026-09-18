/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga instituciones educativas desde fuentes de Supabase y OpenStreetMap.
 * Gestiona las capas del mapa, filtros de duplicados y renderizado del panel.
 * ------------------------------------------------------------------
 */

// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================
const CATEGORIAS_INSTITUCIONES = [
  { key: 'colegio-publico',      label: 'Colegios públicos',                 color: '#3b82f6', source: 'oficial', tipo: 'colegio',     sector: 'publico' },
  { key: 'colegio-privado',      label: 'Colegios privados',                 color: '#f97316', source: 'oficial', tipo: 'colegio',     sector: 'privado' },
  { key: 'universidad-privado',  label: 'Universidades privadas',            color: '#a855f7', source: 'oficial', tipo: 'universidad', sector: 'privado' },
  { key: 'osm-colegios-basico',  label: 'Colegios (OSM · consulta básica)',  color: '#eab308', source: 'capa1' },
];

const ESTILO_LIMITE_SABANETA = { 
  color: '#29e2b8', 
  weight: 4, 
  dashArray: '6 4', 
  fill: true,           
  fillColor: '#29e2b8', 
  fillOpacity: 0.20    // Transparencia: 0.0 es invisible, 1.0 es sólido. 0.15 es ideal para no tapar el mapa base
};

// ==========================================
// 2. ESTADO GLOBAL
// ==========================================
const institucionesLayers = {};
let limiteSabanetaLayer = null;

// ==========================================
// 3. UTILIDADES Y PROCESAMIENTO DE DATOS
// ==========================================
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
  
  return (comunes.length / minLen) >= 0.6;
}

function quitarDuplicados(features, nombresOficiales) {
  return features.filter(
    (f) => !nombresOficiales.some((nombreOficial) => esDuplicado(f.properties.nombre, nombreOficial))
  );
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

// ==========================================
// 4. RENDERIZADO DE INTERFAZ (UI)
// ==========================================
function construirHtmlPopup(props, categoria) {
  const estrato = props.estrato ?? 'No disponible';
  const sectorTexto = props.sector ?? 'No especificado (OSM)';
  const labelCategoria = categoria ? categoria.label : '';
  
  const imagenHtml = props.imagen_url
    ? `<img src="${props.imagen_url}" alt="${props.nombre}" 
            style="display:block;width:100%;max-width:200px;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:1px solid #223049;" 
            onerror="this.style.display='none'" />`
    : '';

  return `
    <div class="institucion-popup">
      ${imagenHtml}
      <strong>${props.nombre}</strong><br/>
      <span class="institucion-popup__categoria">${labelCategoria}</span><br/>
      <span>${props.direccion || 'Sin dirección registrada'}</span><br/>
      <span>Sector: ${sectorTexto}</span><br/>
      <span>Estrato: ${estrato}</span>
    </div>
  `;
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  if (!list) return;
  
  list.innerHTML = '';

  // Renderizar categorías de instituciones
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

  // Renderizar control para el límite municipal
  const liLimite = document.createElement('li');
  liLimite.className = 'category-item';
  liLimite.innerHTML = `
    <label class="category-toggle">
      <input type="checkbox" id="toggle-limite-sabaneta" checked />
      <span class="category-swatch" style="background:${ESTILO_LIMITE_SABANETA.color}"></span>
      <span class="category-toggle__label">Límite municipal de Sabaneta</span>
    </label>
  `;
  list.appendChild(liLimite);
}

// ==========================================
// 5. SERVICIOS DE DATOS (SUPABASE)
// ==========================================
async function fetchFeatures(tableName) {
  const { data, error } = await supabaseClient.from(tableName).select('*');
  
  if (error) {
    console.error(`Error cargando ${tableName}:`, error);
    return [];
  }
  
  return data
    .filter((row) => row.longitud != null && row.latitud != null)
    .map(filaAFeature);
}

// ==========================================
// 6. GESTIÓN DE MAPAS (LEAFLET)
// ==========================================
function crearCapaInstitucion(featuresCategoria, cat, map) {
  const layer = L.geoJSON(
    { type: 'FeatureCollection', features: featuresCategoria },
    {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 7,
        color: '#0b1220',
        weight: 1,
        fillColor: cat.color,
        fillOpacity: 0.9,
      }).bindPopup(construirHtmlPopup(feature.properties, cat)),
    }
  );

  institucionesLayers[cat.key] = layer;
  layer.addTo(map);

  // Actualizar conteo en la UI
  const countEl = document.getElementById(`count-${cat.key}`);
  if (countEl) countEl.textContent = featuresCategoria.length;

  // Lógica del checkbox
  const checkbox = document.querySelector(`input[data-category="${cat.key}"]`);
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      checkbox.checked ? layer.addTo(map) : map.removeLayer(layer);
    });
  }
  
  return featuresCategoria.length;
}

async function initLimiteMunicipal(map) {
  const { data, error } = await supabaseClient.from('capa4_limite_sabaneta_geojson').select('*');
  
  if (error || !data || data.length === 0) {
    console.error('Error o datos vacíos cargando el límite municipal (Capa 4):', error);
    return;
  }

  const geometry = JSON.parse(data[0].geojson);
  const feature = {
    type: 'Feature',
    properties: { nombre: data[0].nombre, divipola: data[0].divipola },
    geometry,
  };

  limiteSabanetaLayer = L.geoJSON(feature, { style: ESTILO_LIMITE_SABANETA })
    .bindPopup(`<strong>${data[0].nombre}</strong><br/>DIVIPOLA: ${data[0].divipola}`);

  limiteSabanetaLayer.addTo(map);

  const checkbox = document.getElementById('toggle-limite-sabaneta');
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      checkbox.checked ? limiteSabanetaLayer.addTo(map) : map.removeLayer(limiteSabanetaLayer);
    });
  }
}

// ==========================================
// 7. INICIALIZACIÓN PRINCIPAL
// ==========================================
async function initInstitucionesLayer(map) {
  renderCategoryList();

  const totalEl = document.getElementById('instituciones-total');
  
  if (!supabaseClient) {
    console.warn('Supabase no está configurado (ver js/supabaseClient.js).');
    if (totalEl) totalEl.textContent = 'Supabase no configurado';
    return;
  }

  // Carga paralela de todas las capas
  const [featuresOficial, featuresCapa1Raw, featuresCapa2Raw] = await Promise.all([
    fetchFeatures('instituciones_educativas'),
    fetchFeatures('capa1_colegios_geojson'),
    fetchFeatures('capa2_colegios_detalle_geojson'),
  ]);

  // Filtrado de duplicados
  const nombresOficiales = featuresOficial.map((f) => f.properties.nombre);
  const featuresCapa1 = quitarDuplicados(featuresCapa1Raw, nombresOficiales);
  const featuresCapa2 = quitarDuplicados(featuresCapa2Raw, nombresOficiales);

  let totalGeneral = 0;

  // Renderizado por categoría
  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    let featuresCategoria = [];
    
    if (cat.source === 'oficial') {
      featuresCategoria = featuresOficial.filter((f) => categoriaKeyDe(f.properties) === cat.key);
    } else if (cat.source === 'capa1') {
      featuresCategoria = featuresCapa1;
    } else if (cat.source === 'capa2') {
      featuresCategoria = featuresCapa2;
    }

    totalGeneral += crearCapaInstitucion(featuresCategoria, cat, map);
  });

  if (totalEl) totalEl.textContent = `${totalGeneral} instituciones`;

  // Cargar límite municipal
  await initLimiteMunicipal(map);
}