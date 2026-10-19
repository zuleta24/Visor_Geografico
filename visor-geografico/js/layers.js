/**
 * layers.js
 * ------------------------------------------------------------------
 * Carga de archivos (GeoJSON o Shapefile en .zip), detección del CRS
 * de origen, reproyección a WGS84 para dibujado en Leaflet y sincronización.
 * ------------------------------------------------------------------
 */

let pendingGeoJSON = null; // Capa a la espera de confirmación de CRS
let loadedLayers = [];     // Capas añadidas al mapa activo
let currentMap = null;     // Referencia al mapa activo (index o admin)

/** Mantiene/actualiza la referencia del mapa activo */
function setLayerManagerMap(map) {
  currentMap = map;
}

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

function detectEpsgFromPrjText(prjText) {
  if (!prjText) return null;

  const authorityMatches = [...prjText.matchAll(/AUTHORITY\[["']EPSG["'],\s*["']?(\d+)["']?\]/gi)];
  if (authorityMatches.length > 0) {
    const code = authorityMatches[authorityMatches.length - 1][1];
    return { epsg: `EPSG:${code}`, source: `declarado en el .prj (EPSG:${code})` };
  }

  const cmMatch = prjText.match(/PARAMETER\[["']central_meridian["'],\s*(-?[\d.]+)\]/i);
  if (cmMatch) {
    const lonDeg = parseFloat(cmMatch[1]);
    for (const c of CRS_CATALOG) {
      if (c.kind !== 'proyectado') continue;
      const def = proj4.defs(c.epsg);
      if (!def || typeof def.long0 !== 'number') continue;
      const defLonDeg = (def.long0 * 180) / Math.PI;
      if (Math.abs(defLonDeg - lonDeg) < 0.05) {
        return { epsg: c.epsg, source: `parámetros del .prj (meridiano central ≈ ${lonDeg}°)` };
      }
    }
  }

  if (!/PROJCS/i.test(prjText)) {
    return { epsg: 'EPSG:4326', source: '.prj sin proyección (geográfico), se asume WGS84' };
  }

  return null;
}

function detectCRS(geojson, prjText) {
  const fromPrj = detectEpsgFromPrjText(prjText);
  if (fromPrj) return fromPrj;

  const declared = guessEpsgFromCrsMember(geojson);
  if (declared) return { epsg: declared, source: `declarado en el archivo (${declared})` };

  const [x, y] = getFirstCoordinate(geojson);
  const guess = guessEpsgHeuristic(x, y);
  return { epsg: guess.epsg, source: guess.confidence };
}

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

async function parseShapefileZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  const shpName = names.find((n) => n.toLowerCase().endsWith('.shp'));
  if (!shpName) throw new Error('El .zip no contiene un archivo .shp');

  const base = shpName.slice(0, -4).toLowerCase();
  const dbfName = names.find((n) => n.toLowerCase() === base + '.dbf');
  const prjName = names.find((n) => n.toLowerCase() === base + '.prj');
  const cpgName = names.find((n) => n.toLowerCase() === base + '.cpg');

  const shpBuffer = await zip.files[shpName].async('arraybuffer');
  const dbfBuffer = dbfName ? await zip.files[dbfName].async('arraybuffer') : null;
  const prjText = prjName ? await zip.files[prjName].async('text') : null;
  const cpgText = cpgName ? await zip.files[cpgName].async('text') : null;

  const geometries = shp.parseShp(shpBuffer);
  let geojson;
  if (dbfBuffer) {
    const properties = shp.parseDbf(dbfBuffer, cpgText);
    geojson = shp.combine([geometries, properties]);
  } else {
    geojson = {
      type: 'FeatureCollection',
      features: geometries.map((g) => ({ type: 'Feature', properties: {}, geometry: g })),
    };
  }
  return { geojson, prjText };
}

function addLayerToMap(map, geojson, name, epsg) {
  currentMap = map;
  const layer = L.geoJSON(geojson, {
    style: { color: '#29e2b8', weight: 2, fillOpacity: 0.15 },
  }).addTo(map);

  const id = `layer-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  loadedLayers.push({ id, name, epsg, layer, visible: true });
  renderLayersList();
  if (layer.getBounds().isValid()) {
    map.fitBounds(layer.getBounds(), { maxZoom: 14 });
  }
}

function toggleLayerVisibility(id) {
  const entry = loadedLayers.find((l) => l.id === id);
  if (!entry || !currentMap) return;
  entry.visible = !entry.visible;
  if (entry.visible) {
    entry.layer.addTo(currentMap);
  } else {
    currentMap.removeLayer(entry.layer);
  }
  renderLayersList();
}

function removeLayer(id) {
  const index = loadedLayers.findIndex((l) => l.id === id);
  if (index === -1) return;
  if (currentMap) currentMap.removeLayer(loadedLayers[index].layer);
  loadedLayers.splice(index, 1);
  renderLayersList();
}

function renderLayersList() {
  const list = document.getElementById('layers-list');
  if (!list) return;

  list.innerHTML = '';
  if (loadedLayers.length === 0) {
    list.innerHTML = '<li class="layers-list__empty">Aún no hay capas cargadas.</li>';
    return;
  }

  loadedLayers.forEach((l) => {
    const li = document.createElement('li');
    li.className = 'layer-item';

    const info = document.createElement('div');
    info.className = 'layer-item__info';
    info.innerHTML = `<span>${l.name}</span><span class="layer-item__epsg">${l.epsg}</span>`;

    const actions = document.createElement('div');
    actions.className = 'layer-item__actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'layer-item__btn';
    toggleBtn.title = l.visible ? 'Ocultar capa' : 'Mostrar capa';
    toggleBtn.textContent = l.visible ? '●' : '○';
    toggleBtn.addEventListener('click', () => toggleLayerVisibility(l.id));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'layer-item__btn layer-item__btn--danger';
    removeBtn.title = 'Quitar capa';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeLayer(l.id));

    actions.appendChild(toggleBtn);
    actions.appendChild(removeBtn);
    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function presentDetection(geojson, fileName, prjText) {
  const detection = detectCRS(geojson, prjText);
  pendingGeoJSON = { geojson, fileName };

  const panel = document.getElementById('crs-detect-panel');
  const hint = document.getElementById('crs-detect-hint');
  const select = document.getElementById('crs-detect-select');

  if (!panel || !hint || !select) return;

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
}

function handleFileSelected(file, map) {
  setLayerManagerMap(map);
  const ext = file.name.toLowerCase().split('.').pop();

  if (ext === 'zip') {
    file.arrayBuffer()
      .then(parseShapefileZip)
      .then(({ geojson, prjText }) => presentDetection(geojson, file.name, prjText))
      .catch((err) => alert('No se pudo leer el Shapefile: ' + err.message));
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    let geojson;
    try {
      geojson = JSON.parse(e.target.result);
    } catch (err) {
      alert('El archivo no es un GeoJSON válido.');
      return;
    }
    presentDetection(geojson, file.name, null);
  };
  reader.readAsText(file);
}

function confirmPendingLayer(map) {
  if (!pendingGeoJSON) return;
  const select = document.getElementById('crs-detect-select');
  const epsg = select ? select.value : 'EPSG:4326';
  const reprojected = reprojectGeoJSONToWGS84(pendingGeoJSON.geojson, epsg);
  
  // 1. Añade la capa al mapa activo localmente
  addLayerToMap(map, reprojected, pendingGeoJSON.fileName, epsg);

  // 2. Guarda en Supabase si la función global existe
  if (typeof saveLayerMetadata === 'function') {
    saveLayerMetadata(pendingGeoJSON.fileName, epsg, reprojected);
  }

  pendingGeoJSON = null;
  const panel = document.getElementById('crs-detect-panel');
  if (panel) panel.hidden = true;

  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';

  const filedropLabel = document.getElementById('filedrop-label');
  if (filedropLabel) filedropLabel.textContent = 'Seleccionar archivo…';
}

async function loadLayersFromSupabaseDB(map) {
  currentMap = map;
  if (typeof listLayersFromSupabase !== 'function') return;

  const dbLayers = await listLayersFromSupabase();
  if (!dbLayers || dbLayers.length === 0) return;

  dbLayers.forEach((row) => {
    if (row.geojson_data) {
      const yaExiste = loadedLayers.some((l) => l.name === row.name);
      if (!yaExiste) {
        const layer = L.geoJSON(row.geojson_data, {
          style: { color: '#29e2b8', weight: 2, fillOpacity: 0.15 },
        }).addTo(map);

        const id = `layer-db-${row.id || Math.random()}`;
        loadedLayers.push({ id, name: row.name, epsg: row.epsg_code, layer, visible: true });
      }
    }
  });

  renderLayersList();
}

// Objeto global de enlace seguro
window.LayerManager = {
  init: function(map) {
    setLayerManagerMap(map);
    
    // Conectar eventos de archivo e importación si existen en el DOM actual
    const fileInput = document.getElementById('file-input');
    const filedropLabel = document.getElementById('filedrop-label');
    if (fileInput && filedropLabel) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        filedropLabel.textContent = file.name;
        handleFileSelected(file, map);
      });
    }

    const confirmBtn = document.getElementById('crs-detect-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        confirmPendingLayer(map);
      });
    }

    loadLayersFromSupabaseDB(map);
  }
};