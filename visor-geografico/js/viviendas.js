/**
 * viviendas.js
 * ------------------------------------------------------------------
 * Consume los Vector Tiles (.pbf) generados por generar_tiles.py a
 * partir de la vista PostGIS "viviendas_priorizadas_colegios". En
 * vez de cargar los predios como GeoJSON crudo, Leaflet solo pide
 * los tiles que caben en pantalla — esto es la defensa contra la
 * prueba de estrés.
 * ------------------------------------------------------------------
 */

const COLORES_PRIORIDAD = { alta: '#ef4444', media: '#f97316', baja: '#eab308' };

let viviendasLayer = null;

function initViviendasPriorizadas(map) {
  viviendasLayer = L.vectorGrid.protobuf(
    'tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf',
    {
      rendererFactory: L.canvas.tile,
      interactive: true,
      maxNativeZoom: 17,
      vectorTileLayerStyles: {
        viviendas: function(properties) {
          let prio = properties.prioridad ? properties.prioridad.toLowerCase() : '';
          return {
            radius: 6,
            fillColor: COLORES_PRIORIDAD[prio] || '#94a3b8',
            color: '#ffffff',
            weight: 1.5,
            fillOpacity: 0.9,
            fill: true
          };
        }
      }
    }
  );

  viviendasLayer.addTo(map);

  viviendasLayer.on('click', (e) => {
    // Escudo: Si properties no existe, usamos un objeto vacío para que no colapse
    const p = e.layer.properties || {}; 
    
    // Imprimimos los datos en la consola por si necesitamos revisarlos
    console.log("Datos capturados en el clic:", p);
    
    const nombre = p.colegio_nombre || 'Desconocido';
    const dist = p.distancia_metros || p.distancia_m || 'N/A';
    const prio = p.prioridad || 'No definida';

    L.popup()
      .setLatLng(e.latlng)
      .setContent(
        `<div style="font-family: sans-serif; min-width: 150px;">
          <strong style="color: #0b1220;">Predio cerca de ${nombre}</strong><br/>
          <hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;" />
          <b>Distancia:</b> ${dist} m<br/>
          <b>Prioridad:</b> <span style="text-transform: capitalize;">${prio}</span>
        </div>`
      )
      .openOn(map);
  });

  // Checkbox en el panel lateral
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