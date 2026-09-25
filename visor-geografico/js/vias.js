/**
 * vias.js
 * ------------------------------------------------------------------
 * Carga la red vial de Sabaneta (tabla "calles_sabaneta", subida
 * desde QGIS a Supabase) y la dibuja como líneas en el mapa, con su
 * propio checkbox para mostrar/ocultar.
 *
 * La tabla tiene más de 1000 filas, y Supabase solo devuelve 1000
 * por consulta por defecto — por eso se pagina con .range() hasta
 * traer todas.
 * ------------------------------------------------------------------
 */

let viasLayer = null;

function popupVia(props) {
  const tipo = props.highway || 'Vía sin clasificar';
  return `<div class="institucion-popup"><span>Tipo de vía: ${tipo}</span></div>`;
}

/** Trae TODAS las filas de una tabla/vista, paginando de a 1000. */
async function fetchAllRows(tableName, pageSize = 1000) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

function renderViasToggle(cantidad) {
  const list = document.getElementById('category-list');
  if (!list) return;

  const li = document.createElement('li');
  li.className = 'category-item';
  li.innerHTML = `
    <label class="category-toggle">
      <input type="checkbox" id="toggle-vias-sabaneta" ${cantidad > 0 ? 'checked' : 'disabled'} />
      <span class="category-swatch" style="background:#94a3b8"></span>
      <span class="category-toggle__label">Vías de Sabaneta</span>
      <span class="category-count">${cantidad}</span>
    </label>
  `;
  list.appendChild(li);
}

async function initViasLayer(map) {
  if (!supabaseClient) {
    console.warn('Supabase no configurado, no se puede cargar vias.');
    renderViasToggle(0);
    return;
  }

  let data;
  try {
    data = await fetchAllRows('calles_sabaneta_geojson');
  } catch (err) {
    console.error('Error cargando calles_sabaneta_geojson:', err);
    renderViasToggle(0);
    return;
  }

  if (!data || data.length === 0) {
    console.warn('calles_sabaneta_geojson no devolvió filas.');
    renderViasToggle(0);
    return;
  }

  const features = data
    .filter((row) => row.geojson)
    .map((row) => ({
      type: 'Feature',
      properties: { highway: row.highway },
      geometry: JSON.parse(row.geojson),
    }));

  viasLayer = L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      style: { color: '#be4848', weight: 2, opacity: 0.8 },
      onEachFeature: (feature, layer) => layer.bindPopup(popupVia(feature.properties)),
    }
  );
  viasLayer.addTo(map);

  renderViasToggle(features.length);

  document.getElementById('toggle-vias-sabaneta').addEventListener('change', (e) => {
    if (e.target.checked) {
      viasLayer.addTo(map);
    } else {
      map.removeLayer(viasLayer);
    }
  });
}