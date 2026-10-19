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
  { key: 'colegio-publico',      label: 'Colegios públicos',                color: '#3b82f6', source: 'oficial', tipo: 'colegio',     sector: 'publico' },
  { key: 'colegio-privado',      label: 'Colegios privados',                color: '#f97316', source: 'oficial', tipo: 'colegio',     sector: 'privado' },
  { key: 'universidad-privado',  label: 'Universidades privadas',           color: '#a855f7', source: 'oficial', tipo: 'universidad', sector: 'privado' },
  { key: 'osm-colegios-basico',  label: 'Colegios (OSM · consulta básica)', color: '#eab308', source: 'capa1' },
];

const ESTILO_LIMITE_SABANETA = { 
  color: '#29e2b8', 
  weight: 4, 
  dashArray: '6 4', 
  fill: true,           
  fillColor: '#29e2b8', 
  fillOpacity: 0.20
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
      telefono: row.telefono,
      sitio_web: row.sitio_web,
      horario: row.horario,
      descripcion: row.descripcion,
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

/**
 * Popup rápido que aparece al hacer clic sobre el punto en Leaflet
 */
function construirHtmlPopup(props, categoria, id) {
  const estrato = props.estrato ? `Estrato ${props.estrato}` : 'Estrato N/D';
  const sectorTexto = props.sector ? `Sector ${props.sector}` : 'Sector N/D';
  const labelCategoria = categoria ? categoria.label : '';
  
  const imagenHtml = props.imagen_url
    ? `<div style="width:100%;height:100px;border-radius:6px;overflow:hidden;margin-bottom:8px;background:#0f172a;">
        <img src="${props.imagen_url}" alt="${props.nombre}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.style.display='none'" />
       </div>`
    : '';

  return `
    <div class="institucion-popup" style="max-width:220px;">
      ${imagenHtml}
      <strong style="font-size:14px;color:#fff;display:block;margin-bottom:2px;">${props.nombre}</strong>
      <span class="institucion-popup__categoria" style="font-size:11px;color:#29e2b8;display:block;margin-bottom:6px;">${labelCategoria}</span>
      <div style="font-size:12px;color:#94a3b8;line-height:1.3;margin-bottom:8px;">
        <span>${props.direccion || 'Sin dirección registrada'}</span><br/>
        <span>${sectorTexto} · ${estrato}</span>
      </div>
      <a href="javascript:void(0)" class="institucion-popup__link" data-institucion-id="${id}" style="font-size:12px;color:#29e2b8;font-weight:600;text-decoration:none;">Ver detalles completos →</a>
    </div>
  `;
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
 * Crea (una sola vez) el contenedor del modal de detalle
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
 * Llena el modal con la información estructurada y estilizada de la institución.
 */
function abrirDetalleInstitucion(id) {
  const entry = institucionesIndex[id];
  if (!entry) return;

  const { props, categoria } = entry;
  asegurarModalInstitucion();

  const nombre = props.nombre || 'Institución educativa';
  const tipo = (props.tipo || (categoria ? categoria.tipo : 'colegio')).toLowerCase();
  const sector = props.sector ? `Sector ${props.sector}` : 'Sector no especificado';
  const estrato = props.estrato ? `Estrato ${props.estrato}` : 'Estrato no especificado';
  const direccion = props.direccion || 'Dirección no registrada';
  const telefono = props.telefono || 'Sin teléfono registrado';
  const horario = props.horario || 'Horario no especificado';
  const descripcion = props.descripcion || 'Sin descripción disponible.';

  // Formato para indicadores numéricos
  const estudiantes = (props.num_estudiantes != null && props.num_estudiantes !== '') ? props.num_estudiantes : 'Por registrar';
  const cupos = (props.cupos_disponibles != null && props.cupos_disponibles !== '') ? props.cupos_disponibles : 'Por registrar';
  const recursos = (props.recursos_tecnologicos != null && props.recursos_tecnologicos !== '') ? props.recursos_tecnologicos : 'Por registrar';
  const docentes = (props.num_docentes != null && props.num_docentes !== '') ? props.num_docentes : 'Por registrar';

  // Header con imagen controlada en altura y recorte proporcional
  const headerImagen = props.imagen_url
    ? `<div class="inst-card__header">
        <img src="${props.imagen_url}" alt="${nombre}" class="inst-card__img" onerror="this.parentElement.innerHTML='<div class=\\'inst-card__placeholder\\'>📷 Imagen no disponible</div>'"/>
       </div>`
    : `<div class="inst-card__header"><div class="inst-card__placeholder">🏢 Sin imagen registrada</div></div>`;

  const sitioWebHtml = props.sitio_web
    ? `<a href="${props.sitio_web}" target="_blank" rel="noopener noreferrer" style="color:#29e2b8;word-break:break-all;">${props.sitio_web}</a>`
    : 'Sin sitio web registrado';

  const body = document.querySelector('#institucion-modal .institucion-modal__body');
  
  body.innerHTML = `
    ${headerImagen}
    <div class="inst-card__body">
      <h2 class="inst-card__title">${nombre}</h2>

      <div class="inst-card__tags">
        <span class="inst-tag inst-tag--${tipo}">${tipo}</span>
        <span class="inst-tag inst-tag--sector">${sector}</span>
        <span class="inst-tag inst-tag--sector">${estrato}</span>
      </div>

      <div class="inst-card__stats">
        <div class="inst-stat">
          <span class="inst-stat__label">Estudiantes</span>
          <span class="inst-stat__value">${estudiantes}</span>
        </div>
        <div class="inst-stat">
          <span class="inst-stat__label">Cupos disponibles</span>
          <span class="inst-stat__value">${cupos}</span>
        </div>
        <div class="inst-stat">
          <span class="inst-stat__label">Recursos tecnol.</span>
          <span class="inst-stat__value">${recursos}</span>
        </div>
        <div class="inst-stat">
          <span class="inst-stat__label">Docentes</span>
          <span class="inst-stat__value">${docentes}</span>
        </div>
      </div>

      <div class="inst-card__details">
        <div class="inst-detail-item">
          <strong>Dirección:</strong>
          <span>${direccion}</span>
        </div>
        <div class="inst-detail-item">
          <strong>Teléfono:</strong>
          <span>${telefono}</span>
        </div>
        <div class="inst-detail-item">
          <strong>Horario:</strong>
          <span>${horario}</span>
        </div>
        <div class="inst-detail-item">
          <strong>Sitio web:</strong>
          <span>${sitioWebHtml}</span>
        </div>
      </div>

      <div class="inst-card__desc">
        ${descripcion}
      </div>
    </div>
  `;

  document.getElementById('institucion-modal').classList.add('institucion-modal--open');
}

// Delegación de eventos para los enlaces en popups
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
function crearCapaInstitucion(featuresCategoria, cat, map, grupoInstituciones) {
  const layer = L.geoJSON(
    {
      type: 'FeatureCollection',
      features: featuresCategoria
    },
    {
      pointToLayer: (feature, latlng) => {
        const id = `institucion-${institucionesContador++}`;

        institucionesIndex[id] = {
          props: feature.properties,
          categoria: cat
        };

        return L.circleMarker(latlng, {
          radius: 7,
          color: '#0b1220',
          weight: 1,
          fillColor: cat.color,
          fillOpacity: 0.9
        }).bindPopup(
          construirHtmlPopup(feature.properties, cat, id)
        );
      }
    }
  );

  layer.addTo(grupoInstituciones);
  institucionesLayers[cat.key] = layer;

  const countEl = document.getElementById(`count-${cat.key}`);
  if (countEl) {
    countEl.textContent = featuresCategoria.length;
  }

  const checkbox = document.querySelector(`input[data-category="${cat.key}"]`);
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        grupoInstituciones.addLayer(layer);
      } else {
        grupoInstituciones.removeLayer(layer);
      }
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
async function initInstitucionesLayer(map, grupoInstituciones) {
  renderCategoryList();

  grupoInstituciones.addTo(map);

  const totalEl = document.getElementById('instituciones-total');

  if (!supabaseClient) {
    console.warn('Supabase no está configurado (ver js/supabaseClient.js).');
    if (totalEl) {
      totalEl.textContent = 'Supabase no configurado';
    }
    return;
  }

  const [
    featuresOficial,
    featuresCapa1Raw,
    featuresCapa2Raw
  ] = await Promise.all([
    fetchFeatures('instituciones_educativas'),
    fetchFeatures('capa1_colegios_geojson'),
    fetchFeatures('capa2_colegios_detalle_geojson')
  ]);

  const nombresOficiales = featuresOficial.map((feature) => feature.properties.nombre);

  const featuresCapa1 = quitarDuplicados(featuresCapa1Raw, nombresOficiales);
  const featuresCapa2 = quitarDuplicados(featuresCapa2Raw, nombresOficiales);

  let totalGeneral = 0;

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    let featuresCategoria = [];

    if (cat.source === 'oficial') {
      featuresCategoria = featuresOficial.filter(
        (feature) => categoriaKeyDe(feature.properties) === cat.key
      );
    } else if (cat.source === 'capa1') {
      featuresCategoria = featuresCapa1;
    } else if (cat.source === 'capa2') {
      featuresCategoria = featuresCapa2;
    }

    totalGeneral += crearCapaInstitucion(
      featuresCategoria,
      cat,
      map,
      grupoInstituciones
    );
  });

  if (totalEl) {
    totalEl.textContent = `${totalGeneral} instituciones`;
  }

  await initLimiteMunicipal(map);
}