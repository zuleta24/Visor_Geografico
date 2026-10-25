/**
 * visor-buscador.js
 * ------------------------------------------------------------------
 * Buscador y filtros de instituciones para el visor público.
 *
 * Añade al inicio del panel lateral una sección «Buscar institución»:
 *   - búsqueda por nombre o dirección,
 *   - filtros de tipo (colegio / universidad), sector (público /
 *     privado) y estrato,
 *   - lista de resultados: al pulsar uno, el mapa vuela hasta la
 *     institución, la resalta y abre su ficha.
 *
 * Los filtros muestran u ocultan los puntos del mapa. Se aplican al
 * directorio oficial (las categorías colegio/universidad × público/
 * privado); las capas OSM no tienen sector ni estrato y no se filtran.
 *
 * Se apoya en lo que ya publican instituciones.js y main.js:
 *   - `map`                  (mapa de Leaflet)
 *   - `institucionesLayers`  (un grupo de puntos por categoría)
 *   - `CATEGORIAS_INSTITUCIONES` (colores), opcional
 * Si no los encuentra, usa Supabase como respaldo: el buscador
 * funciona y vuela hasta el punto, pero no filtra los puntos del mapa.
 *
 * Uso: <script src="js/visor-buscador.js"></script> DESPUÉS de main.js.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) {
    console.warn('[visor-buscador] No se encontró el panel lateral (.sidebar); no se activó.');
    return;
  }

  // `map` es la constante global creada en main.js.
  const mapa = (typeof map !== 'undefined') ? map : null;
  if (!mapa) {
    console.warn('[visor-buscador] No se encontró el mapa; carga este script después de main.js.');
    return;
  }

  // ----------------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------------
  function norm(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function aEstrato(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
  }

  const COLOR_POR_DEFECTO = '#29e2b8';
  const ETIQUETA_TIPO = { colegio: 'Colegio', universidad: 'Universidad' };
  const ETIQUETA_SECTOR = { publico: 'Público', privado: 'Privado' };
  const CATEGORIA_OFICIAL = /^(colegio|universidad)-(publico|privado)$/;

  function colorDeCategoria(key) {
    if (typeof CATEGORIAS_INSTITUCIONES !== 'undefined') {
      const cat = CATEGORIAS_INSTITUCIONES.find((c) => c.key === key);
      if (cat) return cat.color;
    }
    return COLOR_POR_DEFECTO;
  }

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.textContent = `
    .buscador__cabecera {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .buscador__contador {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 11px;
      color: var(--text-secondary, #8ea0ba);
      white-space: nowrap;
    }
    .buscador__contador b { color: var(--accent, #29e2b8); }

    .buscador__form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
    .buscador__fila { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .buscador__campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .buscador__campo > span {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--text-secondary, #8ea0ba);
    }
    .buscador__input,
    .buscador__select {
      width: 100%;
      height: 36px;
      padding: 0 10px;
      font: inherit;
      font-size: 13px;
      color: var(--text-primary, #e6edf7);
      background: var(--bg-app, #0b1220);
      border: 1px solid var(--border-subtle, #1e293b);
      border-radius: 8px;
      color-scheme: dark;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    .buscador__input::placeholder { color: #5f7089; }
    .buscador__input:focus,
    .buscador__select:focus {
      outline: none;
      border-color: var(--accent, #29e2b8);
      box-shadow: 0 0 0 3px rgba(41, 226, 184, .15);
    }
    .buscador__select option { background: #121824; color: #e6edf7; }
    .buscador__input--activo,
    .buscador__select--activo { border-color: rgba(41, 226, 184, .6); }

    .buscador__limpiar {
      align-self: end;
      height: 36px;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary, #8ea0ba);
      background: transparent;
      border: 1px solid var(--border-subtle, #1e293b);
      border-radius: 8px;
      cursor: pointer;
      transition: color .15s ease, border-color .15s ease, opacity .15s ease;
    }
    .buscador__limpiar:hover:not(:disabled) { color: var(--accent, #29e2b8); border-color: var(--accent, #29e2b8); }
    .buscador__limpiar:disabled { opacity: .4; cursor: default; }

    .buscador__resultados {
      list-style: none;
      margin: 12px 0 0;
      padding: 0;
      max-height: 232px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .buscador__item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      text-align: left;
      font: inherit;
      color: var(--text-primary, #e6edf7);
      background: var(--bg-app, #0b1220);
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease;
    }
    .buscador__item:hover,
    .buscador__item:focus-visible {
      outline: none;
      border-color: rgba(41, 226, 184, .55);
      background: rgba(41, 226, 184, .06);
    }
    .buscador__punto { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .buscador__texto { display: flex; flex-direction: column; min-width: 0; }
    .buscador__texto strong {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .buscador__texto small { font-size: 11px; color: var(--text-secondary, #8ea0ba); }

    .buscador__mensaje {
      margin: 12px 0 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary, #8ea0ba);
    }
    .buscador__nota { margin: 10px 0 0; font-size: 11px; line-height: 1.45; color: #6b7a90; }

    /* Aro que resalta la institución elegida */
    .buscador-pulso { animation: buscador-pulso 1.1s ease-out infinite; transform-origin: center; transform-box: fill-box; }
    @keyframes buscador-pulso {
      0%   { opacity: .95; transform: scale(.55); }
      100% { opacity: 0;   transform: scale(1.6); }
    }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Estructura
  // ----------------------------------------------------------------
  const panel = document.createElement('section');
  panel.className = 'panel buscador';
  panel.setAttribute('aria-label', 'Buscar institución');
  panel.innerHTML = `
    <div class="buscador__cabecera">
      <h2 class="panel__title" style="margin:0">Buscar institución</h2>
      <span class="buscador__contador" id="buscador-contador" aria-live="polite"></span>
    </div>

    <div class="buscador__form">
      <label class="buscador__campo">
        <span>Nombre o dirección</span>
        <input type="search" id="buscador-texto" class="buscador__input"
               placeholder="Ej. San Martín, Cra 45…" autocomplete="off" />
      </label>

      <div class="buscador__fila">
        <label class="buscador__campo">
          <span>Tipo</span>
          <select id="buscador-tipo" class="buscador__select">
            <option value="">Todos</option>
            <option value="colegio">Colegio</option>
            <option value="universidad">Universidad</option>
          </select>
        </label>
        <label class="buscador__campo">
          <span>Sector</span>
          <select id="buscador-sector" class="buscador__select">
            <option value="">Todos</option>
            <option value="publico">Público</option>
            <option value="privado">Privado</option>
          </select>
        </label>
      </div>

      <div class="buscador__fila">
        <label class="buscador__campo">
          <span>Estrato</span>
          <select id="buscador-estrato" class="buscador__select">
            <option value="">Todos</option>
            <option value="1">Estrato 1</option>
            <option value="2">Estrato 2</option>
            <option value="3">Estrato 3</option>
            <option value="4">Estrato 4</option>
            <option value="5">Estrato 5</option>
            <option value="6">Estrato 6</option>
            <option value="nd">Sin estrato</option>
          </select>
        </label>
        <button type="button" class="buscador__limpiar" id="buscador-limpiar">Limpiar</button>
      </div>
    </div>

    <ul class="buscador__resultados" id="buscador-resultados"></ul>
    <p class="buscador__mensaje" id="buscador-mensaje">Cargando instituciones…</p>
    <p class="buscador__nota" id="buscador-nota" hidden>
      Los filtros se aplican al directorio oficial. Las capas de OpenStreetMap no tienen sector ni estrato y no se filtran.
    </p>
  `;

  const encabezado = sidebar.querySelector('.sidebar__header');
  if (encabezado) encabezado.insertAdjacentElement('afterend', panel);
  else sidebar.prepend(panel);

  const $texto = panel.querySelector('#buscador-texto');
  const $tipo = panel.querySelector('#buscador-tipo');
  const $sector = panel.querySelector('#buscador-sector');
  const $estrato = panel.querySelector('#buscador-estrato');
  const $limpiar = panel.querySelector('#buscador-limpiar');
  const $contador = panel.querySelector('#buscador-contador');
  const $lista = panel.querySelector('#buscador-resultados');
  const $mensaje = panel.querySelector('#buscador-mensaje');
  const $nota = panel.querySelector('#buscador-nota');

  // ----------------------------------------------------------------
  // Registro de instituciones
  // ----------------------------------------------------------------
  /** Cada elemento: { key, grupo, marker, nombre, tipo, sector, direccion, estrato, latlng } */
  let registro = [];
  let usaMarcadores = false;

  function leerDesdeCapas() {
    const salida = [];
    if (typeof institucionesLayers === 'undefined') return salida;

    Object.entries(institucionesLayers).forEach(([key, grupo]) => {
      if (!CATEGORIA_OFICIAL.test(key) || !grupo || typeof grupo.eachLayer !== 'function') return;
      grupo.eachLayer((marker) => {
        const p = (marker.feature && marker.feature.properties) || {};
        const latlng = marker.getLatLng && marker.getLatLng();
        if (!latlng) return;
        salida.push({
          key,
          grupo,
          marker,
          nombre: p.nombre || 'Sin nombre',
          tipo: norm(p.tipo),
          sector: norm(p.sector),
          direccion: p.direccion || '',
          estrato: aEstrato(p.estrato),
          latlng,
        });
      });
    });
    return salida;
  }

  async function leerDesdeSupabase() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];
    const { data, error } = await supabaseClient.from('instituciones_educativas').select('*');
    if (error || !data) {
      console.warn('[visor-buscador] No se pudo leer instituciones_educativas:', error);
      return [];
    }
    return data
      .filter((f) => Number.isFinite(Number(f.latitud)) && Number.isFinite(Number(f.longitud)))
      .map((f) => ({
        key: `${norm(f.tipo)}-${norm(f.sector)}`,
        grupo: null,
        marker: null,
        nombre: f.nombre || 'Sin nombre',
        tipo: norm(f.tipo),
        sector: norm(f.sector),
        direccion: f.direccion || '',
        estrato: aEstrato(f.estrato),
        latlng: L.latLng(Number(f.latitud), Number(f.longitud)),
      }));
  }

  // ----------------------------------------------------------------
  // Filtrado
  // ----------------------------------------------------------------
  function leerFiltros() {
    return {
      texto: norm($texto.value),
      tipo: $tipo.value,
      sector: $sector.value,
      estrato: $estrato.value,
    };
  }

  function hayFiltros(f) {
    return Boolean(f.texto || f.tipo || f.sector || f.estrato);
  }

  function coincide(r, f) {
    if (f.tipo && r.tipo !== f.tipo) return false;
    if (f.sector && r.sector !== f.sector) return false;
    if (f.estrato === 'nd' && r.estrato !== null) return false;
    if (f.estrato && f.estrato !== 'nd' && r.estrato !== Number(f.estrato)) return false;
    if (f.texto && !(norm(r.nombre).includes(f.texto) || norm(r.direccion).includes(f.texto))) return false;
    return true;
  }

  function descripcion(r) {
    const partes = [ETIQUETA_TIPO[r.tipo] || r.tipo, ETIQUETA_SECTOR[r.sector] || r.sector];
    partes.push(r.estrato ? `Estrato ${r.estrato}` : 'Sin estrato');
    return partes.filter(Boolean).join(' · ');
  }

  function pintarResultados(visibles, activo) {
    $lista.innerHTML = '';

    if (!activo) {
      $mensaje.textContent = 'Escribe un nombre o usa los filtros para ver resultados.';
      $mensaje.hidden = false;
      return;
    }

    if (!visibles.length) {
      $mensaje.textContent = 'Ninguna institución coincide. Prueba con otra búsqueda o pulsa «Limpiar».';
      $mensaje.hidden = false;
      return;
    }

    $mensaje.hidden = true;
    const orden = visibles.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    orden.forEach((r) => {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'buscador__item';
      boton.innerHTML = `
        <span class="buscador__punto" style="background:${esc(colorDeCategoria(r.key))}"></span>
        <span class="buscador__texto">
          <strong title="${esc(r.nombre)}">${esc(r.nombre)}</strong>
          <small>${esc(descripcion(r))}</small>
        </span>`;
      boton.addEventListener('click', () => seleccionar(r));
      li.appendChild(boton);
      $lista.appendChild(li);
    });
  }

  function aplicar({ ajustar = false } = {}) {
    const filtros = leerFiltros();
    const activo = hayFiltros(filtros);
    const visibles = [];

    registro.forEach((r) => {
      const mostrar = coincide(r, filtros);
      if (r.marker && r.grupo) {
        const presente = r.grupo.hasLayer(r.marker);
        if (mostrar && !presente) r.grupo.addLayer(r.marker);
        if (!mostrar && presente) r.grupo.removeLayer(r.marker);
      }
      if (mostrar) visibles.push(r);
    });

    $texto.classList.toggle('buscador__input--activo', Boolean(filtros.texto));
    [$tipo, $sector, $estrato].forEach((s) => s.classList.toggle('buscador__select--activo', s.value !== ''));
    $limpiar.disabled = !activo;
    $nota.hidden = !(activo && usaMarcadores);
    $contador.innerHTML = `<b>${visibles.length}</b> de ${registro.length}`;

    pintarResultados(visibles, activo);

    if (ajustar && activo && visibles.length) {
      const limites = L.latLngBounds(visibles.map((r) => r.latlng));
      mapa.flyToBounds(limites, { padding: [60, 60], maxZoom: 17, duration: 0.8 });
    }
  }

  // ----------------------------------------------------------------
  // Elegir un resultado
  // ----------------------------------------------------------------
  function pulso(latlng) {
    const aro = L.circleMarker(latlng, {
      radius: 22,
      color: COLOR_POR_DEFECTO,
      weight: 3,
      fill: false,
      interactive: false,
      className: 'buscador-pulso',
    }).addTo(mapa);
    setTimeout(() => aro.remove(), 3200);
  }

  function abrirFicha(r) {
    if (!r.marker) return;
    try {
      r.marker.fire('click', { latlng: r.latlng });
    } catch (error) {
      console.warn('[visor-buscador] No se pudo abrir la ficha automáticamente:', error);
      try { r.marker.openPopup(); } catch (_) { /* sin popup asociado */ }
    }
  }

  function seleccionar(r) {
    // Si su categoría estaba apagada en «Capas del mapa», se enciende.
    const casilla = document.querySelector(`input[data-category="${r.key}"]`);
    if (casilla && !casilla.checked) {
      casilla.checked = true;
      casilla.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (r.marker && r.grupo && !r.grupo.hasLayer(r.marker)) r.grupo.addLayer(r.marker);

    mapa.flyTo(r.latlng, Math.max(mapa.getZoom(), 17), { duration: 0.8 });
    pulso(r.latlng);
    setTimeout(() => abrirFicha(r), 950);
  }

  // ----------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------
  let temporizador = null;
  $texto.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aplicar(), 150);
  });

  $texto.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const filtros = leerFiltros();
    const coincidencias = registro.filter((r) => coincide(r, filtros));
    if (hayFiltros(filtros) && coincidencias.length === 1) seleccionar(coincidencias[0]);
    else aplicar({ ajustar: true });
  });

  [$tipo, $sector, $estrato].forEach((s) => s.addEventListener('change', () => aplicar({ ajustar: true })));

  $limpiar.addEventListener('click', () => {
    $texto.value = '';
    $tipo.value = '';
    $sector.value = '';
    $estrato.value = '';
    aplicar();
    $texto.focus();
  });

  // ----------------------------------------------------------------
  // Arranque: esperar a que instituciones.js termine de cargar los puntos
  // ----------------------------------------------------------------
  function iniciar(datos, conMarcadores) {
    registro = datos;
    usaMarcadores = conMarcadores;
    aplicar();
  }

  $limpiar.disabled = true;

  // Si las instituciones se redibujan (cambio hecho desde administración), se vuelven a leer.
  document.addEventListener('instituciones:actualizadas', () => {
    const datos = leerDesdeCapas();
    if (datos.length) iniciar(datos, true);
  });

  const INTERVALO_MS = 400;
  const ESPERA_MAXIMA_MS = 20000;
  const inicio = Date.now();

  (function esperar() {
    const datos = leerDesdeCapas();
    if (datos.length) {
      iniciar(datos, true);
      return;
    }
    if (Date.now() - inicio < ESPERA_MAXIMA_MS) {
      setTimeout(esperar, INTERVALO_MS);
      return;
    }
    // Respaldo: las capas no están disponibles; se lee el directorio directamente.
    leerDesdeSupabase().then((datosRespaldo) => {
      if (datosRespaldo.length) {
        iniciar(datosRespaldo, false);
      } else {
        $mensaje.textContent = 'No se pudieron cargar las instituciones.';
      }
    });
  })();
})();