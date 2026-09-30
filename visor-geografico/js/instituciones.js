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

// Registro id -> { props, categoria }, para que el modal de detalle
// pueda recuperar la institución sin recorrer el mapa de nuevo.
const institucionesIndex = {};
let institucionesContador = 0;

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
      // Opcionales para el modal de detalle: si la fila no los tiene,
      // simplemente quedan undefined y esa fila no se muestra.
      telefono: row.telefono,
      sitio_web: row.sitio_web,
      horario: row.horario,
      descripcion: row.descripcion,
      // Indicadores académicos (opcionales).
      num_estudiantes: row.num_estudiantes,
      cupos_disponibles: row.cupos_disponibles,
      recursos_tecnologicos: row.recursos_tecnologicos,
      num_docentes: row.num_docentes,
    },
  };
}

// ==========================================
// 4. RENDERIZADO DE INTERFAZ (UI)
// ==========================================
function construirHtmlPopup(props, categoria, id) {
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
      <span>Estrato: ${estrato}</span><br/>
      <a href="javascript:void(0)" class="institucion-popup__link" data-institucion-id="${id}">Detalles de la institución →</a>
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

/**
 * Crea (una sola vez) el contenedor del modal de detalle y lo agrega al
 * final del <body>. No requiere tocar index.html.
 */
function asegurarModalInstitucion() {
  if (document.getElementById('institucion-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'institucion-modal';
  modal.className = 'institucion-modal';
  modal.innerHTML = `
    <div class="institucion-modal__backdrop" data-cerrar-modal></div>
    <div class="institucion-modal__panel" role="dialog" aria-modal="true">
      <button type="button" class="institucion-modal__close" data-cerrar-modal aria-label="Cerrar">&times;</button>
      <div class="institucion-modal__body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target.dataset.cerrarModal !== undefined) cerrarModalInstitucion();
  });
}

function cerrarModalInstitucion() {
  const modal = document.getElementById('institucion-modal');
  if (modal) modal.classList.remove('institucion-modal--open');
}

/**
 * Llena el modal con la información de la institución "id" y lo muestra.
 * Los campos opcionales (telefono, sitio_web, horario, descripcion) solo
 * aparecen si existen en la fila de Supabase; si no, se omiten.
 */
function abrirDetalleInstitucion(id) {
  const entry = institucionesIndex[id];
  if (!entry) return;

  const { props, categoria } = entry;
  asegurarModalInstitucion();

  const estrato = props.estrato ?? 'No disponible';
  const sectorTexto = props.sector ?? 'No especificado (OSM)';

  const imagenHtml = props.imagen_url
    ? `<img src="${props.imagen_url}" alt="${props.nombre}" class="institucion-modal__img"
         onerror="this.style.display='none'" />`
    : '';

  const filasExtra = [
    props.telefono ? ['Teléfono', props.telefono] : null,
    props.sitio_web ? ['Sitio web', `<a href="${props.sitio_web}" target="_blank" rel="noopener">${props.sitio_web}</a>`] : null,
    props.horario ? ['Horario', props.horario] : null,
  ].filter(Boolean);

  const descripcionHtml = props.descripcion
    ? `<p class="institucion-modal__descripcion">${props.descripcion}</p>`
    : '';

  // Indicadores académicos: solo se muestran los que tienen valor.
  const indicadores = [
    (props.num_estudiantes !== null && props.num_estudiantes !== undefined)
      ? { label: 'Estudiantes', valor: props.num_estudiantes }
      : null,
    (props.cupos_disponibles !== null && props.cupos_disponibles !== undefined)
      ? { label: 'Cupos disponibles', valor: props.cupos_disponibles }
      : null,
    (props.recursos_tecnologicos !== null && props.recursos_tecnologicos !== undefined)
      ? { label: 'Recursos tecnológicos', valor: props.recursos_tecnologicos }
      : null,
    (props.num_docentes !== null && props.num_docentes !== undefined)
      ? { label: 'Docentes', valor: props.num_docentes }
      : null,
  ].filter(Boolean);

  const indicadoresHtml = indicadores.length
    ? `<div class="institucion-modal__stats">`
      + indicadores.map((i) => (
        `<div class="institucion-modal__stat">`
        + `<span class="institucion-modal__stat-valor">${i.valor}</span>`
        + `<span class="institucion-modal__stat-label">${i.label}</span>`
        + `</div>`
      )).join('')
      + `</div>`
    : '';

  const body = document.querySelector('#institucion-modal .institucion-modal__body');
  body.innerHTML = (
    imagenHtml
    + `<h3 class="institucion-modal__nombre">${props.nombre}</h3>`
    + `<span class="institucion-modal__categoria">${categoria ? categoria.label : ''}</span>`
    + indicadoresHtml
    + `<dl class="institucion-modal__datos">`
    + `<dt>Dirección</dt><dd>${props.direccion || 'Sin dirección registrada'}</dd>`
    + `<dt>Sector</dt><dd>${sectorTexto}</dd>`
    + `<dt>Estrato</dt><dd>${estrato}</dd>`
    + filasExtra.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
    + `</dl>`
    + descripcionHtml
  );

  document.getElementById('institucion-modal').classList.add('institucion-modal--open');
}

// Delegación de eventos: el enlace vive dentro de un popup de Leaflet que
// se crea y se destruye dinámicamente, así que se escucha en document.
document.addEventListener('click', (e) => {
  const link = e.target.closest('.institucion-popup__link');
  if (link) abrirDetalleInstitucion(link.dataset.institucionId);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModalInstitucion();
});

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
      pointToLayer: (feature, latlng) => {
        const id = `institucion-${institucionesContador++}`;
        institucionesIndex[id] = { props: feature.properties, categoria: cat };

        return L.circleMarker(latlng, {
          radius: 7,
          color: '#0b1220',
          weight: 1,
          fillColor: cat.color,
          fillOpacity: 0.9,
        }).bindPopup(construirHtmlPopup(feature.properties, cat, id));
      },
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