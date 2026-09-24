/**
 * vias.js
 * ------------------------------------------------------------------
 * Carga la red vial de Sabaneta (tabla "calles_sabaneta", subida
 * desde QGIS a Supabase) y la dibuja como líneas en el mapa, con su
 * propio checkbox para mostrar/ocultar.
 * ------------------------------------------------------------------
 */

let viasLayer = null;

function popupVia(props) {
  const tipo = props.highway || 'Vía sin clasificar';
  const nombre = props.name || 'Sin nombre registrado';
  return `<div class="institucion-popup"><strong>${nombre}</strong><br/><span>Tipo: ${tipo}</span></div>`;
}

async function initViasLayer(map) {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.from('calles_sabaneta_geojson').select('*');
  if (error) {
    console.error('Error cargando calles_sabaneta:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.warn('calles_sabaneta_geojson no devolvió filas (revisa que la tabla ya tenga datos).');
    return;
  }

  const features = data
    .filter((row) => row.geojson)
    .map((row) => ({
      type: 'Feature',
      properties: { name: row.name, highway: row.highway },
      geometry: JSON.parse(row.geojson),
    }));

  viasLayer = L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      style: { color: '#94a3b8', weight: 2, opacity: 0.8 },
      onEachFeature: (feature, layer) => layer.bindPopup(popupVia(feature.properties)),
    }
  );
  viasLayer.addTo(map);

  const list = document.getElementById('category-list');
  if (list) {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <label class="category-toggle">
        <input type="checkbox" id="toggle-vias-sabaneta" checked />
        <span class="category-swatch" style="background:#94a3b8"></span>
        <span class="category-toggle__label">Vías de Sabaneta</span>
        <span class="category-count">${features.length}</span>
      </label>
    `;
    list.appendChild(li);

    document.getElementById('toggle-vias-sabaneta').addEventListener('change', (e) => {
      if (e.target.checked) {
        viasLayer.addTo(map);
      } else {
        map.removeLayer(viasLayer);
      }
    });
  }
}