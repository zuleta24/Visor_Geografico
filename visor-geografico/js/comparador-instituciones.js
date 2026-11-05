/**
 * comparador-instituciones.js
 * ------------------------------------------------------------------
 * Comparador de instituciones para el visor público y el panel de admin.
 *
 * Un botón en la barra del mapa abre una ventana donde se eligen de 2 a 6
 * instituciones y se comparan en cuatro apartados desplegables, cada uno
 * con su diagrama de barras:
 *
 *   1. Estrato
 *   2. Cupos disponibles
 *   3. Docentes
 *   4. Estudiantes
 *
 * Los datos salen de Supabase (instituciones_educativas) y se actualizan
 * solos cuando el administrador crea, edita o borra una institución
 * (evento «instituciones:actualizadas» de tiempo-real-instituciones.js).
 *
 * Uso: <script src="js/comparador-instituciones.js"></script> después de
 * main.js, antes de </body>. API opcional:
 *   ComparadorInstituciones.abrir([ids o nombres])
 *
 * No modifica ningún otro archivo del proyecto.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__comparadorInstituciones) return;   // evita ejecutarse dos veces
  window.__comparadorInstituciones = true;

  const TABLA = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  const MAX = 6;
  const COLORES = ['#69b544', '#f5c324', '#4fb3d9', '#e8833a', '#b07cd8', '#dcdcdc'];

  // ----------------------------------------------------------------
  // Apartados (cada uno con su diagrama de barras)
  // ----------------------------------------------------------------
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const METRICAS = [
    {
      id: 'estrato', titulo: 'Estrato', ayuda: 'Estrato socioeconómico del sector (1 a 6)',
      get: (r) => num(r.estrato), fijo: 6, ticks: [1, 2, 3, 4, 5, 6],
      fmt: (v) => `Estrato ${v}`,
    },
    {
      id: 'cupos', titulo: 'Cupos disponibles', ayuda: 'Cupos que la institución tiene libres',
      get: (r) => num(r.cupos_disponibles !== undefined ? r.cupos_disponibles : r.cupos),
      fmt: (v) => nf(v),
    },
    {
      id: 'docentes', titulo: 'Docentes', ayuda: 'Número de docentes',
      get: (r) => num(r.num_docentes !== undefined ? r.num_docentes : r.docentes),
      fmt: (v) => nf(v),
    },
    {
      id: 'estudiantes', titulo: 'Estudiantes', ayuda: 'Número de estudiantes matriculados',
      get: (r) => num(r.num_estudiantes !== undefined ? r.num_estudiantes : r.estudiantes),
      fmt: (v) => nf(v),
    },
  ];

  // ----------------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------------
  function nf(n) { return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 }); }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function norm(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function cliente() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  }
  function obtenerMapa() {
    const m = (typeof adminMap !== 'undefined' && adminMap) ? adminMap : (typeof map !== 'undefined' ? map : null);
    return m && typeof m.getContainer === 'function' && m._loaded ? m : null;
  }
  const etiquetaTipo = (r) => `${norm(r.tipo) === 'universidad' ? 'Universidad' : 'Colegio'} ${norm(r.sector) === 'privado' ? 'privado' : (norm(r.sector) === 'publico' ? 'público' : '')}`.trim();

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.id = 'estilos-comparador';
  estilos.textContent = `
    .cp-barra.leaflet-bar { border: 0; background: transparent; box-shadow: none; }
    .cp-btn {
      width: 36px; height: 36px; padding: 0; display: grid; place-items: center; cursor: pointer;
      color: var(--text-primary, #eef5ea); background: rgba(6,16,10, .9);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 9px; box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
      transition: color .15s, border-color .15s;
    }
    .cp-btn:hover { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .cp-btn:focus-visible { outline: 2px solid var(--accent, #69b544); outline-offset: 2px; }

    .cp-fondo {
      position: fixed; inset: 0; z-index: 20050; display: none; align-items: flex-start; justify-content: center;
      padding: 24px 16px; overflow-y: auto; background: rgba(3,10,6, .78);
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    }
    .cp-fondo--abierto { display: flex; }
    body.cp-bloqueado { overflow: hidden; }

    .cp-ventana {
      width: min(980px, 100%); margin: auto; display: flex; flex-direction: column; max-height: calc(100vh - 48px);
      color: var(--text-primary, #eef5ea); background: var(--bg-panel-alt, #12291b);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 16px; box-shadow: 0 30px 80px rgba(0, 0, 0, .55);
      overflow: hidden; font-family: var(--font-display, Inter, system-ui, sans-serif);
    }
    .cp-cab { flex: none; display: flex; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid var(--border-subtle, #21412e); }
    .cp-cab h2 { margin: 0; font-size: 20px; font-weight: 700; }
    .cp-cab p { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary, #a3bba8); }
    .cp-cerrar {
      margin-left: auto; width: 34px; height: 34px; flex: none; font-size: 20px; line-height: 1; cursor: pointer;
      color: var(--text-secondary, #a3bba8); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 50%;
    }
    .cp-cerrar:hover { color: var(--text-primary, #eef5ea); border-color: var(--accent, #69b544); }
    .cp-cuerpo { flex: 1 1 auto; min-height: 0; padding: 18px 24px 24px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #2c5640 transparent; }

    .cp-selector { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 18px; margin-bottom: 18px; }
    .cp-titulo-caja { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-secondary, #a3bba8); }
    .cp-filtros { display: grid; grid-template-columns: 1fr 120px; gap: 8px; margin-bottom: 8px; }
    .cp-input, .cp-select {
      width: 100%; height: 38px; padding: 0 11px; font: inherit; font-size: 13px; color-scheme: dark;
      color: var(--text-primary, #eef5ea); background: var(--bg-app, #07130c);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 8px;
    }
    .cp-input:focus, .cp-select:focus { outline: none; border-color: var(--accent, #69b544); box-shadow: 0 0 0 3px rgba(105,181,68, .15); }
    .cp-lista { list-style: none; margin: 0; padding: 4px; max-height: 188px; overflow-y: auto; scrollbar-width: thin; background: rgba(0, 0, 0, .18); border: 1px solid var(--border-subtle, #21412e); border-radius: 10px; }
    .cp-lista label { display: flex; align-items: center; gap: 9px; padding: 7px 9px; font-size: 13px; cursor: pointer; border-radius: 7px; }
    .cp-lista label:hover { background: rgba(255, 255, 255, .05); }
    .cp-lista input { accent-color: var(--accent, #69b544); color-scheme: dark; margin: 0; width: 15px; height: 15px; flex: none; }
    .cp-lista small { display: block; font-size: 11px; color: var(--text-secondary, #a3bba8); }
    .cp-lista input:disabled + span { opacity: .45; }
    .cp-vacio-lista { padding: 14px 10px; font-size: 12px; font-style: italic; color: var(--text-secondary, #a3bba8); }

    .cp-chips { display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; align-content: flex-start; }
    .cp-chip {
      display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 6px 6px 6px 10px; font-size: 12.5px; font-weight: 600;
      background: rgba(255, 255, 255, .05); border: 1px solid var(--chip, #69b544); border-radius: 999px;
    }
    .cp-chip i { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--chip, #69b544); }
    .cp-chip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp-chip button { width: 20px; height: 20px; padding: 0; font-size: 14px; line-height: 1; cursor: pointer; color: var(--text-secondary, #a3bba8); background: transparent; border: 0; border-radius: 50%; }
    .cp-chip button:hover { color: #f87171; }
    .cp-acciones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .cp-boton {
      padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
      color: var(--text-primary, #eef5ea); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 8px;
    }
    .cp-boton:hover:not(:disabled) { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .cp-boton:disabled { opacity: .4; cursor: default; }
    .cp-nota { margin: 8px 0 0; font-size: 12px; color: var(--text-secondary, #a3bba8); }

    .cp-vacio { padding: 34px 16px; text-align: center; font-size: 14px; color: var(--text-secondary, #a3bba8); background: rgba(0, 0, 0, .16); border: 1px dashed var(--border-subtle, #21412e); border-radius: 12px; }
    .cp-vacio strong { display: block; margin-bottom: 4px; font-size: 15px; color: var(--text-primary, #eef5ea); }

    .cp-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 10px; }

    .cp-sec { margin-bottom: 10px; background: rgba(255, 255, 255, .025); border: 1px solid var(--border-subtle, #21412e); border-radius: 12px; overflow: hidden; }
    .cp-sec > summary {
      display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; list-style: none; user-select: none;
    }
    .cp-sec > summary::-webkit-details-marker { display: none; }
    .cp-sec > summary:hover { background: rgba(255, 255, 255, .03); }
    .cp-sec > summary:focus-visible { outline: 2px solid var(--accent, #69b544); outline-offset: -2px; }
    .cp-sec-t { font-size: 15px; font-weight: 700; }
    .cp-sec-r { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-secondary, #a3bba8); text-align: right; }
    .cp-sec-r b { color: var(--accent, #69b544); font-weight: 600; }
    .cp-flecha { flex: none; color: var(--text-secondary, #a3bba8); transition: transform .2s ease; }
    .cp-sec[open] .cp-flecha { transform: rotate(90deg); }
    .cp-grafico { padding: 4px 16px 18px; }
    .cp-ayuda { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary, #a3bba8); }

    .cp-fila { display: grid; grid-template-columns: minmax(110px, 200px) 1fr 84px; align-items: center; gap: 12px; margin-bottom: 9px; }
    .cp-nombre { min-width: 0; padding: 0; text-align: left; font: inherit; font-size: 12.5px; line-height: 1.3; cursor: pointer; color: var(--text-primary, #eef5ea); background: transparent; border: 0; }
    .cp-nombre:hover { color: var(--accent, #69b544); text-decoration: underline; }
    .cp-nombre small { display: block; font-size: 11px; color: var(--text-secondary, #a3bba8); }
    .cp-pista { position: relative; height: 26px; border-radius: 7px; background: rgba(255, 255, 255, .05); overflow: hidden; }
    .cp-pista--ticks { background-image: linear-gradient(to right, transparent calc(100% / 6 - 1px), rgba(255, 255, 255, .1) calc(100% / 6 - 1px), rgba(255, 255, 255, .1) calc(100% / 6)); background-size: calc(100% / 6) 100%; }
    .cp-pista i { display: block; height: 100%; width: 0; border-radius: 7px; background: var(--c); transition: width .6s cubic-bezier(.2, .8, .2, 1); }
    .cp-pista--sin { background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .04) 0 6px, transparent 6px 12px); }
    .cp-valor { font: 700 13px var(--font-mono, 'JetBrains Mono', monospace); text-align: right; }
    .cp-valor--max { color: var(--accent, #69b544); }
    .cp-valor--sin { font-weight: 500; font-size: 11px; color: var(--text-secondary, #a3bba8); }
    .cp-eje { display: grid; grid-template-columns: minmax(110px, 200px) 1fr 84px; gap: 12px; margin-top: 2px; font: 500 10.5px var(--font-mono, monospace); color: var(--text-secondary, #a3bba8); }
    .cp-eje div { display: flex; justify-content: space-between; }
    .cp-eje--estrato div { display: grid; grid-template-columns: repeat(6, 1fr); }
    .cp-eje--estrato span { text-align: right; padding-right: 3px; }

    @media (max-width: 720px) {
      .cp-selector { grid-template-columns: 1fr; }
      .cp-fila, .cp-eje { grid-template-columns: 1fr 64px; }
      .cp-fila .cp-nombre { grid-column: 1 / -1; }
      .cp-eje > span { display: none; }
      .cp-cab, .cp-cuerpo { padding-left: 16px; padding-right: 16px; }
    }
    @media (prefers-reduced-motion: reduce) { .cp-pista i, .cp-flecha { transition: none; } }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Estado y datos
  // ----------------------------------------------------------------
  const estado = {
    filas: [],                 // instituciones leídas de la base
    sel: [],                   // ids elegidos (en orden)
    colores: new Map(),        // id -> color (estable mientras esté elegida)
    busca: '', tipo: '',
    abiertas: new Set(METRICAS.map((m) => m.id)),   // apartados desplegados
    cargado: false,
  };

  async function leerFilas() {
    const c = cliente();
    let data = [];
    if (c) {
      try {
        const r = await c.from(TABLA).select('*').order('nombre');
        if (!r.error && r.data) data = r.data;
      } catch (e) { /* se usa el respaldo */ }
    }
    // Respaldo: puntos del mapa (sin cifras), para que al menos se pueda elegir.
    if (!data.length && typeof institucionesLayers !== 'undefined') {
      Object.entries(institucionesLayers).forEach(([key, g]) => {
        if (!/^(colegio|universidad)-(publico|privado)$/.test(key) || !g.eachLayer) return;
        g.eachLayer((m) => { const p = (m.feature && m.feature.properties) || {}; if (p.nombre) data.push({ id: p.nombre, ...p }); });
      });
    }
    estado.filas = data.filter((r) => r && r.nombre);
    estado.cargado = true;
    // Se quitan las elegidas que ya no existen.
    const ids = new Set(estado.filas.map((r) => String(r.id)));
    estado.sel = estado.sel.filter((id) => ids.has(id));
  }

  const porId = (id) => estado.filas.find((r) => String(r.id) === id);

  function asignarColor(id) {
    if (estado.colores.has(id)) return;
    const usados = new Set(estado.sel.filter((x) => x !== id).map((x) => estado.colores.get(x)));
    estado.colores.set(id, COLORES.find((c) => !usados.has(c)) || COLORES[0]);
  }

  // ----------------------------------------------------------------
  // Ventana
  // ----------------------------------------------------------------
  const fondo = document.createElement('div');
  fondo.className = 'cp-fondo';
  fondo.innerHTML = `
    <div class="cp-ventana" role="dialog" aria-modal="true" aria-labelledby="cp-titulo">
      <div class="cp-cab">
        <div><h2 id="cp-titulo">Comparador de instituciones</h2>
          <p>Elige de 2 a ${MAX} instituciones y compara estrato, cupos, docentes y estudiantes.</p></div>
        <button type="button" class="cp-cerrar" data-cp-cerrar aria-label="Cerrar">×</button>
      </div>
      <div class="cp-cuerpo">
        <div class="cp-selector">
          <div>
            <p class="cp-titulo-caja">Buscar y agregar</p>
            <div class="cp-filtros">
              <input type="search" class="cp-input" data-cp-buscar placeholder="Nombre de la institución…" autocomplete="off" />
              <select class="cp-select" data-cp-tipo aria-label="Tipo">
                <option value="">Todas</option><option value="colegio">Colegios</option><option value="universidad">Universidades</option>
              </select>
            </div>
            <ul class="cp-lista" data-cp-lista></ul>
          </div>
          <div>
            <p class="cp-titulo-caja">Seleccionadas <span data-cp-cuenta></span></p>
            <div class="cp-chips" data-cp-chips></div>
            <div class="cp-acciones">
              <button type="button" class="cp-boton" data-cp-sugeridas>Elegir las 3 más grandes</button>
              <button type="button" class="cp-boton" data-cp-limpiar>Quitar todas</button>
            </div>
          </div>
        </div>
        <div data-cp-resultado></div>
      </div>
    </div>`;
  document.body.appendChild(fondo);

  const q = (s) => fondo.querySelector(s);
  const $buscar = q('[data-cp-buscar]');
  const $tipo = q('[data-cp-tipo]');
  const $lista = q('[data-cp-lista]');
  const $chips = q('[data-cp-chips]');
  const $cuenta = q('[data-cp-cuenta]');
  const $res = q('[data-cp-resultado]');
  const $sugeridas = q('[data-cp-sugeridas]');
  const $limpiar = q('[data-cp-limpiar]');

  let anterior = null;

  async function abrir(inicial) {
    anterior = document.activeElement;
    fondo.classList.add('cp-fondo--abierto');
    document.body.classList.add('cp-bloqueado');
    $res.innerHTML = '<div class="cp-vacio">Cargando instituciones…</div>';
    await leerFilas();
    if (Array.isArray(inicial)) {
      inicial.forEach((x) => {
        const f = estado.filas.find((r) => String(r.id) === String(x) || norm(r.nombre) === norm(x));
        if (f && estado.sel.length < MAX && !estado.sel.includes(String(f.id))) { estado.sel.push(String(f.id)); asignarColor(String(f.id)); }
      });
    }
    renderTodo();
    setTimeout(() => $buscar.focus(), 50);
  }

  function cerrar() {
    fondo.classList.remove('cp-fondo--abierto');
    document.body.classList.remove('cp-bloqueado');
    if (anterior && typeof anterior.focus === 'function') anterior.focus();
  }

  const abierto = () => fondo.classList.contains('cp-fondo--abierto');

  // ----------------------------------------------------------------
  // Dibujo
  // ----------------------------------------------------------------
  function renderLista() {
    const t = norm(estado.busca);
    const filas = estado.filas.filter((r) => (!estado.tipo || norm(r.tipo) === estado.tipo) && (!t || norm(r.nombre).includes(t)));
    const lleno = estado.sel.length >= MAX;
    if (!filas.length) { $lista.innerHTML = '<li class="cp-vacio-lista">Ninguna institución coincide.</li>'; return; }
    $lista.innerHTML = filas.map((r) => {
      const id = String(r.id);
      const marcada = estado.sel.includes(id);
      return `<li><label><input type="checkbox" data-cp-id="${esc(id)}" ${marcada ? 'checked' : ''} ${(!marcada && lleno) ? 'disabled' : ''}>
        <span>${esc(r.nombre)}<small>${esc(etiquetaTipo(r))}</small></span></label></li>`;
    }).join('');
  }

  function renderChips() {
    $cuenta.textContent = `(${estado.sel.length}/${MAX})`;
    $chips.innerHTML = estado.sel.map((id) => {
      const r = porId(id);
      if (!r) return '';
      return `<span class="cp-chip" style="--chip:${estado.colores.get(id)}"><i></i><span title="${esc(r.nombre)}">${esc(r.nombre)}</span>
        <button type="button" data-cp-quitar="${esc(id)}" aria-label="Quitar ${esc(r.nombre)}">×</button></span>`;
    }).join('') || '<span class="cp-nota">Aún no has elegido ninguna.</span>';
    $limpiar.disabled = !estado.sel.length;
    $sugeridas.disabled = estado.filas.length === 0;
  }

  function filaBarra(item, m, max, mayor) {
    const nombre = `<button type="button" class="cp-nombre" data-cp-ver="${esc(item.id)}" title="Ver en el mapa">${esc(item.r.nombre)}<small>${esc(etiquetaTipo(item.r))}</small></button>`;
    if (item.v === null) {
      return `<div class="cp-fila">${nombre}<div class="cp-pista cp-pista--sin" aria-hidden="true"></div><span class="cp-valor cp-valor--sin">Sin dato</span></div>`;
    }
    const ancho = max > 0 ? Math.max(1.5, (item.v / max) * 100) : 0;
    return `<div class="cp-fila">${nombre}
      <div class="cp-pista ${m.ticks ? 'cp-pista--ticks' : ''}" role="img" aria-label="${esc(item.r.nombre)}: ${esc(m.fmt(item.v))}">
        <i style="--c:${item.color}" data-ancho="${ancho}"></i></div>
      <span class="cp-valor ${item.v === mayor ? 'cp-valor--max' : ''}">${esc(m.fmt(item.v))}</span></div>`;
  }

  function seccion(m, elegidas) {
    const items = elegidas.map((r) => ({ id: String(r.id), r, v: m.get(r), color: estado.colores.get(String(r.id)) }));
    const con = items.filter((x) => x.v !== null).sort((a, b) => b.v - a.v);
    const sin = items.filter((x) => x.v === null);
    const mayor = con.length ? con[0].v : null;
    const max = m.fijo || (mayor || 0);

    let resumen = '<span>Sin datos cargados</span>';
    if (con.length) {
      const menor = con[con.length - 1];
      resumen = con.length > 1 && con[0].v !== menor.v
        ? `Mayor: <b>${esc(con[0].r.nombre)}</b> (${esc(m.fmt(con[0].v))}) · Menor: <b>${esc(menor.r.nombre)}</b> (${esc(m.fmt(menor.v))})`
        : `${con.length > 1 ? 'Todas iguales' : 'Valor'}: <b>${esc(m.fmt(con[0].v))}</b>`;
    }

    let eje;
    if (m.ticks) {
      eje = `<div class="cp-eje cp-eje--estrato"><span></span><div>${m.ticks.map((t) => `<span>${t}</span>`).join('')}</div><span></span></div>`;
    } else {
      eje = `<div class="cp-eje"><span></span><div><span>0</span><span>${nf(max / 2)}</span><span>${nf(max)}</span></div><span></span></div>`;
    }

    return `<details class="cp-sec" data-cp-sec="${m.id}" ${estado.abiertas.has(m.id) ? 'open' : ''}>
      <summary><span class="cp-sec-t">${esc(m.titulo)}</span><span class="cp-sec-r">${resumen}</span>
        <svg class="cp-flecha" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary>
      <div class="cp-grafico"><p class="cp-ayuda">${esc(m.ayuda)}</p>
        ${con.concat(sin).map((x) => filaBarra(x, m, max, mayor)).join('')}
        ${con.length ? eje : ''}</div></details>`;
  }

  function renderResultado() {
    const elegidas = estado.sel.map(porId).filter(Boolean);
    if (elegidas.length < 2) {
      $res.innerHTML = `<div class="cp-vacio"><strong>${elegidas.length ? 'Agrega al menos una más' : 'Elige instituciones para compararlas'}</strong>
        Marca de 2 a ${MAX} en la lista, o usa «Elegir las 3 más grandes».</div>`;
      return;
    }
    $res.innerHTML = `<div class="cp-toolbar"><span class="cp-nota" style="margin:0">Comparando ${elegidas.length} instituciones</span>
        <span><button type="button" class="cp-boton" data-cp-abrir-todo>Expandir todo</button>
        <button type="button" class="cp-boton" data-cp-cerrar-todo>Contraer todo</button></span></div>`
      + METRICAS.map((m) => seccion(m, elegidas)).join('');
    animarBarras();
  }

  function animarBarras() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $res.querySelectorAll('i[data-ancho]').forEach((el) => { el.style.width = `${el.dataset.ancho}%`; });
    }));
  }

  function renderTodo() { renderLista(); renderChips(); renderResultado(); }

  // ----------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------
  function elegir(id, si) {
    if (si) {
      if (estado.sel.length >= MAX || estado.sel.includes(id)) return;
      estado.sel.push(id);
      asignarColor(id);
    } else {
      estado.sel = estado.sel.filter((x) => x !== id);
      estado.colores.delete(id);
    }
    renderTodo();
  }

  fondo.addEventListener('click', (e) => {
    const t = e.target;
    if (t === fondo || t.closest('[data-cp-cerrar]')) { cerrar(); return; }
    const quitar = t.closest('[data-cp-quitar]');
    if (quitar) { elegir(quitar.dataset.cpQuitar, false); return; }
    if (t.closest('[data-cp-limpiar]')) { estado.sel = []; estado.colores.clear(); renderTodo(); return; }
    if (t.closest('[data-cp-sugeridas]')) {
      const top = estado.filas
        .map((r) => ({ r, v: METRICAS[3].get(r) }))
        .filter((x) => x.v !== null)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3);
      estado.sel = []; estado.colores.clear();
      (top.length ? top.map((x) => x.r) : estado.filas.slice(0, 3)).forEach((r) => { estado.sel.push(String(r.id)); asignarColor(String(r.id)); });
      renderTodo();
      return;
    }
    if (t.closest('[data-cp-abrir-todo]')) { METRICAS.forEach((m) => estado.abiertas.add(m.id)); renderResultado(); return; }
    if (t.closest('[data-cp-cerrar-todo]')) { estado.abiertas.clear(); renderResultado(); return; }
    const ver = t.closest('[data-cp-ver]');
    if (ver) {
      const r = porId(ver.dataset.cpVer);
      const mapa = obtenerMapa();
      const lat = r && Number(r.latitud); const lng = r && Number(r.longitud);
      if (mapa && Number.isFinite(lat) && Number.isFinite(lng)) {
        cerrar();
        mapa.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
        mapa.flyTo([lat, lng], Math.max(mapa.getZoom(), 17), { duration: 0.8 });
      }
    }
  });

  fondo.addEventListener('change', (e) => {
    const c = e.target.closest('[data-cp-id]');
    if (c) elegir(c.dataset.cpId, c.checked);
  });

  // «toggle» no burbujea: se registra con captura para recordar qué apartados están abiertos.
  fondo.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches || !d.matches('details[data-cp-sec]')) return;
    if (d.open) { estado.abiertas.add(d.dataset.cpSec); animarBarras(); } else estado.abiertas.delete(d.dataset.cpSec);
  }, true);

  $buscar.addEventListener('input', () => { estado.busca = $buscar.value; renderLista(); });
  $tipo.addEventListener('change', () => { estado.tipo = $tipo.value; renderLista(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && abierto()) { e.stopPropagation(); cerrar(); }
  }, true);

  // Si el administrador cambia datos, las barras se actualizan al instante.
  document.addEventListener('instituciones:actualizadas', async () => {
    if (!abierto()) { estado.cargado = false; return; }
    await leerFilas();
    renderTodo();
  });

  // ----------------------------------------------------------------
  // Botón en la barra del mapa
  // ----------------------------------------------------------------
  const ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

  function ponerBoton(mapa) {
    const barra = L.DomUtil.create('div', 'leaflet-bar cp-barra');
    const b = L.DomUtil.create('button', 'cp-btn', barra);
    b.type = 'button';
    b.title = 'Comparar instituciones';
    b.setAttribute('aria-label', 'Comparar instituciones');
    b.innerHTML = ICONO;
    b.addEventListener('click', () => abrir());
    const Ctrl = L.Control.extend({ options: { position: 'topleft' }, onAdd() { L.DomEvent.disableClickPropagation(barra); return barra; } });
    new Ctrl().addTo(mapa);
  }

  (function esperar() {
    const mapa = obtenerMapa();
    if (mapa && window.L) ponerBoton(mapa);
    else setTimeout(esperar, 400);
  })();

  window.ComparadorInstituciones = { abrir, cerrar };
})();