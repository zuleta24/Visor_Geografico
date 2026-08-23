/**
 * layers.js
 * ------------------------------------------------------------------
 * Carga de archivos GeoJSON, detección (semi-automática) del sistema
 * de coordenadas de origen, y reproyección a WGS84 para poder
 * dibujar la capa en Leaflet.
 *
 * Estrategia de detección (deliberadamente simple):
 *   1. Si el GeoJSON trae un miembro "crs" explícito -> se lee de ahí.
 *   2. Si no, se mira la magnitud de la primera coordenada:
 *        - valores entre [-180,180] / [-90,90]  -> probablemente geográfico
 *        - "false easting" ~5.000.000            -> probablemente EPSG:9377
 *        - "false easting/northing" ~1.000.000   -> probablemente EPSG:3116
 *        - resto de valores en metros             -> probablemente UTM
 *   3. SIEMPRE se le pide confirmación al usuario antes de usar el
 *      resultado. La heurística es un punto de partida, no una
 *      verdad absoluta.
 * ------------------------------------------------------------------
 */

let pendingGeoJSON = null; // capa a la espera de confirmación de CRS
let loadedLayers = [];     // capas ya añadidas al mapa

function getFirstCoordinate(geojson) {
  const feature = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
  let coords = feature.geometry ? feature.geometry.coordinates : feature.coordinates;
  while (Array.isArray(coords[0])) coords = coords[0];
  return coords; // [x, y]
}

function guessEpsgFromCrsMember(geojson) {
  const name = geojson.crs && geojson.crs.properties && geojson.crs.properties.name;
  if (!name) return null;
  const match = name.match(/EPSG[:]{1,2}(\d+)/i);
  return match ? `EPSG:${match[1]}` : null;
}

function guessEpsgHeuristic(x, y) {
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return { epsg: 'EPSG:4326', confidence: 'heurística: rango de grados' };
  }
  if (x > 4500000 && x < 5500000) {
    return { epsg: 'EPSG:9377', confidence: 'heurística: falso este ≈ 5.000.000 (Origen Nacional)' };
  }
  if (x > 500000 && x < 1500000 && y > 500000 && y < 1500000) {
    return { epsg: 'EPSG:3116', confidence: 'heurística: falso este/norte ≈ 1.000.000 (Bogotá)' };
  }
  if (x > 100000 && x < 900000) {
    return { epsg: 'EPSG:32618', confidence: 'heurística: rango típico UTM (zona por confirmar)' };
  }
  return { epsg: 'EPSG:4326', confidence: 'sin coincidencias claras, revisar manualmente' };
}

function detectCRS(geojson) {
  const declared = guessEpsgFromCrsMember(geojson);
  if (declared) return { epsg: declared, source: `declarado en el archivo (${declared})` };

  const [x, y] = getFirstCoordinate(geojson);
  const guess = guessEpsgHeuristic(x, y);
  return { epsg: guess.epsg, source: guess.confidence };
}

/** Recorre recursivamente coordenadas de cualquier geometría GeoJSON. */
function transformCoordinatesDeep(coords, fromEpsg) {
  if (typeof coords[0] === 'number') {
    const { lat, lon } = convertToWGS84(coords[0], coords[1], fromEpsg);
    return [lon, lat];
  }
  return coords.map((c) => transformCoordinatesDeep(c, fromEpsg));
}

function reprojectGeoJSONToWGS84(geojson, fromEpsg) {
  if (fromEpsg === 'EPSG:4326') return geojson;
  const clone = JSON.parse(JSON.stringify(geojson));
  const features = clone.type === 'FeatureCollection' ? clone.features : [clone];
  features.forEach((f) => {
    f.geometry.coordinates = transformCoordinatesDeep(f.geometry.coordinates, fromEpsg);
  });
  return clone;
}

function addLayerToMap(map, geojson, name, epsg) {
  const layer = L.geoJSON(geojson, {
    style: { color: '#29e2b8', weight: 2, fillOpacity: 0.15 },
  }).addTo(map);

  loadedLayers.push({ name, epsg, layer });
  renderLayersList();
  map.fitBounds(layer.getBounds(), { maxZoom: 14 });
}

function renderLayersList() {
  const list = document.getElementById('layers-list');
  list.innerHTML = '';
  if (loadedLayers.length === 0) {
    list.innerHTML = '<li class="layers-list__empty">Aún no hay capas cargadas.</li>';
    return;
  }
  loadedLayers.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'layer-item';
    li.innerHTML = `<span>${l.name}</span><span class="layer-item__epsg">${l.epsg}</span>`;
    list.appendChild(li);
  });
}

/** Punto de entrada: se llama cuando el usuario elige un archivo. */
function handleFileSelected(file, map) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let geojson;
    try {
      geojson = JSON.parse(e.target.result);
    } catch (err) {
      alert('El archivo no es un GeoJSON válido.');
      return;
    }

    const detection = detectCRS(geojson);
    pendingGeoJSON = { geojson, fileName: file.name };

    const panel = document.getElementById('crs-detect-panel');
    const hint = document.getElementById('crs-detect-hint');
    const select = document.getElementById('crs-detect-select');

    hint.textContent = `Detección: ${detection.source}. Verifica y confirma antes de añadir la capa.`;
    select.innerHTML = '';
    CRS_CATALOG.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.epsg;
      opt.textContent = `${c.label} — ${c.epsg}`;
      if (c.epsg === detection.epsg) opt.selected = true;
      select.appendChild(opt);
    });

    panel.hidden = false;
  };
  reader.readAsText(file);
}

function confirmPendingLayer(map) {
  if (!pendingGeoJSON) return;
  const epsg = document.getElementById('crs-detect-select').value;
  const reprojected = reprojectGeoJSONToWGS84(pendingGeoJSON.geojson, epsg);
  addLayerToMap(map, reprojected, pendingGeoJSON.fileName, epsg);

  // Ejemplo de persistencia opcional en Supabase (ver supabaseClient.js)
  // saveLayerMetadata(pendingGeoJSON.fileName, epsg);

  pendingGeoJSON = null;
  document.getElementById('crs-detect-panel').hidden = true;
  document.getElementById('file-input').value = '';
  document.getElementById('filedrop-label').textContent = 'Seleccionar archivo…';
}
