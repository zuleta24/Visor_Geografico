/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga el inventario de colegios y universidades de Sabaneta
 * DIRECTO DESDE SUPABASE (tabla "instituciones_educativas"), y lo
 * dibuja en el mapa con un color distinto por categoría, con filtros
 * en el panel derecho. Corregir una coordenada o agregar una imagen
 * se hace directo en Supabase, sin tocar código ni redesplegar.
 *
 * Columnas esperadas en la tabla instituciones_educativas:
 *   nombre, tipo ("colegio"/"universidad"), sector ("publico"/"privado"),
 *   direccion, estrato, longitud, latitud, imagen_url
 * ------------------------------------------------------------------
 */

const CATEGORIAS_INSTITUCIONES = [
  { key: 'colegio-publico',     tipo: 'colegio',     sector: 'publico', label: 'Colegios públicos',      color: '#3b82f6' },
  { key: 'colegio-privado',     tipo: 'colegio',     sector: 'privado', label: 'Colegios privados',      color: '#f97316' },
  { key: 'universidad-publico', tipo: 'universidad', sector: 'publico', label: 'Universidades públicas', color: '#22c55e' },
  { key: 'universidad-privado', tipo: 'universidad', sector: 'privado', label: 'Universidades privadas', color: '#a855f7' },
];

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

  const features = data
    .filter((row) => row.longitud !== null && row.latitud !== null)
    .map(filaAFeature);

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    const featuresCategoria = features.filter((f) => categoriaKeyDe(f.properties) === cat.key);

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