/**
 * instituciones.js
 * ------------------------------------------------------------------
 * Carga el inventario de colegios y universidades de Sabaneta (un
 * dato temático propio del proyecto, distinto de las capas que el
 * usuario sube en "1 · Cargar capa") y lo dibuja en el mapa con un
 * color distinto por categoría, con filtros en el panel derecho.
 *
 * Fuente de los datos: Directorio Educativo de Sabaneta 2022
 * (Alcaldía de Sabaneta) + coordenadas obtenidas por geocodificación.
 * El campo "estrato" de cada institución queda vacío a propósito:
 * no existe una única fuente pública con ese dato por institución,
 * hay que completarlo a mano (ver docs/inventario-educativo.md).
 * ------------------------------------------------------------------
 */

const CATEGORIAS_INSTITUCIONES = [
  { key: 'colegio-publico',     tipo: 'colegio',     sector: 'publico', label: 'Colegios públicos',      color: '#3b82f6' },
  { key: 'colegio-privado',     tipo: 'colegio',     sector: 'privado', label: 'Colegios privados',      color: '#f97316' },
  { key: 'universidad-publico', tipo: 'universidad', sector: 'publico', label: 'Universidades públicas', color: '#22c55e' },  //No registra con universidades publicas, porque no hay
  { key: 'universidad-privado', tipo: 'universidad', sector: 'privado', label: 'Universidades privadas', color: '#a855f7' },
];

const institucionesLayers = {}; // key de categoría -> L.geoJSON layer

function categoriaKeyDe(props) {
  return `${props.tipo}-${props.sector}`;
}

function popupInstitucion(props, categoria) {
  const estrato = (props.estrato === null || props.estrato === undefined)
    ? 'No disponible'
    : props.estrato;
  return (
    `<div class="institucion-popup">`
    + `<strong>${props.nombre}</strong><br/>`
    + `<span class="institucion-popup__categoria">${categoria ? categoria.label : ''}</span><br/>`
    + `<span>${props.direccion || ''}</span><br/>`
    + `<span>Estrato: ${estrato}</span>`
    + `</div>`
  );
}

/** Construye dinámicamente la lista de categorías con checkbox + contador en el panel derecho. */
function renderCategoryList() {
  const list = document.getElementById('category-list');
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

/** Carga el GeoJSON temático y dibuja una capa por categoría, coloreada. */
async function initInstitucionesLayer(map) {
  renderCategoryList();

  let geojson;
  try {
    const res = await fetch('data/colegios-universidades-sabaneta.geojson');
    geojson = await res.json();
  } catch (err) {
    console.error('No se pudo cargar el inventario educativo:', err);
    document.getElementById('instituciones-total').textContent = 'Error al cargar';
    return;
  }

  CATEGORIAS_INSTITUCIONES.forEach((cat) => {
    const featuresCategoria = geojson.features.filter((f) => categoriaKeyDe(f.properties) === cat.key);

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
    layer.addTo(map); // visibles por defecto

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

  document.getElementById('instituciones-total').textContent = `${geojson.features.length} instituciones`;
}