/**
 * herramientas-mapa.js
 * ------------------------------------------------------------------
 * Barra de herramientas para el mapa (visor público y panel de admin):
 *
 *   • Capturar coordenadas: cada clic deja un punto numerado con sus
 *     coordenadas en el sistema que elijas (WGS84, MAGNA-SIRGAS, Origen
 *     Nacional, UTM…). Se pueden copiar, y descargar todo en CSV.
 *   • Medir distancia: línea con la longitud de cada tramo y el total.
 *   • Medir área: polígono con área y perímetro.
 *
 * Teclado: Esc cancela, Enter termina, Retroceso quita el último punto.
 *
 * Usa crs.js (CRS_CATALOG, convertFromWGS84, getCrsInfo) si está cargado;
 * si no, trabaja solo en WGS84. No toca ningún otro archivo del proyecto.
 *
 * Uso: <script src="js/herramientas-mapa.js"></script> después de main.js,
 * antes de </body>.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__herramientasMapa) return;   // evita ejecutarse dos veces
  window.__herramientasMapa = true;

  const R_TIERRA = 6371008.8;   // radio medio de la Tierra (m)

  // ----------------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------------
  function esc(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const rad = (g) => g * Math.PI / 180;

  function distanciaM(a, b) {                      // haversine
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function longitudM(pts) {
    let t = 0;
    for (let i = 1; i < pts.length; i += 1) t += distanciaM(pts[i - 1], pts[i]);
    return t;
  }

  /** Área esférica de un polígono (Chamberlain–Duquette), en m². */
  function areaM2(pts) {
    if (pts.length < 3) return 0;
    let suma = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      suma += rad(b.lng - a.lng) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
    }
    return Math.abs(suma * R_TIERRA * R_TIERRA / 2);
  }

  const nf = (n, d) => n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

  function textoDistancia(m) {
    return m < 1000 ? `${nf(m, 1)} m` : `${nf(m / 1000, 3)} km`;
  }

  function textoArea(m2) {
    if (m2 < 10000) return `${nf(m2, 1)} m²`;
    if (m2 < 1e6) return `${nf(m2 / 10000, 2)} ha`;
    return `${nf(m2 / 1e6, 3)} km²`;
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).catch(() => copiarRespaldo(texto));
    }
    return Promise.resolve(copiarRespaldo(texto));
  }
  function copiarRespaldo(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* sin permiso */ }
    ta.remove();
  }

  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ----------------------------------------------------------------
  // Coordenadas en el sistema elegido
  // ----------------------------------------------------------------
  const hayCrs = () => typeof CRS_CATALOG !== 'undefined' && typeof convertFromWGS84 === 'function' && typeof getCrsInfo === 'function';

  function catalogo() {
    return hayCrs() ? CRS_CATALOG : [{ epsg: 'EPSG:4326', label: 'WGS84 (Geográfico)', kind: 'geografico' }];
  }

  function epsgInicial() {
    const actual = typeof currentDisplayEpsg !== 'undefined' ? currentDisplayEpsg : 'EPSG:4326';
    return catalogo().some((c) => c.epsg === actual) ? actual : 'EPSG:4326';
  }

  function enCrs(lat, lng, epsg) {
    if (!hayCrs() || epsg === 'EPSG:4326') {
      return { geo: true, e1: 'Lat', v1: lat, e2: 'Lon', v2: lng, t1: lat.toFixed(6), t2: lng.toFixed(6), u: '°' };
    }
    const info = getCrsInfo(epsg);
    const p = convertFromWGS84(lat, lng, epsg);
    if (info && info.kind === 'geografico') {
      return { geo: true, e1: 'Lat', v1: p.y, e2: 'Lon', v2: p.x, t1: p.y.toFixed(6), t2: p.x.toFixed(6), u: '°' };
    }
    return { geo: false, e1: 'Este (X)', v1: p.x, e2: 'Norte (Y)', v2: p.y, t1: p.x.toFixed(2), t2: p.y.toFixed(2), u: ' m' };
  }

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.id = 'estilos-herramientas-mapa';
  estilos.textContent = `
    .mp-col {
      position: absolute; z-index: 900; top: 12px; left: 56px; bottom: 12px;
      width: 330px; max-width: calc(100% - 72px);
      display: flex; flex-direction: column; gap: 10px;
      pointer-events: none; overflow: hidden;
    }
    .mp-col > * { pointer-events: auto; flex: 0 1 auto; min-height: 0; }

    .hm-barra.leaflet-bar { border: 0; background: transparent; box-shadow: none; display: flex; flex-direction: column; gap: 6px; }
    .hm-btn {
      width: 36px; height: 36px; padding: 0; display: grid; place-items: center;
      color: var(--text-primary, #eef5ea); background: rgba(6,16,10, .9);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 9px; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, .35); transition: color .15s, border-color .15s, background .15s;
    }
    .hm-btn:hover { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .hm-btn--on { color: var(--accent-ink, #08210f); background: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .hm-btn--on:hover { color: var(--accent-ink, #08210f); }
    .hm-btn:focus-visible { outline: 2px solid var(--accent, #69b544); outline-offset: 2px; }
    .hm-sep { height: 1px; margin: 0 6px; background: var(--border-subtle, #21412e); }

    .hm-panel {
      padding: 12px 14px 14px; color: var(--text-primary, #eef5ea); font-size: 13px;
      background: rgba(9,22,14, .96); border: 1px solid var(--border-subtle, #21412e);
      border-radius: 12px; box-shadow: 0 12px 34px rgba(0, 0, 0, .45);
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
      overflow-y: auto; scrollbar-width: thin; scrollbar-color: #2c5640 transparent;
    }
    .hm-panel h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; font-weight: 700; }
    .hm-panel h3::before { content: ""; width: 3px; height: 14px; border-radius: 2px; background: var(--accent, #69b544); }
    .hm-panel h3 .hm-cerrar { margin-left: auto; }
    .hm-ayuda { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: var(--text-secondary, #a3bba8); }
    .hm-valor { margin: 2px 0 10px; font: 600 22px/1.2 var(--font-mono, 'JetBrains Mono', monospace); color: var(--accent, #69b544); }
    .hm-valor small { display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: var(--text-secondary, #a3bba8); }
    .hm-fila { display: flex; gap: 8px; flex-wrap: wrap; }
    .hm-chip {
      padding: 6px 11px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
      color: var(--text-primary, #eef5ea); background: transparent;
      border: 1px solid var(--border-subtle, #21412e); border-radius: 8px;
    }
    .hm-chip:hover:not(:disabled) { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .hm-chip:disabled { opacity: .4; cursor: default; }
    .hm-chip--acento { color: var(--accent, #69b544); border-color: rgba(105,181,68, .5); }
    .hm-chip--peligro:hover:not(:disabled) { color: #f87171; border-color: #f87171; }
    .hm-select {
      width: 100%; margin: 0 0 10px; padding: 8px 10px; font: inherit; font-size: 12px; color-scheme: dark;
      color: var(--text-primary, #eef5ea); background: var(--bg-app, #07130c);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 8px;
    }
    .hm-lista { list-style: none; margin: 0 0 10px; padding: 0; max-height: 190px; overflow-y: auto; scrollbar-width: thin; }
    .hm-lista li {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px; cursor: pointer;
      font: 500 11.5px/1.3 var(--font-mono, monospace); background: rgba(255, 255, 255, .03);
      border: 1px solid rgba(255, 255, 255, .06); border-radius: 7px;
    }
    .hm-lista li:hover { border-color: var(--accent, #69b544); }
    .hm-lista .hm-n { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: var(--accent-ink, #08210f); background: var(--accent, #69b544); font-weight: 700; }
    .hm-lista .hm-txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hm-lista button { flex: none; padding: 2px 7px; font: 600 10px var(--font-display, Inter, sans-serif); color: var(--text-secondary, #a3bba8); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 5px; cursor: pointer; }
    .hm-lista button:hover { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .hm-vacio { margin: 0 0 10px; font-size: 12px; font-style: italic; color: var(--text-secondary, #a3bba8); }
    .hm-cerrar { width: 24px; height: 24px; padding: 0; line-height: 1; font-size: 16px; color: var(--text-secondary, #a3bba8); background: transparent; border: 1px solid var(--border-subtle, #21412e); border-radius: 6px; cursor: pointer; }
    .hm-cerrar:hover { color: var(--text-primary, #eef5ea); border-color: var(--accent, #69b544); }

    .hm-pin {
      width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      color: var(--accent-ink, #08210f); background: var(--accent, #69b544); border: 2px solid #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, .55);
    }
    .hm-pin span { transform: rotate(45deg); font: 700 11px/1 'JetBrains Mono', monospace; }
    .hm-etiqueta {
      padding: 3px 8px; white-space: nowrap; font: 600 11px/1.3 'JetBrains Mono', monospace; color: #eef5ea;
      background: rgba(6,16,10, .92); border: 1px solid #69b544; border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, .45);
      transform: translate(10px, -26px); width: auto !important; height: auto !important;
    }
    .hm-vertice { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid #69b544; }
    .leaflet-container.hm-activo, .leaflet-container.hm-activo .leaflet-interactive { cursor: crosshair !important; }
    /* Con una herramienta activa, las capas dejan pasar el clic al mapa (vías, buffers, puntos…). */
    .leaflet-container.hm-activo .leaflet-interactive { pointer-events: none !important; }
    .hm-popup { font-size: 12px; line-height: 1.55; }
    .hm-popup b { color: var(--accent, #69b544); }
    .hm-popup .hm-mono { font-family: var(--font-mono, monospace); }
    .hm-popup button { margin-top: 6px; padding: 4px 10px; font: 600 11px Inter, sans-serif; cursor: pointer; color: var(--accent, #69b544); background: transparent; border: 1px solid rgba(105,181,68, .5); border-radius: 6px; }
    @media (max-width: 760px) { .mp-col { width: calc(100% - 72px); } }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Mapa y columna de paneles (compartida con el análisis de cobertura)
  // ----------------------------------------------------------------
  function obtenerMapa() {
    const candidato = (typeof adminMap !== 'undefined' && adminMap) ? adminMap : (typeof map !== 'undefined' ? map : null);
    return candidato && typeof candidato.getContainer === 'function' && candidato._loaded ? candidato : null;
  }

  function columnaPaneles(mapa) {
    const cont = mapa.getContainer();
    let col = cont.querySelector(':scope > .mp-col');
    if (!col) {
      col = document.createElement('div');
      col.className = 'mp-col';
      cont.appendChild(col);
      if (window.L && L.DomEvent) {
        L.DomEvent.disableClickPropagation(col);
        L.DomEvent.disableScrollPropagation(col);
      }
    }
    return col;
  }

  // Solo una herramienta de clic activa a la vez (también la usa la simulación de cobertura).
  function activarHerramienta(nombre, apagar) {
    const previa = window.__herramientaMapa;
    if (previa && previa.nombre !== nombre) previa.apagar();
    window.__herramientaMapa = { nombre, apagar };
  }
  function liberarHerramienta(nombre) {
    if (window.__herramientaMapa && window.__herramientaMapa.nombre === nombre) window.__herramientaMapa = null;
  }

  // ----------------------------------------------------------------
  // Iconos
  // ----------------------------------------------------------------
  const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    coords: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    distancia: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
    area: svg('<path d="M4 18 6 6l12-2 2 12z"/><circle cx="4" cy="18" r="1.4"/><circle cx="6" cy="6" r="1.4"/><circle cx="18" cy="4" r="1.4"/><circle cx="20" cy="16" r="1.4"/>'),
    limpiar: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/>'),
  };

  // ----------------------------------------------------------------
  // Inicio
  // ----------------------------------------------------------------
  function iniciar(mapa) {
    const col = columnaPaneles(mapa);

    // Capas propias
    const gPuntos = L.layerGroup().addTo(mapa);
    const gMedidas = L.layerGroup().addTo(mapa);
    const gBorrador = L.layerGroup().addTo(mapa);

    const estado = {
      herramienta: null,        // 'coords' | 'distancia' | 'area' | null
      epsg: epsgInicial(),
      puntos: [],               // capturas: { n, lat, lng, marker }
      borrador: null,           // medición en curso
      medidas: [],              // mediciones terminadas
    };

    // ------------------------------------------------ barra de botones
    const barra = L.DomUtil.create('div', 'leaflet-bar hm-barra');
    const botones = {};
    function boton(id, titulo, icono, alClic) {
      const b = L.DomUtil.create('button', 'hm-btn', barra);
      b.type = 'button';
      b.title = titulo;
      b.setAttribute('aria-label', titulo);
      b.innerHTML = icono;
      b.addEventListener('click', alClic);
      botones[id] = b;
      return b;
    }
    boton('coords', 'Capturar coordenadas', ICONOS.coords, () => alternar('coords'));
    boton('distancia', 'Medir distancia', ICONOS.distancia, () => alternar('distancia'));
    boton('area', 'Medir área', ICONOS.area, () => alternar('area'));
    L.DomUtil.create('div', 'hm-sep', barra);
    boton('limpiar', 'Borrar puntos y mediciones', ICONOS.limpiar, limpiarTodo);

    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        L.DomEvent.disableClickPropagation(barra);
        return barra;
      },
    });
    new Control().addTo(mapa);

    // ------------------------------------------------ panel
    const panel = document.createElement('section');
    panel.className = 'hm-panel';
    panel.hidden = true;
    col.insertBefore(panel, col.firstChild);

    // Los paneles de la columna van a la derecha de la barra de botones.
    function mostrarPanel() {
      panel.hidden = false;
      renderPanel();
    }

    function selectCrs() {
      return `<select class="hm-select" data-crs aria-label="Sistema de coordenadas">${catalogo().map((c) =>
        `<option value="${esc(c.epsg)}"${c.epsg === estado.epsg ? ' selected' : ''}>${esc(c.label)} — ${esc(c.epsg)}</option>`).join('')}</select>`;
    }

    function renderPanel() {
      if (!estado.herramienta && !estado.puntos.length && !estado.medidas.length) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      const h = estado.herramienta;
      let html = '';

      if (h === 'coords' || (!h && estado.puntos.length)) {
        html += `<h3>Coordenadas capturadas<button type="button" class="hm-cerrar" data-cerrar title="Cerrar">×</button></h3>`;
        html += `<p class="hm-ayuda">${h === 'coords' ? 'Haz clic en el mapa para capturar un punto. Pulsa Esc para terminar.' : 'Puntos guardados en el mapa.'}</p>`;
        html += selectCrs();
        if (estado.puntos.length) {
          html += '<ul class="hm-lista" data-lista>' + estado.puntos.map((p) => {
            const c = enCrs(p.lat, p.lng, estado.epsg);
            return `<li data-n="${p.n}" title="Ver en el mapa"><span class="hm-n">${p.n}</span><span class="hm-txt">${c.t1}, ${c.t2}</span><button type="button" data-copiar="${p.n}">Copiar</button></li>`;
          }).join('') + '</ul>';
          html += `<div class="hm-fila"><button type="button" class="hm-chip hm-chip--acento" data-copiar-todo>Copiar todo</button>
                   <button type="button" class="hm-chip" data-csv>Descargar CSV</button>
                   <button type="button" class="hm-chip hm-chip--peligro" data-borrar-puntos>Borrar</button></div>`;
        } else {
          html += '<p class="hm-vacio">Aún no hay puntos.</p>';
        }
      } else if (h === 'distancia' || h === 'area') {
        const esArea = h === 'area';
        const b = estado.borrador;
        const pts = b ? b.pts : [];
        const minimo = esArea ? 3 : 2;
        const total = esArea ? areaM2(b && b.vista ? b.vista : pts) : longitudM(b && b.vista ? b.vista : pts);
        html += `<h3>${esArea ? 'Medir área' : 'Medir distancia'}<button type="button" class="hm-cerrar" data-cerrar title="Cerrar">×</button></h3>`;
        html += `<div class="hm-valor" data-valor>${esArea ? textoArea(total) : textoDistancia(total)}`;
        if (esArea && pts.length >= 2) html += `<small>Perímetro: ${textoDistancia(longitudM([...(b.vista || pts), (b.vista || pts)[0]]))}</small>`;
        else if (!esArea && pts.length >= 2) html += `<small>${pts.length - 1} tramo${pts.length > 2 ? 's' : ''}</small>`;
        html += '</div>';
        html += `<p class="hm-ayuda">Clic para añadir puntos · doble clic o Enter para terminar · Retroceso quita el último · Esc cancela.</p>`;
        html += `<div class="hm-fila"><button type="button" class="hm-chip hm-chip--acento" data-terminar ${pts.length >= minimo ? '' : 'disabled'}>Terminar</button>
                 <button type="button" class="hm-chip" data-deshacer ${pts.length ? '' : 'disabled'}>Quitar último</button></div>`;
        if (estado.medidas.length) {
          html += '<p class="hm-ayuda" style="margin-top:10px">Mediciones: ' + estado.medidas.map((m) => esc(m.texto)).join(' · ') + '</p>';
        }
      } else if (estado.medidas.length) {
        html += `<h3>Mediciones<button type="button" class="hm-cerrar" data-cerrar title="Cerrar">×</button></h3>`;
        html += '<p class="hm-ayuda">' + estado.medidas.map((m) => esc(m.texto)).join(' · ') + '</p>';
      }
      panel.innerHTML = html;
    }

    // Actualiza solo el número grande (evita redibujar el panel en cada movimiento del mouse).
    function actualizarValor() {
      const b = estado.borrador;
      if (!b) return;
      const el = panel.querySelector('[data-valor]');
      if (!el) { renderPanel(); return; }
      const lista = b.vista || b.pts;
      const esArea = estado.herramienta === 'area';
      const total = esArea ? areaM2(lista) : longitudM(lista);
      let sub = '';
      if (esArea && lista.length >= 2) sub = `<small>Perímetro: ${textoDistancia(longitudM([...lista, lista[0]]))}</small>`;
      else if (!esArea && b.pts.length >= 2) sub = `<small>${b.pts.length - 1} tramo${b.pts.length > 2 ? 's' : ''}</small>`;
      el.innerHTML = (esArea ? textoArea(total) : textoDistancia(total)) + sub;
    }

    // ------------------------------------------------ activar / desactivar
    function alternar(nombre) {
      if (estado.herramienta === nombre) desactivar();
      else activar(nombre);
    }

    function activar(nombre) {
      activarHerramienta('hm-' + nombre, desactivar);
      cancelarBorrador();
      estado.herramienta = nombre;
      Object.keys(botones).forEach((k) => botones[k].classList.toggle('hm-btn--on', k === nombre));
      mapa.getContainer().classList.add('hm-activo');
      mapa.doubleClickZoom.disable();
      if (nombre === 'distancia' || nombre === 'area') nuevoBorrador();
      renderPanel();
    }

    function desactivar() {
      cancelarBorrador();
      estado.herramienta = null;
      Object.values(botones).forEach((b) => b.classList.remove('hm-btn--on'));
      mapa.getContainer().classList.remove('hm-activo');
      mapa.doubleClickZoom.enable();
      liberarHerramienta('hm-coords'); liberarHerramienta('hm-distancia'); liberarHerramienta('hm-area');
      renderPanel();
    }

    // ------------------------------------------------ captura de coordenadas
    function popupPunto(p) {
      const c = enCrs(p.lat, p.lng, estado.epsg);
      const w = enCrs(p.lat, p.lng, 'EPSG:4326');
      let html = `<div class="hm-popup"><b>Punto ${p.n}</b><br>`;
      html += `<span class="hm-mono">${c.e1}: ${c.t1}${c.u}<br>${c.e2}: ${c.t2}${c.u}</span><br>`;
      html += `<small>${esc(estado.epsg)}</small>`;
      if (estado.epsg !== 'EPSG:4326') html += `<br><small class="hm-mono">WGS84: ${w.t1}, ${w.t2}</small>`;
      html += `<br><button type="button" data-copiar-popup="${p.n}">Copiar coordenadas</button></div>`;
      return html;
    }

    function agregarPunto(latlng) {
      const n = (estado.puntos.length ? estado.puntos[estado.puntos.length - 1].n : 0) + 1;
      const marker = L.marker(latlng, {
        icon: L.divIcon({ className: '', html: `<div class="hm-pin"><span>${n}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }),
        keyboard: false,
      }).addTo(gPuntos);
      const p = { n, lat: latlng.lat, lng: latlng.lng, marker };
      marker.bindPopup(() => popupPunto(p));
      estado.puntos.push(p);
      marker.openPopup();
      renderPanel();
      const lista = panel.querySelector('[data-lista]');
      if (lista) lista.scrollTop = lista.scrollHeight;
    }

    function textoPunto(p) {
      const c = enCrs(p.lat, p.lng, estado.epsg);
      return `${c.t1}, ${c.t2}`;
    }

    function csvPuntos() {
      const c0 = enCrs(0, 0, estado.epsg);
      const filas = [['n', 'lat_wgs84', 'lon_wgs84', `${c0.geo ? 'lat' : 'este'}_${estado.epsg}`, `${c0.geo ? 'lon' : 'norte'}_${estado.epsg}`]];
      estado.puntos.forEach((p) => {
        const c = enCrs(p.lat, p.lng, estado.epsg);
        filas.push([p.n, p.lat.toFixed(7), p.lng.toFixed(7), c.v1.toFixed(c.geo ? 7 : 3), c.v2.toFixed(c.geo ? 7 : 3)]);
      });
      return filas.map((f) => f.join(',')).join('\n');
    }

    // ------------------------------------------------ mediciones
    const esArea = () => estado.herramienta === 'area';

    function nuevoBorrador() {
      gBorrador.clearLayers();
      const estiloLinea = { color: '#69b544', weight: 3, dashArray: '6 6', interactive: false };
      estado.borrador = {
        pts: [],
        vista: null,
        forma: esArea()
          ? L.polygon([], { ...estiloLinea, fillColor: '#69b544', fillOpacity: 0.15 }).addTo(gBorrador)
          : L.polyline([], estiloLinea).addTo(gBorrador),
        etiqueta: null,
      };
    }

    function cancelarBorrador() {
      gBorrador.clearLayers();
      estado.borrador = null;
    }

    function ponerEtiqueta(texto, latlng) {
      const b = estado.borrador;
      if (b.etiqueta) b.etiqueta.remove();
      b.etiqueta = L.marker(latlng, { icon: L.divIcon({ className: 'hm-etiqueta', html: texto }), interactive: false, keyboard: false }).addTo(gBorrador);
    }

    function dibujarBorrador(extra) {
      const b = estado.borrador;
      if (!b) return;
      b.vista = extra ? [...b.pts, extra] : b.pts;
      b.forma.setLatLngs(b.vista);
      const ult = b.vista[b.vista.length - 1];
      if (ult) {
        ponerEtiqueta(esArea() ? textoArea(areaM2(b.vista)) : textoDistancia(longitudM(b.vista)), ult);
      }
      actualizarValor();
    }

    function agregarVertice(latlng) {
      const b = estado.borrador;
      if (!b) return;
      const ult = b.pts[b.pts.length - 1];
      if (ult && distanciaM(ult, latlng) < 0.5) return;       // el 2.º clic de un doble clic
      b.pts.push(latlng);
      L.marker(latlng, { icon: L.divIcon({ className: '', html: '<div class="hm-vertice"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), interactive: false, keyboard: false }).addTo(gBorrador);
      dibujarBorrador(null);
      renderPanel();
    }

    function quitarUltimoVertice() {
      const b = estado.borrador;
      if (!b || !b.pts.length) return;
      b.pts.pop();
      // se rehacen los vértices dibujados
      gBorrador.clearLayers();
      const forma = b.forma;
      b.forma = esArea()
        ? L.polygon(b.pts, forma.options).addTo(gBorrador)
        : L.polyline(b.pts, forma.options).addTo(gBorrador);
      b.etiqueta = null;
      b.pts.forEach((p) => L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="hm-vertice"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), interactive: false, keyboard: false }).addTo(gBorrador));
      dibujarBorrador(null);
      renderPanel();
    }

    function terminarMedicion() {
      const b = estado.borrador;
      if (!b) return;
      const minimo = esArea() ? 3 : 2;
      if (b.pts.length < minimo) return;

      const pts = b.pts.slice();
      const total = esArea() ? areaM2(pts) : longitudM(pts);
      const texto = esArea() ? textoArea(total) : textoDistancia(total);
      const estilo = { color: '#69b544', weight: 3, interactive: false };
      const grupo = L.layerGroup().addTo(gMedidas);

      if (esArea()) {
        L.polygon(pts, { ...estilo, fillColor: '#69b544', fillOpacity: 0.18 }).addTo(grupo);
      } else {
        L.polyline(pts, estilo).addTo(grupo);
        // etiqueta por tramo
        for (let i = 1; i < pts.length; i += 1) {
          const mid = L.latLng((pts[i - 1].lat + pts[i].lat) / 2, (pts[i - 1].lng + pts[i].lng) / 2);
          L.marker(mid, { icon: L.divIcon({ className: 'hm-etiqueta', html: textoDistancia(distanciaM(pts[i - 1], pts[i])) }), interactive: false, keyboard: false }).addTo(grupo);
        }
      }
      pts.forEach((p) => L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="hm-vertice"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), interactive: false, keyboard: false }).addTo(grupo));
      const ancla = esArea() ? L.latLngBounds(pts).getCenter() : pts[pts.length - 1];
      L.marker(ancla, { icon: L.divIcon({ className: 'hm-etiqueta', html: `<b>${esArea() ? 'Área' : 'Total'}: ${texto}</b>` }), interactive: false, keyboard: false }).addTo(grupo);

      estado.medidas.push({ tipo: esArea() ? 'area' : 'distancia', texto: `${esArea() ? 'Área' : 'Distancia'} ${texto}`, grupo });
      nuevoBorrador();
      renderPanel();
    }

    // ------------------------------------------------ limpiar
    function borrarPuntos() {
      gPuntos.clearLayers();
      estado.puntos = [];
      renderPanel();
    }

    function limpiarTodo() {
      cancelarBorrador();
      gMedidas.clearLayers();
      estado.medidas = [];
      gPuntos.clearLayers();
      estado.puntos = [];
      if (estado.herramienta === 'distancia' || estado.herramienta === 'area') nuevoBorrador();
      renderPanel();
    }

    // ------------------------------------------------ eventos del mapa
    mapa.on('click', (e) => {
      if (estado.herramienta === 'coords') agregarPunto(e.latlng);
      else if (estado.herramienta === 'distancia' || estado.herramienta === 'area') agregarVertice(e.latlng);
    });

    mapa.on('mousemove', (e) => {
      const b = estado.borrador;
      if (!b || !b.pts.length) return;
      dibujarBorrador(e.latlng);
    });

    mapa.on('dblclick', () => {
      if (estado.borrador) terminarMedicion();
    });

    // Si el mapa se redimensiona (p. ej., al ampliarlo) el panel se mantiene dentro.
    document.addEventListener('keydown', (e) => {
      if (!estado.herramienta) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (estado.borrador && estado.borrador.pts.length) { nuevoBorrador(); renderPanel(); }
        else desactivar();
      } else if (e.key === 'Enter') {
        terminarMedicion();
      } else if (e.key === 'Backspace') {
        if (estado.borrador) { e.preventDefault(); quitarUltimoVertice(); }
      }
    });

    // ------------------------------------------------ panel: eventos delegados
    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-cerrar]')) { desactivar(); if (!estado.herramienta) panel.hidden = true; return; }
      if (t.closest('[data-terminar]')) { terminarMedicion(); return; }
      if (t.closest('[data-deshacer]')) { quitarUltimoVertice(); return; }
      if (t.closest('[data-borrar-puntos]')) { borrarPuntos(); return; }
      if (t.closest('[data-copiar-todo]')) {
        copiar(estado.puntos.map((p) => `${p.n}\t${textoPunto(p)}`).join('\n'));
        return;
      }
      if (t.closest('[data-csv]')) { descargar('coordenadas.csv', csvPuntos(), 'text/csv;charset=utf-8'); return; }
      const bc = t.closest('[data-copiar]');
      if (bc) {
        const p = estado.puntos.find((x) => x.n === Number(bc.dataset.copiar));
        if (p) copiar(textoPunto(p));
        return;
      }
      const li = t.closest('li[data-n]');
      if (li) {
        const p = estado.puntos.find((x) => x.n === Number(li.dataset.n));
        if (p) { mapa.panTo([p.lat, p.lng]); p.marker.openPopup(); }
      }
    });

    panel.addEventListener('change', (e) => {
      if (e.target.matches('[data-crs]')) {
        estado.epsg = e.target.value;
        renderPanel();
      }
    });

    // Copiar desde el popup de un punto
    mapa.on('popupopen', (e) => {
      const b = e.popup.getElement() && e.popup.getElement().querySelector('[data-copiar-popup]');
      if (!b) return;
      b.addEventListener('click', () => {
        const p = estado.puntos.find((x) => x.n === Number(b.dataset.copiarPopup));
        if (p) { copiar(textoPunto(p)); b.textContent = '¡Copiado!'; }
      });
    });

    // Se sigue el sistema de coordenadas que el usuario elige en el panel lateral del visor.
    const selectVisor = document.getElementById('display-crs-select');
    if (selectVisor) {
      selectVisor.addEventListener('change', () => {
        if (typeof currentDisplayEpsg !== 'undefined' && catalogo().some((c) => c.epsg === currentDisplayEpsg)) {
          estado.epsg = currentDisplayEpsg;
          renderPanel();
        }
      });
    }

    // API pública, por si otro módulo la necesita
    window.HerramientasMapa = { activar, desactivar, limpiar: limpiarTodo, distanciaM, areaM2 };
  }

  (function esperar() {
    const mapa = obtenerMapa();
    if (mapa && window.L) iniciar(mapa);
    else setTimeout(esperar, 400);
  })();
})();