/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga el inventario de colegios y universidades de Sabaneta
 * DIRECTO DESDE SUPABASE (tabla "instituciones_educativas"), y lo
 * dibuja en el mapa como AREAS SOMBREADAS (no puntos), con un color
 * distinto por categoría y filtros en el panel derecho.
 *
 * Cada institución se dibuja así:
 *   - Si la fila tiene un polígono en la columna "geometria" (jsonb con
 *     GeoJSON), se usa ese contorno real del predio.
 *   - Si no, se dibuja un círculo sombreado en metros sobre el punto
 *     (longitud, latitud). El tamaño sale de "radio_m" si existe, y si
 *     no se usa un valor por defecto según el tipo.
 *
 * Columnas esperadas en la tabla instituciones_educativas:
 *   nombre, tipo ("colegio"/"universidad"), sector ("publico"/"privado"),
 *   direccion, estrato, longitud, latitud, imagen_url
 *   [opcionales] radio_m (numeric), geometria (jsonb)
 * ------------------------------------------------------------------
 */

const CATEGORIAS_INSTITUCIONES = [
  { key: 'colegio-publico',     tipo: 'colegio',     sector: 'publico', label: 'Colegios públicos',      color: '#3b82f6' },
  { key: 'colegio-privado',     tipo: 'colegio',     sector: 'privado', label: 'Colegios privados',      color: '#f97316' },
  { key: 'universidad-publico', tipo: 'universidad', sector: 'publico', label: 'Universidades públicas', color: '#22c55e' },
  { key: 'universidad-privado', tipo: 'universidad', sector: 'privado', label: 'Universidades privadas', color: '#a855f7' },
];

// Radio del área sombreada (en metros) cuando la institución no tiene polígono.
const RADIO_POR_DEFECTO_M = { colegio: 60, universidad: 120 };

// Apariencia del sombreado.
const OPACIDAD_RELLENO = 0.35;
const OPACIDAD_RELLENO_HOVER = 0.6;
const GROSOR_BORDE = 2;

const institucionesLayers = {};

function categoriaKeyDe(props) {
  return `${props.tipo}-${props.sector}`;
}

function popupInstitucion(props, categoria) {
  const estrato = (props.estrato === null || props.estrato === undefined)
    ? 'No disponible'
    : props.estrato;

  const imagenHtml = props.imagen_url
    ? `<img src="${props.imagen_url}" alt="${props.nombre}" class="institucion-popup__img"
         onerror="this.style.display='none'" />`
    : '';

  return (
    `<div class="institucion-popup">`
    + imagenHtml
    + `<strong>${props.nombre}</strong><br/>`
    + `<span class="institucion-popup__categoria">${categoria ? categoria.label : ''}</span><br/>`
    + `<span>${props.direccion || ''}</span><br/>`
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
    li.className = 'category-item';
    li.innerHTML = `
      <label class="category-toggle">
        <input type="checkbox" data-category="${cat.key}" checked />
        <span class="category-swatch" style="background:${cat.color}"></span>
        <span class="category-toggle__label">${cat.label}</span>
        <span class="category-count" id="count-${cat.key}">0</span>
      </label>
    `;
    list.appendChild(li);
  });
}

/**
 * Devuelve la geometría GeoJSON de una fila: el polígono si existe,
 * y si no un punto que después se convierte en círculo sombreado.
 */
function geometriaDe(row) {
  if (row.geometria) {
    try {
      return typeof row.geometria === 'string' ? JSON.parse(row.geometria) : row.geometria;
    } catch (e) {
      console.warn(`Geometría inválida en "${row.nombre}", se usa el punto:`, e);
    }
  }
  return { type: 'Point', coordinates: [row.longitud, row.latitud] };
}

function tieneUbicacion(row) {
  if (row.geometria) return true;
  return row.longitud !== null && row.longitud !== undefined
    && row.latitud !== null && row.latitud !== undefined;
}

function filaAFeature(row) {
  return {
    type: 'Feature',
    geometry: geometriaDe(row),
    properties: {
      nombre: row.nombre,
      tipo: row.tipo,
      sector: row.sector,
      direccion: row.direccion,
      estrato: row.estrato,
      imagen_url: row.imagen_url,
      radio_m: row.radio_m,
    },
  };
}

function radioDe(props) {
  if (props.radio_m) return Number(props.radio_m);
  return RADIO_POR_DEFECTO_M[props.tipo] || 60;
}

function estiloArea(color) {
  return {
    color,
    weight: GROSOR_BORDE,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: OPACIDAD_RELLENO,
  };
}

async function initInstitucionesLayer(map) {
  renderCategoryList();

  const totalEl = document.getElementById('instituciones-total');

  if (!supabaseClient) {
    console.warn('Supabase no está configurado (ver js/supabaseClient.js).');
    if (totalEl) totalEl.textContent = 'Supabase no configurado';
    return;
  }

  const { data, error } = await supabaseClient.from('instituciones_educativas').select('*');

  if (error) {
    console.error('Error cargando instituciones desde Supabase:', error);
    if (totalEl) totalEl.textContent = 'Error al cargar (ver consola)';
    return;
  }

  const features = data.filter(tieneUbicacion).map(filaAFeature);

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    const featuresCategoria = features.filter((f) => categoriaKeyDe(f.properties) === cat.key);

    const layer = L.geoJSON(
      { type: 'FeatureCollection', features: featuresCategoria },
      {
        // Polígonos: contorno real del predio.
        style: () => estiloArea(cat.color),

        // Puntos: círculo en metros, no un marcador de tamaño fijo,
        // para que el sombreado crezca y decrezca con el zoom.
        pointToLayer: (feature, latlng) => L.circle(
          latlng,
          Object.assign({ radius: radioDe(feature.properties) }, estiloArea(cat.color))
        ),

        // Un solo lugar para popup e interacción, sirve para ambos casos.
        onEachFeature: (feature, capa) => {
          capa.bindPopup(popupInstitucion(feature.properties, cat));

          capa.on('mouseover', () => capa.setStyle({ fillOpacity: OPACIDAD_RELLENO_HOVER }));
          capa.on('mouseout', () => capa.setStyle({ fillOpacity: OPACIDAD_RELLENO }));
        },
      }
    );

    institucionesLayers[cat.key] = layer;
    layer.addTo(map);

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

  if (totalEl) totalEl.textContent = `${features.length} instituciones`;
}