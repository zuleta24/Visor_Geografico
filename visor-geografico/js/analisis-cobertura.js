/**
 * analisis-cobertura.js
 * ------------------------------------------------------------------
 * Análisis de cobertura educativa para el visor y el panel de admin.
 *
 * Responde: «¿qué tan cerca están las viviendas de una institución?»
 *
 *   • Eliges el radio (300 m – 3 km), el tipo (colegios, universidades),
 *     el sector (públicas, privadas) y si se suman los colegios de OSM.
 *   • Calcula qué porcentaje de las viviendas y del territorio queda
 *     dentro del radio de al menos una institución.
 *   • Desglosa por prioridad y por barrio, y señala las zonas críticas
 *     (grupos de viviendas sin cobertura).
 *   • Dibuja en el mapa los radios, las celdas del territorio sin
 *     cobertura y las viviendas sin cobertura.
 *   • SIMULACIÓN: sugiere la mejor ubicación para una nueva institución
 *     o deja colocarla a mano, y muestra cuánto mejora la cobertura.
 *   • Exporta las viviendas sin cobertura (CSV / GeoJSON).
 *
 * Datos: instituciones desde Supabase (tablas del proyecto) y viviendas
 * desde data/viviendas_priorizadas_colegios.geojson (el mismo archivo
 * que usa viviendas.js; el polígono más grande se toma como límite
 * municipal). Todo se puede ajustar con window.COBERTURA_CONFIG antes de
 * cargar este script.
 *
 * Uso: <script src="js/analisis-cobertura.js"></script> después de
 * main.js, antes de </body>.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__analisisCobertura) return;   // evita ejecutarse dos veces
  window.__analisisCobertura = true;

  const CFG = Object.assign({
    urlViviendas: 'data/viviendas_priorizadas_colegios.geojson',
    tablaOficial: 'instituciones_educativas',
    tablasOsm: ['capa1_colegios_geojson', 'capa2_colegios_detalle_geojson'],
    radioInicialM: 1000,
    celdaM: 120,                 // tamaño de las celdas del territorio
    zonaM: 300,                  // tamaño del agrupamiento de zonas críticas
    areaMinimaLimiteKm2: 3,      // un polígono más grande que esto se toma como límite municipal
    maxSimuladas: 5,
  }, window.COBERTURA_CONFIG || {});

  // ----------------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------------
  function norm(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const nf = (n, d = 0) => Number(n).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (a, b) => (b ? (100 * a) / b : 0);

  /** Distancia en metros (aproximación plana: exacta de sobra a escala de un municipio). */
  function dM(lat1, lng1, lat2, lng2) {
    const kx = Math.cos(((lat1 + lat2) * Math.PI) / 360) * 111320;
    return Math.hypot((lng2 - lng1) * kx, (lat2 - lat1) * 110574);
  }

  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cliente() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  }

  function obtenerMapa() {
    const m = (typeof adminMap !== 'undefined' && adminMap) ? adminMap : (typeof map !== 'undefined' ? map : null);
    return m && typeof m.getContainer === 'function' && m._loaded ? m : null;
  }

  // ----------------------------------------------------------------
  // Geometría del límite y de las viviendas
  // ----------------------------------------------------------------
  function bboxDe(puntos) {
    const b = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
    puntos.forEach((p) => {
      if (p.lat < b.minLat) b.minLat = p.lat;
      if (p.lat > b.maxLat) b.maxLat = p.lat;
      if (p.lng < b.minLng) b.minLng = p.lng;
      if (p.lng > b.maxLng) b.maxLng = p.lng;
    });
    return b;
  }

  function areaBboxKm2(b) {
    return ((b.maxLng - b.minLng) * 111.32 * Math.cos(((b.minLat + b.maxLat) * Math.PI) / 360)) * ((b.maxLat - b.minLat) * 110.574);
  }

  function anillosDe(geom) {
    const salida = [];
    const polis = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    polis.forEach((poli) => poli.forEach((anillo) => salida.push(anillo)));
    return salida;
  }

  function puntoEnAnillos(lng, lat, anillos) {     // regla par-impar (respeta huecos)
    let dentro = false;
    for (let k = 0; k < anillos.length; k += 1) {
      const a = anillos[k];
      for (let i = 0, j = a.length - 1; i < a.length; j = i, i += 1) {
        const xi = a[i][0]; const yi = a[i][1]; const xj = a[j][0]; const yj = a[j][1];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
      }
    }
    return dentro;
  }

  function centroideAnillo(anillo) {
    let sx = 0; let sy = 0;
    anillo.forEach((c) => { sx += c[0]; sy += c[1]; });
    return { lng: sx / anillo.length, lat: sy / anillo.length };
  }

  /** Separa viviendas (puntos / polígonos pequeños) del límite municipal (polígono grande). */
  function interpretarViviendas(geojson) {
    const viv = [];
    const limiteFeat = [];
    (geojson.features || []).forEach((f) => {
      const g = f.geometry;
      if (!g) return;
      const p = f.properties || {};
      if (g.type === 'Point') {
        viv.push({ lng: g.coordinates[0], lat: g.coordinates[1], p });
      } else if (g.type === 'MultiPoint') {
        g.coordinates.forEach((c) => viv.push({ lng: c[0], lat: c[1], p }));
      } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const anillos = anillosDe(g);
        const pts = [];
        anillos.forEach((a) => a.forEach((c) => pts.push({ lng: c[0], lat: c[1] })));
        if (!pts.length) return;
        if (areaBboxKm2(bboxDe(pts)) >= CFG.areaMinimaLimiteKm2) {
          limiteFeat.push(anillos);
        } else {
          const c = centroideAnillo(anillos[0]);
          viv.push({ lng: c.lng, lat: c.lat, p });
        }
      }
    });
    const limite = limiteFeat.length ? [].concat(...limiteFeat) : null;
    return { viv: viv.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)), limite };
  }

  // ----------------------------------------------------------------
  // Datos (se cargan una sola vez; las instituciones se refrescan)
  // ----------------------------------------------------------------
  const datos = {
    viv: null, limite: null, errorViv: null,
    insts: null,
    celdas: null,
  };

  async function cargarViviendas() {
    if (datos.viv) return;
    try {
      const r = await fetch(CFG.urlViviendas);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { viv, limite } = interpretarViviendas(await r.json());
      datos.viv = viv.map((v) => ({
        lat: v.lat, lng: v.lng,
        prio: norm(v.p.prioridad) || 'sin prioridad',
        barrio: (v.p.barrio && String(v.p.barrio).trim()) || '',
        predio: v.p.predio != null ? v.p.predio : '',
      }));
      datos.limite = limite;
    } catch (error) {
      console.warn('[cobertura] No se pudieron leer las viviendas:', error);
      datos.viv = [];
      datos.errorViv = String(error.message || error);
    }
  }

  async function filas(tabla) {
    const c = cliente();
    if (!c) return [];
    try {
      const { data, error } = await c.from(tabla).select('*');
      return error || !data ? [] : data;
    } catch (e) {
      return [];
    }
  }

  function aInst(row, fuente) {
    const lat = Number(row.latitud); const lng = Number(row.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat, lng, fuente,
      nombre: row.nombre || row.name || 'Sin nombre',
      tipo: norm(row.tipo) || 'colegio',
      sector: norm(row.sector),
    };
  }

  /** Lee las instituciones: directorio oficial + (opcional) OSM, sin duplicados cercanos. */
  async function cargarInstituciones(forzar) {
    if (datos.insts && !forzar) return;
    const lista = [];
    const oficiales = (await filas(CFG.tablaOficial)).map((r) => aInst(r, 'oficial')).filter(Boolean);
    lista.push(...oficiales);

    const osm = [];
    for (const t of CFG.tablasOsm) {
      (await filas(t)).forEach((r) => { const i = aInst(r, 'osm'); if (i) osm.push(i); });
    }
    osm.forEach((o) => {
      if (!lista.some((x) => dM(x.lat, x.lng, o.lat, o.lng) < 30)) lista.push(o);
    });

    // Respaldo: si Supabase no respondió, se leen los puntos dibujados en el mapa.
    if (!lista.length && typeof institucionesLayers !== 'undefined') {
      Object.entries(institucionesLayers).forEach(([key, grupo]) => {
        if (!grupo || typeof grupo.eachLayer !== 'function') return;
        const fuente = key.indexOf('osm-') === 0 ? 'osm' : 'oficial';
        grupo.eachLayer((m) => {
          const p = (m.feature && m.feature.properties) || {};
          const ll = m.getLatLng && m.getLatLng();
          if (ll) lista.push({ lat: ll.lat, lng: ll.lng, fuente, nombre: p.nombre || 'Sin nombre', tipo: norm(p.tipo) || 'colegio', sector: norm(p.sector) });
        });
      });
    }
    datos.insts = lista;
  }

  // ----------------------------------------------------------------
  // Malla del territorio
  // ----------------------------------------------------------------
  function construirCeldas() {
    if (datos.celdas) return datos.celdas;
    let b;
    if (datos.limite) {
      const pts = [];
      datos.limite.forEach((a) => a.forEach((c) => pts.push({ lng: c[0], lat: c[1] })));
      b = bboxDe(pts);
    } else {
      const pts = [...(datos.viv || []), ...(datos.insts || [])];
      if (!pts.length) return [];
      b = bboxDe(pts);
      const pad = 0.004;
      b.minLat -= pad; b.maxLat += pad; b.minLng -= pad; b.maxLng += pad;
    }
    const lat0 = (b.minLat + b.maxLat) / 2;
    let s = CFG.celdaM;
    const estimar = (t) => ((b.maxLat - b.minLat) * 110574 / t) * ((b.maxLng - b.minLng) * 111320 * Math.cos((lat0 * Math.PI) / 180) / t);
    while (estimar(s) > 4000) s *= 1.25;
    const dLat = s / 110574;
    const dLng = s / (111320 * Math.cos((lat0 * Math.PI) / 180));
    const celdas = [];
    for (let lat = b.minLat + dLat / 2; lat < b.maxLat; lat += dLat) {
      for (let lng = b.minLng + dLng / 2; lng < b.maxLng; lng += dLng) {
        if (!datos.limite || puntoEnAnillos(lng, lat, datos.limite)) celdas.push({ lat, lng, dLat, dLng });
      }
    }
    datos.celdas = celdas;
    datos.celdaTam = s;
    return celdas;
  }

  // ----------------------------------------------------------------
  // Cálculo
  // ----------------------------------------------------------------
  /** Distancia a la institución más cercana de `lista` (y cuál es). */
  function cercana(lat, lng, lista) {
    let mejor = Infinity; let idx = -1;
    for (let i = 0; i < lista.length; i += 1) {
      const d = dM(lat, lng, lista[i].lat, lista[i].lng);
      if (d < mejor) { mejor = d; idx = i; }
    }
    return { d: mejor, i: idx };
  }

  function calcular(insts, R) {
    const viv = datos.viv || [];
    const celdas = construirCeldas();
    const res = {
      R, insts,
      vivTotal: viv.length, vivCub: 0, sin: [],
      celdasTotal: celdas.length, celdasCub: 0, celdasSin: [],
      prio: {}, barrios: {}, zonas: [], distMedia: 0, distMax: 0,
    };

    let sumaD = 0;
    viv.forEach((v) => {
      const c = cercana(v.lat, v.lng, insts);
      const cubierta = c.d <= R;
      const p = res.prio[v.prio] || (res.prio[v.prio] = { tot: 0, cub: 0 });
      p.tot += 1;
      if (v.barrio) {
        const b = res.barrios[v.barrio] || (res.barrios[v.barrio] = { tot: 0, sin: [] });
        b.tot += 1;
        if (!cubierta) b.sin.push(v);
      }
      if (Number.isFinite(c.d)) { sumaD += c.d; if (c.d > res.distMax) res.distMax = c.d; }
      if (cubierta) { res.vivCub += 1; p.cub += 1; } else {
        res.sin.push({ v, d: c.d, near: c.i >= 0 ? insts[c.i] : null });
      }
    });
    res.distMedia = viv.length ? sumaD / viv.length : 0;

    celdas.forEach((c) => {
      if (cercana(c.lat, c.lng, insts).d <= R) res.celdasCub += 1; else res.celdasSin.push(c);
    });

    // Zonas críticas: grupos de viviendas (o de celdas, si no hay viviendas) sin cobertura.
    const grupos = new Map();
    const lat0 = viv.length ? viv[0].lat : (celdas[0] ? celdas[0].lat : 6.15);
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const fuente = res.sin.length ? res.sin.map((s) => ({ lat: s.v.lat, lng: s.v.lng, barrio: s.v.barrio, d: s.d })) : res.celdasSin.map((c) => ({ lat: c.lat, lng: c.lng, barrio: '', d: 0 }));
    fuente.forEach((p) => {
      const k = `${Math.floor((p.lng * kx) / CFG.zonaM)}_${Math.floor((p.lat * 110574) / CFG.zonaM)}`;
      const g = grupos.get(k) || { n: 0, sLat: 0, sLng: 0, barrios: {}, dSuma: 0, pts: [] };
      g.n += 1; g.sLat += p.lat; g.sLng += p.lng; g.dSuma += p.d;
      if (p.barrio) g.barrios[p.barrio] = (g.barrios[p.barrio] || 0) + 1;
      g.pts.push([p.lat, p.lng]);
      grupos.set(k, g);
    });
    res.zonasDeViviendas = res.sin.length > 0;
    res.zonas = Array.from(grupos.values())
      .map((g) => {
        const top = Object.entries(g.barrios).sort((a, b) => b[1] - a[1])[0];
        return { n: g.n, lat: g.sLat / g.n, lng: g.sLng / g.n, barrio: top ? top[0] : '', dMedia: g.dSuma / g.n, pts: g.pts };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
    return res;
  }

  /** Mejor sitio para una nueva institución: el que cubre más viviendas hoy sin cobertura. */
  function mejorUbicacion(res) {
    const R = res.R;
    const porCubrir = res.sin.length ? res.sin.map((s) => ({ lat: s.v.lat, lng: s.v.lng })) : res.celdasSin.map((c) => ({ lat: c.lat, lng: c.lng }));
    if (!porCubrir.length) return null;

    // Candidatos: un punto por cada cuadro de ~150 m con elementos sin cobertura.
    const cuadros = new Map();
    const kx = 111320 * Math.cos((porCubrir[0].lat * Math.PI) / 180);
    porCubrir.forEach((p) => {
      const k = `${Math.floor((p.lng * kx) / 150)}_${Math.floor((p.lat * 110574) / 150)}`;
      const c = cuadros.get(k) || { sLat: 0, sLng: 0, n: 0 };
      c.sLat += p.lat; c.sLng += p.lng; c.n += 1;
      cuadros.set(k, c);
    });
    let candidatos = Array.from(cuadros.values()).map((c) => ({ lat: c.sLat / c.n, lng: c.sLng / c.n }));
    if (candidatos.length > 700) {
      const paso = Math.ceil(candidatos.length / 700);
      candidatos = candidatos.filter((_, i) => i % paso === 0);
    }

    let mejor = null;
    candidatos.forEach((c) => {
      let n = 0;
      for (let i = 0; i < porCubrir.length; i += 1) {
        if (dM(c.lat, c.lng, porCubrir[i].lat, porCubrir[i].lng) <= R) n += 1;
      }
      if (!mejor || n > mejor.n) mejor = { lat: c.lat, lng: c.lng, n };
    });
    return mejor;
  }

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.id = 'estilos-cobertura';
  estilos.textContent = `
    .cv-panel { width: 100%; }
    .cv-panel[hidden] { display: none !important; }
    .cv-titulo { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 14px; font-weight: 700; }
    .cv-titulo::before { content: ""; width: 3px; height: 15px; border-radius: 2px; background: var(--accent, #69b544); }
    .cv-intro { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--text-secondary, #a3bba8); }
    .cv-campo { display: block; margin: 0 0 10px; }
    .cv-campo > span { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-secondary, #a3bba8); }
    .cv-campo > span b { color: var(--accent, #69b544); font-family: var(--font-mono, monospace); letter-spacing: 0; text-transform: none; }
    .cv-campo input[type=range] { width: 100%; accent-color: var(--accent, #69b544); }
    .cv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cv-check { display: flex; align-items: center; gap: 8px; margin: 2px 0 12px; font-size: 12px; color: var(--text-secondary, #a3bba8); cursor: pointer; }
    .cv-check input { accent-color: var(--accent, #69b544); margin: 0; }
    .cv-boton { width: 100%; height: 38px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; color: var(--accent-ink, #08210f); background: var(--accent, #69b544); border: 0; border-radius: 9px; }
    .cv-boton:hover:not(:disabled) { filter: brightness(1.08); }
    .cv-boton:disabled { opacity: .6; cursor: default; }
    .cv-estado { margin: 8px 0 0; font-size: 12px; color: var(--text-secondary, #a3bba8); }
    .cv-estado--error { color: #f59e0b; }

    .cv-resultados { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle, #21412e); }
    .cv-principal { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
    .cv-principal strong { font: 700 34px/1 var(--font-mono, monospace); }
    .cv-principal span { font-size: 12px; line-height: 1.35; color: var(--text-secondary, #a3bba8); }
    .cv-barra { height: 9px; margin-bottom: 10px; overflow: hidden; border-radius: 6px; background: rgba(255, 255, 255, .08); }
    .cv-barra > i { display: block; height: 100%; border-radius: 6px; }
    .cv-bien { color: #69b544; } .cv-medio { color: #f5c324; } .cv-mal { color: #f87171; }
    .cv-barra .cv-bien { background: #69b544; } .cv-barra .cv-medio { background: #f5c324; } .cv-barra .cv-mal { background: #f87171; }
    .cv-lectura { margin: 0 0 12px; padding: 10px 12px; font-size: 12.5px; line-height: 1.55; color: #d5e3d4; background: rgba(0, 0, 0, .22); border-left: 3px solid var(--accent, #69b544); border-radius: 8px; }
    .cv-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .cv-kpi { padding: 9px 11px; background: rgba(255, 255, 255, .03); border: 1px solid rgba(255, 255, 255, .06); border-radius: 9px; }
    .cv-kpi b { display: block; font: 700 17px/1.2 var(--font-mono, monospace); color: var(--text-primary, #eef5ea); }
    .cv-kpi small { font-size: 11px; color: var(--text-secondary, #a3bba8); }
    .cv-sub { margin: 14px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--text-secondary, #a3bba8); }
    .cv-fila-barra { display: grid; grid-template-columns: 74px 1fr 78px; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
    .cv-fila-barra .cv-barra { margin: 0; height: 7px; }
    .cv-fila-barra em { font: 500 11px var(--font-mono, monospace); font-style: normal; text-align: right; color: var(--text-secondary, #a3bba8); }
    .cv-lista { list-style: none; margin: 0; padding: 0; }
    .cv-lista li { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; padding: 7px 9px; font-size: 12px; cursor: pointer; background: rgba(255, 255, 255, .03); border: 1px solid rgba(255, 255, 255, .06); border-radius: 8px; }
    .cv-lista li:hover { border-color: var(--accent, #69b544); }
    .cv-lista .cv-n { flex: none; min-width: 26px; padding: 1px 6px; text-align: center; font: 700 11px var(--font-mono, monospace); color: #fff; background: #ef4444; border-radius: 999px; }
    .cv-lista .cv-t { flex: 1; min-width: 0; line-height: 1.3; }
    .cv-lista .cv-t small { display: block; color: var(--text-secondary, #a3bba8); }
    .cv-lista .cv-x { flex: none; padding: 2px 7px; font: 600 10px Inter, sans-serif; color: var(--text-secondary, #a3bba8); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 5px; cursor: pointer; }
    .cv-lista .cv-x:hover { color: #f87171; border-color: #f87171; }
    .cv-sim { padding: 10px 12px; background: rgba(245, 195, 36, .08); border: 1px solid rgba(245, 195, 36, .35); border-radius: 10px; }
    .cv-sim p { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: #d5e3d4; }
    .cv-sim .cv-lista li { background: rgba(245, 195, 36, .1); border-color: rgba(245, 195, 36, .3); }
    .cv-sim .cv-n { background: #f5c324; color: #08210f; }
    .cv-sim-delta { font-weight: 700; color: #f5c324; }
    .cv-botones { display: flex; flex-wrap: wrap; gap: 6px; }
    .cv-chip { padding: 6px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-primary, #eef5ea); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 8px; }
    .cv-chip:hover:not(:disabled) { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .cv-chip:disabled { opacity: .4; cursor: default; }
    .cv-chip--on { color: var(--accent-ink, #08210f); background: #f5c324; border-color: #f5c324; }
    .cv-chip--on:hover:not(:disabled) { color: var(--accent-ink, #08210f); }
    .cv-capas { display: flex; flex-direction: column; gap: 5px; }
    .cv-capas label { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }
    .cv-capas input { accent-color: var(--accent, #69b544); margin: 0; }
    .cv-sw { width: 12px; height: 12px; border-radius: 3px; flex: none; }
    .cv-nota { margin: 10px 0 0; font-size: 11px; line-height: 1.5; color: var(--text-secondary, #a3bba8); }
    .cv-sim-marca { width: 24px; height: 24px; display: grid; place-items: center; font: 700 12px 'JetBrains Mono', monospace; color: #08210f; background: #f5c324; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 4px rgba(245, 195, 36, .35), 0 3px 8px rgba(0, 0, 0, .5); cursor: grab; }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Interfaz y mapa
  // ----------------------------------------------------------------
  const ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>';

  function iniciar(mapa) {
    // Columna de paneles compartida con herramientas-mapa.js
    const cont = mapa.getContainer();
    let col = cont.querySelector(':scope > .mp-col');
    if (!col) {
      col = document.createElement('div');
      col.className = 'mp-col';
      cont.appendChild(col);
      L.DomEvent.disableClickPropagation(col);
      L.DomEvent.disableScrollPropagation(col);
    }

    // Panes: debajo de los marcadores, para no tapar popups ni fichas.
    const crearPane = (nombre, z) => {
      if (!mapa.getPane(nombre)) { mapa.createPane(nombre); mapa.getPane(nombre).style.zIndex = z; mapa.getPane(nombre).style.pointerEvents = 'none'; }
    };
    crearPane('coberturaRadios', 405);
    crearPane('coberturaCeldas', 410);
    crearPane('coberturaViviendas', 655);

    const gRadios = L.layerGroup();
    const gCeldas = L.layerGroup();
    const gViv = L.layerGroup();
    const gSim = L.layerGroup().addTo(mapa);
    const gZona = L.layerGroup().addTo(mapa);

    const estado = {
      abierto: false,
      R: CFG.radioInicialM,
      tipo: 'colegio', sector: '', osm: false,
      res: null, resBase: null,
      sims: [],
      colocando: false,
      capas: { radios: true, celdas: true, viv: true },
      primera: true,
    };

    // ---------------- botón en la barra
    const barra = L.DomUtil.create('div', 'leaflet-bar hm-barra');
    const boton = L.DomUtil.create('button', 'hm-btn', barra);
    boton.type = 'button';
    boton.title = 'Análisis de cobertura educativa';
    boton.setAttribute('aria-label', 'Análisis de cobertura educativa');
    boton.innerHTML = ICONO;
    boton.addEventListener('click', () => alternarPanel());
    const Ctrl = L.Control.extend({ options: { position: 'topleft' }, onAdd() { L.DomEvent.disableClickPropagation(barra); return barra; } });
    new Ctrl().addTo(mapa);

    // ---------------- panel
    const panel = document.createElement('section');
    panel.className = 'hm-panel cv-panel';
    panel.hidden = true;
    col.appendChild(panel);

    panel.innerHTML = `
      <h3 class="cv-titulo">Cobertura educativa<button type="button" class="hm-cerrar" data-cerrar title="Cerrar" style="margin-left:auto">×</button></h3>
      <p class="cv-intro">Mide qué viviendas y qué parte del municipio quedan cerca de una institución, y simula dónde ubicar una nueva.</p>

      <label class="cv-campo"><span>Radio de cobertura <b data-radio-txt></b></span>
        <input type="range" data-radio min="300" max="3000" step="100" /></label>

      <div class="cv-grid2">
        <label class="cv-campo"><span>Instituciones</span>
          <select class="hm-select" data-tipo style="margin:0">
            <option value="colegio">Colegios</option>
            <option value="universidad">Universidades</option>
            <option value="">Todas</option>
          </select></label>
        <label class="cv-campo"><span>Sector</span>
          <select class="hm-select" data-sector style="margin:0">
            <option value="">Todos</option>
            <option value="publico">Públicas</option>
            <option value="privado">Privadas</option>
          </select></label>
      </div>
      <label class="cv-check"><input type="checkbox" data-osm /> Sumar colegios de OpenStreetMap (sin sector definido)</label>

      <button type="button" class="cv-boton" data-analizar>Analizar cobertura</button>
      <p class="cv-estado" data-estado hidden></p>
      <div class="cv-resultados" data-resultados hidden></div>
    `;
    const q = (s) => panel.querySelector(s);
    const $radio = q('[data-radio]');
    const $radioTxt = q('[data-radio-txt]');
    const $tipo = q('[data-tipo]');
    const $sector = q('[data-sector]');
    const $osm = q('[data-osm]');
    const $estado = q('[data-estado]');
    const $res = q('[data-resultados]');
    const $analizar = q('[data-analizar]');
    $radio.value = String(estado.R);

    function textoRadio() {
      $radioTxt.textContent = estado.R >= 1000 ? `${nf(estado.R / 1000, estado.R % 1000 ? 1 : 0)} km` : `${estado.R} m`;
    }
    textoRadio();

    function alternarPanel(forzar) {
      estado.abierto = forzar === undefined ? !estado.abierto : forzar;
      panel.hidden = !estado.abierto;
      boton.classList.toggle('hm-btn--on', estado.abierto);
      if (!estado.abierto) apagarColocacion();
    }

    function mensaje(texto, error) {
      $estado.hidden = !texto;
      $estado.textContent = texto || '';
      $estado.classList.toggle('cv-estado--error', Boolean(error));
    }

    // ---------------- instituciones consideradas
    function seleccionadas() {
      return (datos.insts || []).filter((i) => {
        if (i.fuente === 'osm') return estado.osm && (!estado.tipo || estado.tipo === 'colegio');
        if (estado.tipo && i.tipo !== estado.tipo) return false;
        if (estado.sector && i.sector !== estado.sector) return false;
        return true;
      });
    }

    function conSimuladas(lista) {
      return lista.concat(estado.sims.map((s) => ({ lat: s.lat, lng: s.lng, nombre: s.nombre, tipo: 'colegio', sector: '', fuente: 'sim' })));
    }

    // ---------------- análisis
    async function analizar({ silencioso } = {}) {
      if (!silencioso) { $analizar.disabled = true; mensaje('Leyendo instituciones y viviendas…'); }
      await Promise.all([cargarInstituciones(false), cargarViviendas()]);
      $analizar.disabled = false;

      const base = seleccionadas();
      if (!base.length && !estado.sims.length) {
        mensaje('No hay instituciones con esos criterios. Cambia el tipo o el sector.', true);
        $res.hidden = true;
        limpiarCapas();
        return;
      }
      if (!(datos.viv && datos.viv.length) && !construirCeldas().length) {
        mensaje('No se encontraron viviendas ni límite municipal en data/viviendas_priorizadas_colegios.geojson.', true);
        return;
      }
      mensaje('');
      estado.resBase = calcular(base, estado.R);
      estado.res = estado.sims.length ? calcular(conSimuladas(base), estado.R) : estado.resBase;
      render();
      dibujar();
      if (estado.primera) {
        estado.primera = false;
        const b = limiteBounds();
        if (b) mapa.fitBounds(b, { padding: [30, 30] });
      }
    }

    function limiteBounds() {
      if (datos.limite) {
        const pts = [];
        datos.limite.forEach((a) => a.forEach((c) => pts.push([c[1], c[0]])));
        return L.latLngBounds(pts);
      }
      const pts = [...(datos.viv || []).map((v) => [v.lat, v.lng]), ...(datos.insts || []).map((i) => [i.lat, i.lng])];
      return pts.length ? L.latLngBounds(pts) : null;
    }

    // ---------------- lectura automática
    function nombreInst() {
      const t = estado.tipo === 'universidad' ? 'universidad' : (estado.tipo === 'colegio' ? 'colegio' : 'institución');
      const s = estado.sector === 'publico' ? ' pública' : (estado.sector === 'privado' ? ' privada' : '');
      return `${t}${s}`;
    }

    function lectura(res) {
      const radio = res.R >= 1000 ? `${nf(res.R / 1000, res.R % 1000 ? 1 : 0)} km` : `${res.R} m`;
      if (res.vivTotal) {
        const p = pct(res.vivCub, res.vivTotal);
        let t = `Con un radio de <b>${radio}</b>, el <b>${nf(p, 1)}%</b> de las ${nf(res.vivTotal)} viviendas tiene al menos un${nombreInst().indexOf('ción') > -1 ? 'a' : ''} ${nombreInst()} cerca.`;
        if (res.sin.length) {
          const barrios = Object.entries(res.barrios).map(([n, b]) => [n, b.sin.length]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
          t += ` Quedan <b>${nf(res.sin.length)}</b> sin cobertura${barrios.length ? `, sobre todo en ${barrios.map(esc).join(' y ')}` : ''}.`;
        } else {
          t += ' Todas quedan cubiertas.';
        }
        return t;
      }
      return `Con un radio de <b>${radio}</b>, el <b>${nf(pct(res.celdasCub, res.celdasTotal), 1)}%</b> del territorio queda cerca de una ${nombreInst()}.`;
    }

    const clase = (p) => (p >= 85 ? 'cv-bien' : p >= 60 ? 'cv-medio' : 'cv-mal');

    // ---------------- resultados
    function render() {
      const r = estado.res;
      const b = estado.resBase;
      const hayViv = r.vivTotal > 0;
      const principal = hayViv ? pct(r.vivCub, r.vivTotal) : pct(r.celdasCub, r.celdasTotal);
      const terr = pct(r.celdasCub, r.celdasTotal);
      let h = '';

      h += `<div class="cv-principal"><strong class="${clase(principal)}">${nf(principal, 1)}%</strong>
            <span>${hayViv ? 'de las viviendas tienen una institución dentro del radio' : 'del territorio queda dentro del radio de una institución'}</span></div>
            <div class="cv-barra"><i class="${clase(principal)}" style="width:${Math.min(100, principal)}%"></i></div>`;
      h += `<p class="cv-lectura">${lectura(r)}</p>`;

      h += `<div class="cv-kpis">
        <div class="cv-kpi"><b>${nf(r.insts.length)}</b><small>Instituciones consideradas</small></div>
        <div class="cv-kpi"><b>${hayViv ? nf(r.sin.length) : nf(r.celdasSin.length)}</b><small>${hayViv ? 'Viviendas sin cobertura' : 'Celdas sin cobertura'}</small></div>
        <div class="cv-kpi"><b>${r.celdasTotal ? nf(terr, 1) + '%' : '—'}</b><small>Territorio cubierto</small></div>
        <div class="cv-kpi"><b>${hayViv ? nf(r.distMedia) + ' m' : '—'}</b><small>Distancia media a la más cercana</small></div>
      </div>`;

      // por prioridad
      const prios = Object.entries(r.prio);
      if (prios.length > 1 || (prios.length === 1 && prios[0][0] !== 'sin prioridad')) {
        const orden = ['alta', 'media', 'baja'];
        prios.sort((a, c) => (orden.indexOf(a[0]) === -1 ? 9 : orden.indexOf(a[0])) - (orden.indexOf(c[0]) === -1 ? 9 : orden.indexOf(c[0])));
        h += '<div class="cv-sub">Por prioridad</div>';
        prios.forEach(([nombre, v]) => {
          const p = pct(v.cub, v.tot);
          h += `<div class="cv-fila-barra"><span>${esc(nombre.charAt(0).toUpperCase() + nombre.slice(1))}</span>
                <div class="cv-barra"><i class="${clase(p)}" style="width:${p}%"></i></div><em>${nf(v.cub)}/${nf(v.tot)}</em></div>`;
        });
      }

      // por barrio
      const barrios = Object.entries(r.barrios).map(([n, v]) => ({ n, tot: v.tot, sin: v.sin })).filter((x) => x.sin.length).sort((a, c) => c.sin.length - a.sin.length).slice(0, 5);
      if (barrios.length) {
        h += '<div class="cv-sub">Barrios con más viviendas sin cobertura</div><ul class="cv-lista">';
        barrios.forEach((x, i) => {
          h += `<li data-barrio="${i}"><span class="cv-n">${nf(x.sin.length)}</span><span class="cv-t">${esc(x.n)}<small>${nf(pct(x.sin.length, x.tot), 0)}% de ${nf(x.tot)} viviendas</small></span></li>`;
        });
        h += '</ul>';
      }
      estado._barrios = barrios;

      // zonas críticas
      if (r.zonas.length) {
        h += `<div class="cv-sub">Zonas críticas</div><ul class="cv-lista">`;
        r.zonas.forEach((z, i) => {
          h += `<li data-zona="${i}"><span class="cv-n">${nf(z.n)}</span><span class="cv-t">${z.barrio ? esc(z.barrio) : 'Zona ' + (i + 1)}<small>${r.zonasDeViviendas ? `${nf(z.n)} viviendas · a ${nf(z.dMedia)} m de la institución más cercana` : `${nf(z.n)} celdas de territorio sin cobertura`}</small></span></li>`;
        });
        h += '</ul>';
      }

      // simulación
      h += `<div class="cv-sub">Simular una nueva institución</div><div class="cv-sim">`;
      if (estado.sims.length) {
        const antes = hayViv ? pct(b.vivCub, b.vivTotal) : pct(b.celdasCub, b.celdasTotal);
        const ganadas = hayViv ? r.vivCub - b.vivCub : r.celdasCub - b.celdasCub;
        h += `<p>Con ${estado.sims.length} nueva${estado.sims.length > 1 ? 's' : ''}: <span class="cv-sim-delta">${nf(antes, 1)}% → ${nf(principal, 1)}%</span> ·
              <span class="cv-sim-delta">+${nf(ganadas)}</span> ${hayViv ? 'viviendas cubiertas' : 'celdas cubiertas'}.</p>`;
        h += '<ul class="cv-lista">' + estado.sims.map((s, i) =>
          `<li data-ir-sim="${i}"><span class="cv-n">${i + 1}</span><span class="cv-t">${esc(s.nombre)}<small>${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</small></span><button type="button" class="cv-x" data-quitar-sim="${i}">Quitar</button></li>`).join('') + '</ul>';
      } else {
        h += '<p>Mira cuánto mejoraría la cobertura con un nuevo colegio. Puedes pedir la mejor ubicación o elegirla tú en el mapa.</p>';
      }
      const lleno = estado.sims.length >= CFG.maxSimuladas;
      h += `<div class="cv-botones">
        <button type="button" class="cv-chip" data-sugerir ${lleno ? 'disabled' : ''}>Sugerir mejor ubicación</button>
        <button type="button" class="cv-chip ${estado.colocando ? 'cv-chip--on' : ''}" data-colocar ${lleno ? 'disabled' : ''}>${estado.colocando ? 'Haz clic en el mapa…' : 'Colocar en el mapa'}</button>
        ${estado.sims.length ? '<button type="button" class="cv-chip" data-quitar-todas>Quitar todas</button>' : ''}
      </div></div>`;

      // capas
      h += `<div class="cv-sub">Capas del análisis</div><div class="cv-capas">
        <label><input type="checkbox" data-capa="radios" ${estado.capas.radios ? 'checked' : ''}><span class="cv-sw" style="background:rgba(105,181,68,.5);border:1px dashed #8fc374"></span>Radio de cada institución</label>
        ${r.celdasTotal ? `<label><input type="checkbox" data-capa="celdas" ${estado.capas.celdas ? 'checked' : ''}><span class="cv-sw" style="background:rgba(239,68,68,.45)"></span>Territorio sin cobertura</label>` : ''}
        ${hayViv ? `<label><input type="checkbox" data-capa="viv" ${estado.capas.viv ? 'checked' : ''}><span class="cv-sw" style="background:#ef4444;border-radius:50%"></span>Viviendas sin cobertura</label>` : ''}
      </div>`;

      // exportar
      if (hayViv && r.sin.length) {
        h += `<div class="cv-sub">Exportar</div><div class="cv-botones">
          <button type="button" class="cv-chip" data-csv>CSV de viviendas sin cobertura</button>
          <button type="button" class="cv-chip" data-geojson>GeoJSON</button></div>`;
      }
      h += `<div class="cv-botones" style="margin-top:12px"><button type="button" class="cv-chip" data-quitar-analisis>Quitar análisis del mapa</button></div>`;
      h += `<p class="cv-nota">Distancias en línea recta. ${hayViv ? '' : 'No se encontraron viviendas: el análisis usa solo el territorio. '}${datos.limite ? '' : 'No hay límite municipal en los datos: se usó el área que cubren las viviendas y las instituciones. '}El territorio incluye zonas sin población, por eso el dato de viviendas es el más útil para decidir.</p>`;

      $res.innerHTML = h;
      $res.hidden = false;
    }

    // ---------------- dibujo en el mapa
    function limpiarCapas() {
      [gRadios, gCeldas, gViv, gZona].forEach((g) => { g.clearLayers(); if (mapa.hasLayer(g)) mapa.removeLayer(g); });
    }

    function dibujar() {
      const r = estado.res;
      if (!r) return;
      gRadios.clearLayers(); gCeldas.clearLayers(); gViv.clearLayers();

      r.insts.forEach((i) => {
        L.circle([i.lat, i.lng], {
          radius: r.R, pane: 'coberturaRadios', interactive: false,
          color: i.fuente === 'sim' ? '#f5c324' : '#8fc374', weight: 1.2, dashArray: '5 4',
          fillColor: i.fuente === 'sim' ? '#f5c324' : '#69b544', fillOpacity: i.fuente === 'sim' ? 0.14 : 0.08,
        }).addTo(gRadios);
      });

      const lienzoCeldas = L.canvas({ pane: 'coberturaCeldas' });
      r.celdasSin.forEach((c) => {
        L.rectangle([[c.lat - c.dLat / 2, c.lng - c.dLng / 2], [c.lat + c.dLat / 2, c.lng + c.dLng / 2]], {
          renderer: lienzoCeldas, interactive: false, stroke: false, fillColor: '#ef4444', fillOpacity: 0.32,
        }).addTo(gCeldas);
      });

      const lienzoViv = L.canvas({ pane: 'coberturaViviendas' });
      r.sin.slice(0, 6000).forEach((s) => {
        L.circleMarker([s.v.lat, s.v.lng], {
          renderer: lienzoViv, interactive: false, radius: 4, color: '#fff', weight: 1, fillColor: '#ef4444', fillOpacity: 0.95,
        }).addTo(gViv);
      });

      aplicarCapas();
    }

    function aplicarCapas() {
      [['radios', gRadios], ['celdas', gCeldas], ['viv', gViv]].forEach(([k, g]) => {
        if (estado.capas[k] && estado.res) { if (!mapa.hasLayer(g)) mapa.addLayer(g); } else if (mapa.hasLayer(g)) mapa.removeLayer(g);
      });
    }

    // ---------------- simulación
    function marcaSim(s, i) {
      const m = L.marker([s.lat, s.lng], {
        draggable: true, keyboard: false, zIndexOffset: 800,
        icon: L.divIcon({ className: '', html: `<div class="cv-sim-marca">${i + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      }).addTo(gSim);
      m.bindTooltip(`${esc(s.nombre)} (simulada) — arrástrala para moverla`, { direction: 'top', offset: [0, -12] });
      m.on('dragend', () => {
        const p = m.getLatLng();
        s.lat = p.lat; s.lng = p.lng;
        analizar({ silencioso: true });
      });
    }

    function redibujarSims() {
      gSim.clearLayers();
      estado.sims.forEach((s, i) => marcaSim(s, i));
    }

    function agregarSim(lat, lng) {
      if (estado.sims.length >= CFG.maxSimuladas) return;
      estado.sims.push({ lat, lng, nombre: `Nueva institución ${estado.sims.length + 1}` });
      redibujarSims();
      analizar({ silencioso: true });
    }

    function alClicSim(e) { agregarSim(e.latlng.lat, e.latlng.lng); }

    function apagarColocacion() {
      if (!estado.colocando) return;
      estado.colocando = false;
      mapa.off('click', alClicSim);
      mapa.getContainer().classList.remove('hm-activo');
      if (window.__herramientaMapa && window.__herramientaMapa.nombre === 'cv-colocar') window.__herramientaMapa = null;
      if (estado.res) render();
    }

    function encenderColocacion() {
      if (window.__herramientaMapa && window.__herramientaMapa.nombre !== 'cv-colocar') window.__herramientaMapa.apagar();
      window.__herramientaMapa = { nombre: 'cv-colocar', apagar: apagarColocacion };
      estado.colocando = true;
      mapa.on('click', alClicSim);
      mapa.getContainer().classList.add('hm-activo');
      render();
    }

    function sugerir() {
      const r = estado.res;
      const m = mejorUbicacion(r);
      if (!m || !m.n) { mensaje('No hay viviendas sin cobertura que mejorar con ese radio.'); return; }
      agregarSim(m.lat, m.lng);
      mapa.flyTo([m.lat, m.lng], Math.max(mapa.getZoom(), 15), { duration: 0.8 });
    }

    // ---------------- eventos del panel
    $radio.addEventListener('input', () => { estado.R = Number($radio.value); textoRadio(); });
    $radio.addEventListener('change', () => { if (estado.res) analizar({ silencioso: true }); });
    $tipo.addEventListener('change', () => { estado.tipo = $tipo.value; if (estado.res) analizar({ silencioso: true }); });
    $sector.addEventListener('change', () => { estado.sector = $sector.value; if (estado.res) analizar({ silencioso: true }); });
    $osm.addEventListener('change', () => { estado.osm = $osm.checked; if (estado.res) analizar({ silencioso: true }); });
    $analizar.addEventListener('click', () => analizar());

    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-cerrar]')) { alternarPanel(false); return; }
      if (t.closest('[data-sugerir]')) { sugerir(); return; }
      if (t.closest('[data-colocar]')) { estado.colocando ? apagarColocacion() : encenderColocacion(); return; }
      if (t.closest('[data-quitar-todas]')) { estado.sims = []; redibujarSims(); analizar({ silencioso: true }); return; }
      const qs = t.closest('[data-quitar-sim]');
      if (qs) { estado.sims.splice(Number(qs.dataset.quitarSim), 1); redibujarSims(); analizar({ silencioso: true }); return; }
      const ir = t.closest('[data-ir-sim]');
      if (ir) { const s = estado.sims[Number(ir.dataset.irSim)]; if (s) mapa.flyTo([s.lat, s.lng], Math.max(mapa.getZoom(), 15)); return; }
      if (t.closest('[data-quitar-analisis]')) { quitarAnalisis(); return; }
      if (t.closest('[data-csv]')) { exportarCsv(); return; }
      if (t.closest('[data-geojson]')) { exportarGeojson(); return; }
      const zb = t.closest('[data-barrio]');
      if (zb && estado._barrios) {
        const x = estado._barrios[Number(zb.dataset.barrio)];
        if (x) mapa.flyToBounds(L.latLngBounds(x.sin.map((v) => [v.lat, v.lng])), { padding: [60, 60], maxZoom: 17, duration: 0.7 });
        return;
      }
      const zz = t.closest('[data-zona]');
      if (zz) {
        const z = estado.res.zonas[Number(zz.dataset.zona)];
        if (z) {
          gZona.clearLayers();
          L.circle([z.lat, z.lng], { radius: 220, color: '#fbbf24', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(gZona);
          mapa.flyToBounds(L.latLngBounds(z.pts), { padding: [80, 80], maxZoom: 17, duration: 0.7 });
          setTimeout(() => gZona.clearLayers(), 4000);
        }
      }
    });

    panel.addEventListener('change', (e) => {
      const c = e.target.closest('[data-capa]');
      if (c) { estado.capas[c.dataset.capa] = c.checked; aplicarCapas(); }
    });

    function quitarAnalisis() {
      apagarColocacion();
      estado.res = null; estado.resBase = null; estado.sims = [];
      gSim.clearLayers();
      limpiarCapas();
      gSim.addTo(mapa); gZona.addTo(mapa);
      $res.hidden = true;
      mensaje('');
    }

    // ---------------- exportar
    function exportarCsv() {
      const r = estado.res;
      const filas = [['lat', 'lon', 'prioridad', 'barrio', 'predio', 'distancia_m', 'institucion_mas_cercana']];
      r.sin.forEach((s) => filas.push([s.v.lat.toFixed(7), s.v.lng.toFixed(7), s.v.prio, s.v.barrio, s.v.predio, Math.round(s.d), s.near ? s.near.nombre : ''].map((x) => `"${String(x).replace(/"/g, '""')}"`)));
      descargar(`viviendas_sin_cobertura_${r.R}m.csv`, '﻿' + filas.map((f) => f.join(',')).join('\n'), 'text/csv;charset=utf-8');
    }

    function exportarGeojson() {
      const r = estado.res;
      const gj = {
        type: 'FeatureCollection',
        features: r.sin.map((s) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.v.lng, s.v.lat] },
          properties: { prioridad: s.v.prio, barrio: s.v.barrio, predio: s.v.predio, distancia_m: Math.round(s.d), institucion_mas_cercana: s.near ? s.near.nombre : null, radio_m: r.R },
        })),
      };
      descargar(`viviendas_sin_cobertura_${r.R}m.geojson`, JSON.stringify(gj), 'application/geo+json');
    }

    // Si las instituciones cambian (tiempo real), se vuelve a calcular.
    document.addEventListener('instituciones:actualizadas', () => {
      datos.insts = null;
      if (estado.res) analizar({ silencioso: true });
    });

    window.AnalisisCobertura = { abrir: () => alternarPanel(true), analizar, datos, calcular };
  }

  (function esperar() {
    const mapa = obtenerMapa();
    if (mapa && window.L) iniciar(mapa);
    else setTimeout(esperar, 400);
  })();
})();