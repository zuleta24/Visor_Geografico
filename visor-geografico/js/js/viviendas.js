/**
 * viviendas.js
 * ------------------------------------------------------------------
 * Consume los Vector Tiles (.pbf) generados por generar_tiles.py a
 * partir de la vista PostGIS "viviendas_priorizadas_colegios". En
 * vez de cargar los predios como GeoJSON crudo, Leaflet solo pide
 * los tiles que caben en pantalla — esto es la defensa contra la
 * prueba de estrés del profesor.
 * ------------------------------------------------------------------
 */

const COLORES_PRIORIDAD = { alta: '#ef4444', media: '#f97316', baja: '#eab308' };

let viviendasLayer = null;

function initViviendasPriorizadas(map) {
  viviendasLayer = L.vectorGrid.protobuf(
    'tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf',
    {
      vectorTileLayerStyles: {
        viviendas: (properties) => ({
          radius: 5,
          fillColor: COLORES_PRIORIDAD[properties.prioridad] || '#94a3b8',
          color: '#0b1220',
          weight: 1,
          fillOpacity: 0.85,
        }),
      },
      interactive: true,
      maxNativeZoom: 17,
    }
  );

  viviendasLayer.addTo(map);

  viviendasLayer.on('click', (e) => {
    const p = e.layer.properties;
    L.popup()
      .setLatLng(e.latlng)
      .setContent(
        `<div class="institucion-popup"><strong>Predio cerca de ${p.colegio_nombre}</strong><br/>`
        + `Distancia: ${p.distancia_m} m<br/>Prioridad: ${p.prioridad}</div>`
      )
      .openOn(map);
  });

  // Checkbox en el panel, igual que las demás capas
  const list = document.getElementById('category-list');
  if (list) {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <label class="category-toggle">
        <input type="checkbox" id="toggle-viviendas" checked />
        <span class="category-swatch" style="background:#ef4444"></span>
        <span class="category-toggle__label">Viviendas priorizadas (tiles)</span>
      </label>
    `;
    list.appendChild(li);

    document.getElementById('toggle-viviendas').addEventListener('change', (e) => {
      if (e.target.checked) {
        viviendasLayer.addTo(map);
      } else {
        map.removeLayer(viviendasLayer);
      }
    });
  }
}