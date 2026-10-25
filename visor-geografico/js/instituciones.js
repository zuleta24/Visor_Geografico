/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga instituciones educativas desde fuentes de Supabase y OpenStreetMap.
 * Gestiona capas, duplicados, modal de detalles, enrutamiento y sistema de opiniones.
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

// Registro id -> { props, categoria }
const institucionesIndex = {};
let institucionesContador = 0;

// Control de ruta Leaflet Routing Machine
let controlRuta = null; 

// ==========================================
// 3. UTILIDADES, PROCESAMIENTO Y OPINIONES
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

function generarEstrellasHtml(calificacion, numOpiniones, localId) {
  const nota = calificacion ? parseFloat(calificacion).toFixed(1) : 0;
  
  if (nota == 0) {
    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; margin-bottom: 15px;">
        <span style="color:#94a3b8; font-size:14px;">Sin calificar</span>
        <span style="color:#475569;">•</span>
        <a href="javascript:void(0)" onclick="abrirFormularioOpinion('${localId}')" style="color:#29e2b8; font-size:13px; text-decoration:none; font-weight:500;">Escribir una opinión</a>
      </div>
    `;
  }
  
  let estrellasHtml = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.round(nota)) {
      estrellasHtml += '<span style="color:#fbbc04; font-size:17px;">★</span>';
    } else {
      estrellasHtml += '<span style="color:#475569; font-size:17px;">★</span>';
    }
  }

  const textoOpiniones = numOpiniones === 1 ? '1 opinión' : `${numOpiniones} opiniones`;

  return `
    <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; margin-bottom: 15px;">
      <span style="color:#fff; font-size: 24px; font-weight: 500; line-height: 1;">${nota}</span>
      <div style="display: flex; gap: 1px; align-items: center; padding-bottom: 2px;">
        ${estrellasHtml}
      </div>
      <span style="color:#9aa0a6; font-size: 13px; cursor: pointer; text-decoration: none;" onclick="abrirFormularioOpinion('${localId}')">${textoOpiniones}</span>
    </div>
  `;
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
      calificacion: row.calificacion,
      num_opiniones: row.num_opiniones,
      documentos: row.documentos,
      latitud: row.latitud,
      longitud: row.longitud
    },
  };
}

function abrirFormularioOpinion(localId) {
  const entry = institucionesIndex[localId];
  if (!entry) return;
  const props = entry.props;

  const modal = document.createElement('div');
  modal.id = 'opinion-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(11, 18, 32, 0.85);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';

  modal.innerHTML = `
    <div style="background:#1e293b; padding:24px; border-radius:12px; width:300px; text-align:center; position:relative; box-shadow:0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155;">
      <button onclick="document.getElementById('opinion-modal').remove()" style="position:absolute; top:10px; right:15px; background:none; border:none; color:#94a3b8; font-size:24px; cursor:pointer;">&times;</button>
      <h3 style="color:#fff; margin-top:0; margin-bottom: 5px;">Calificar institución</h3>
      <p style="color:#94a3b8; font-size:13px; margin-bottom:20px; font-weight:500;">${props.nombre}</p>
      
      <div id="star-selector" style="font-size:38px; color:#475569; cursor:pointer; margin-bottom:25px; display:flex; justify-content:center; gap:8px; transition: color 0.2s;">
        <span data-val="1">★</span><span data-val="2">★</span><span data-val="3">★</span><span data-val="4">★</span><span data-val="5">★</span>
      </div>
      
      <button id="btn-enviar-opinion" style="background:#29e2b8; color:#0b1220; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer; width:100%; opacity:0.5;" disabled>Enviar calificación</button>
    </div>
  `;
  document.body.appendChild(modal);

  let ratingSeleccionado = 0;
  const stars = modal.querySelectorAll('#star-selector span');
  const btn = modal.querySelector('#btn-enviar-opinion');

  stars.forEach(star => {
    star.addEventListener('mouseover', function() {
      const val = parseInt(this.getAttribute('data-val'));
      stars.forEach(s => s.style.color = parseInt(s.getAttribute('data-val')) <= val ? '#fbbc04' : '#475569');
    });
    
    star.addEventListener('mouseout', function() {
      stars.forEach(s => s.style.color = parseInt(s.getAttribute('data-val')) <= ratingSeleccionado ? '#fbbc04' : '#475569');
    });
    
    star.addEventListener('click', function() {
      ratingSeleccionado = parseInt(this.getAttribute('data-val'));
      stars.forEach(s => s.style.color = parseInt(s.getAttribute('data-val')) <= ratingSeleccionado ? '#fbbc04' : '#475569');
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  });

  btn.addEventListener('click', () => guardarOpinionEnSupabase(localId, ratingSeleccionado, modal));
}

async function guardarOpinionEnSupabase(localId, nuevaNota, modalElement) {
  const props = institucionesIndex[localId].props;
  const tableName = props.db_table;
  const dbId = props.db_id;

  if (!dbId || !tableName) {
    alert("Error: No se pudo identificar la institución en la base de datos.");
    return;
  }

  const btn = modalElement.querySelector('#btn-enviar-opinion');
  btn.textContent = 'Guardando...';
  btn.style.opacity = '0.5';
  btn.disabled = true;

  const oldOpiniones = parseInt(props.num_opiniones) || 0;
  const oldCalificacion = parseFloat(props.calificacion) || 0;
  
  const nuevasOpiniones = oldOpiniones + 1;
  const nuevaCalificacion = ((oldCalificacion * oldOpiniones) + nuevaNota) / nuevasOpiniones;

  const { error } = await supabaseClient
    .from(tableName)
    .update({
      calificacion: nuevaCalificacion,
      num_opiniones: nuevasOpiniones
    })
    .eq('id', dbId); 

  if (error) {
    console.error("Error guardando en Supabase:", error);
    alert("Hubo un error al guardar tu calificación. Inténtalo de nuevo.");
    btn.textContent = 'Enviar calificación';
    btn.style.opacity = '1';
    btn.disabled = false;
  } else {
    props.num_opiniones = nuevasOpiniones;
    props.calificacion = nuevaCalificacion;
    
    modalElement.remove(); 
    abrirDetalleInstitucion(localId); 
  }
}

// ==========================================
// 4. RENDERIZADO DE INTERFAZ (UI)
// ==========================================
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

  const estrellasHtml = generarEstrellasHtml(props.calificacion, props.num_opiniones || 0, id);
  const documentos = props.documentos || 'No hay información sobre documentos requeridos o procesos de matrícula.';
  const lat = props.latitud;
  const lng = props.longitud;

  const estudiantes = (props.num_estudiantes != null && props.num_estudiantes !== '') ? props.num_estudiantes : 'Por registrar';
  const cupos = (props.cupos_disponibles != null && props.cupos_disponibles !== '') ? props.cupos_disponibles : 'Por registrar';
  const recursos = (props.recursos_tecnologicos != null && props.recursos_tecnologicos !== '') ? props.recursos_tecnologicos : 'Por registrar';
  const docentes = (props.num_docentes != null && props.num_docentes !== '') ? props.num_docentes : 'Por registrar';

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

      ${estrellasHtml}

      <div class="inst-card__tags">
        <span class="inst-tag inst-tag--${tipo}">${tipo}</span>
        <span class="inst-tag inst-tag--sector">${sector}</span>
        <span class="inst-tag inst-tag--sector">${estrato}</span>
      </div>

      <div style="margin: 15px 0;">
        <button onclick="trazarRutaHacia(${lat}, ${lng})" style="background:#29e2b8;color:#0b1220;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;width:100%; transition: background 0.3s;" onmouseover="this.style.background='#1eb996'" onmouseout="this.style.background='#29e2b8'">
          📍 Cómo llegar desde mi ubicación
        </button>
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

      <div class="inst-card__docs" style="background:#1e293b;padding:12px;border-radius:8px;margin-top:15px;border-left:4px solid #3b82f6;">
        <strong style="color:#fff;display:block;margin-bottom:5px;">📄 Documentos para ingreso/matrícula:</strong>
        <span style="color:#cbd5e1;font-size:13px;white-space:pre-line;">${documentos}</span>
      </div>

      <div class="inst-card__desc" style="margin-top:15px;">
        ${descripcion}
      </div>
    </div>
  `;

  document.getElementById('institucion-modal').classList.add('institucion-modal--open');
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.institucion-popup__link');
  if (link) abrirDetalleInstitucion(link.dataset.institucionId);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModalInstitucion();
});

// ==========================================
// 5. ENRUTAMIENTO (LEAFLET ROUTING MACHINE)
// ==========================================
function limpiarRuta() {
  if (typeof map === 'undefined') return;
  
  if (controlRuta) {
    map.removeControl(controlRuta);
    controlRuta = null;
  }
  
  const btn = document.getElementById('btn-limpiar-ruta');
  if (btn) btn.style.display = 'none';
}

function trazarRutaHacia(destLat, destLng) {
  if (!destLat || !destLng) {
    alert("Las coordenadas de esta institución no están disponibles.");
    return;
  }

  if (navigator.geolocation) {
    cerrarModalInstitucion();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        if (typeof map === 'undefined') {
          console.error("La variable 'map' no está definida globalmente.");
          return;
        }
        
        if (controlRuta) {
          map.removeControl(controlRuta); 
        }

        controlRuta = L.Routing.control({
          waypoints: [
            L.latLng(userLat, userLng), 
            L.latLng(destLat, destLng)  
          ],
          routeWhileDragging: false,
          addWaypoints: false,      
          fitSelectedRoutes: true,  
          showAlternatives: false,
          lineOptions: {
            styles: [{ color: '#29e2b8', opacity: 0.8, weight: 5 }]
          }
        }).addTo(map);

        let btnLimpia = document.getElementById('btn-limpiar-ruta');
        if (!btnLimpia) {
          btnLimpia = document.createElement('button');
          btnLimpia.id = 'btn-limpiar-ruta';
          btnLimpia.innerHTML = '❌ Quitar ruta';
          btnLimpia.style.cssText = 'position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: background 0.3s;';
          btnLimpia.onmouseover = () => btnLimpia.style.background = '#dc2626';
          btnLimpia.onmouseout = () => btnLimpia.style.background = '#ef4444';
          btnLimpia.onclick = limpiarRuta;
          
          const mapContainer = document.querySelector('.map-container') || document.body;
          mapContainer.appendChild(btnLimpia);
        }
        btnLimpia.style.display = 'block';

      },
      (error) => {
        console.error("Error obteniendo ubicación: ", error);
        alert("No pudimos acceder a tu ubicación para trazar la ruta en el visor. Verifica los permisos de tu navegador.");
      },
      { enableHighAccuracy: true }
    );
  } else {
    alert("Tu navegador no soporta la geolocalización.");
  }
}

// ==========================================
// 6. SERVICIOS DE DATOS (SUPABASE)
// ==========================================
async function fetchFeatures(tableName) {
  const { data, error } = await supabaseClient.from(tableName).select('*');
  
  if (error) {
    console.error(`Error cargando ${tableName}:`, error);
    return [];
  }
  
  return data
    .filter((row) => row.longitud != null && row.latitud != null)
    .map(row => {
      const feature = filaAFeature(row);
      // Guardamos el ID de la base de datos y la tabla para poder hacer actualizaciones (ej. calificaciones)
      feature.properties.db_id = row.id; 
      feature.properties.db_table = tableName;
      return feature;
    });
}

// ==========================================
// 7. GESTIÓN DE MAPAS (LEAFLET)
// ==========================================
function crearCapaInstitucion(featuresCategoria, cat, mapaLocal, grupoInstituciones) {
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

async function initLimiteMunicipal(mapaLocal) {
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

  limiteSabanetaLayer.addTo(mapaLocal);

  const checkbox = document.getElementById('toggle-limite-sabaneta');
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      checkbox.checked ? limiteSabanetaLayer.addTo(mapaLocal) : mapaLocal.removeLayer(limiteSabanetaLayer);
    });
  }
}

// ==========================================
// 8. INICIALIZACIÓN PRINCIPAL
// ==========================================
async function initInstitucionesLayer(mapaLocal, grupoInstituciones) {
  renderCategoryList();

  grupoInstituciones.addTo(mapaLocal);

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
      mapaLocal,
      grupoInstituciones
    );
  });

  if (totalEl) {
    totalEl.textContent = `${totalGeneral} instituciones`;
  }

  await initLimiteMunicipal(mapaLocal);
}