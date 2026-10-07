/**
 * viviendas.js
 * ------------------------------------------------------------------
 * MODO CAZAFANTASMAS: Diagnóstico visual y de consola.
 * ------------------------------------------------------------------
 */

const COLORES_PRIORIDAD = { alta: '#ef4444', media: '#f97316', baja: '#eab308' };

let viviendasTiles = null;
let viviendasFantasma = null;

function initViviendasPriorizadas(map) {
  
  // 1. LOS PUNTOS NARANJAS (Los PBF sin interactividad)
  viviendasTiles = L.vectorGrid.protobuf(
    'tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf',
    {
      rendererFactory: L.canvas.tile,
      interactive: false, 
      maxNativeZoom: 17,
      vectorTileLayerStyles: {
        viviendas: function(properties) {
          let prio = properties.prioridad ? properties.prioridad.toLowerCase() : '';
          return {
            radius: 6,
            fillColor: COLORES_PRIORIDAD[prio] || '#f97316',
            color: '#ffffff',
            weight: 1.5,
            fillOpacity: 0.9,
            fill: true
          };
        }
      }
    }
  );
  viviendasTiles.addTo(map);

  // 2. EL PISO SUPERIOR PARA LOS FANTASMAS
  if (!map.getPane('ghostPane')) {
    map.createPane('ghostPane');
    map.getPane('ghostPane').style.zIndex = 999; 
    map.getPane('ghostPane').style.pointerEvents = 'auto'; // Obligamos a que reciba clics
  }

  // 3. LA CAPA FANTASMA (AHORA ROJA Y GIGANTE)
  fetch('data/viviendas_priorizadas_colegios.geojson')
    .then(response => response.json())
    .then(data => {
      
      // CHIVATO EN CONSOLA: ¿Cuántas casas trajo el archivo?
      const cantidad = data.features ? data.features.length : 0;
      console.log(`👻 MODO CAZAFANTASMAS: El archivo GeoJSON cargó con ${cantidad} viviendas.`);

      viviendasFantasma = L.geoJSON(data, {
        pane: 'ghostPane', 
        pointToLayer: function(feature, latlng) {
          // LOS HACEMOS ROJOS, GIGANTES Y SEMITRANSPARENTES
          return L.circleMarker(latlng, {
            radius: 25, 
            opacity: 1, 
            fillOpacity: 0.5,
            color: '#ff0000', 
            fillColor: '#ff0000'
          });
        },
        onEachFeature: function(feature, layer) {
          const p = feature.properties || {}; 
          const nombre = p.colegio_nombre || p.colegio || 'Dato no disponible';
          const dist = p.distancia_metros || p.distancia_m || p.distancia || 'Dato no disponible';
          const prio = p.prioridad || 'Dato no disponible';

          layer.bindPopup(
            `<div style="font-family: sans-serif; min-width: 150px;">
              <strong style="color: #0b1220;">Predio cerca de ${nombre}</strong><br/>
              <hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;" />
              <b>Distancia:</b> ${dist} m<br/>
              <b>Prioridad:</b> <span style="text-transform: capitalize;">${prio}</span>
            </div>`
          );
        }
      });
      viviendasFantasma.addTo(map);
    })
    .catch(error => console.error("Error cargando capa fantasma:", error));

  // 4. CHECKBOX PANEL IZQUIERDO
  const list = document.getElementById('category-list');
  if (list) {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <label class="category-toggle">
        <input type="checkbox" id="toggle-viviendas" checked />
        <span class="category-swatch" style="background:#ef4444"></span>
        <span class="category-toggle__label">Viviendas priorizadas</span>
      </label>
    `;
    list.appendChild(li);

    document.getElementById('toggle-viviendas').addEventListener('change', (e) => {
      if (e.target.checked) {
        map.addLayer(viviendasTiles);
        if (viviendasFantasma) map.addLayer(viviendasFantasma);
      } else {
        map.removeLayer(viviendasTiles);
        if (viviendasFantasma) map.removeLayer(viviendasFantasma);
      }
    });
  }
}