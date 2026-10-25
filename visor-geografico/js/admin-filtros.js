/**
 * admin-filtros.js
 * ------------------------------------------------------------------
 * Barra de filtros para la tabla de instituciones del panel de
 * administración: búsqueda por nombre/dirección, tipo (colegio o
 * universidad), sector (público o privado) y estrato.
 *
 * Es independiente del resto de la página:
 *  - Lee las columnas de la tabla ya dibujada (por el texto de su
 *    encabezado), así que no depende de cómo se cargue la información.
 *  - Reaplica los filtros cada vez que la tabla se vuelve a dibujar
 *    (al guardar, editar o borrar una institución).
 *  - Inyecta su propio CSS, usando las variables de css/style.css.
 *
 * Uso: <script src="js/admin-filtros.js"></script> antes de </body>.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const tabla = document.querySelector('.admin-table');
  const tbody = document.getElementById('admin-tabla-body') || (tabla && tabla.tBodies[0]);
  const contenedorTabla = document.querySelector('.admin-table-wrap') || (tabla && tabla.parentElement);

  if (!tabla || !tbody || !contenedorTabla) {
    console.warn('[admin-filtros] No se encontró la tabla de instituciones; los filtros no se activaron.');
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

  const encabezados = Array.from(tabla.querySelectorAll('thead th')).map((th) => norm(th.textContent));
  const col = {
    nombre: encabezados.indexOf('nombre'),
    tipo: encabezados.indexOf('tipo'),
    sector: encabezados.indexOf('sector'),
    direccion: encabezados.indexOf('direccion'),
    estrato: encabezados.indexOf('estrato'),
  };

  function celda(fila, indice) {
    return indice >= 0 && fila.cells[indice] ? fila.cells[indice].textContent : '';
  }

  // ----------------------------------------------------------------
  // Estilos (usan las variables del proyecto, con valores de respaldo)
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.textContent = `
    .admin-filtros {
      margin: 0 0 16px;
      padding: 16px 18px 18px;
      background: var(--bg-panel-alt, #121824);
      border: 1px solid var(--border-subtle, #1e293b);
      border-radius: 12px;
    }
    .admin-filtros__cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .admin-filtros__titulo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary, #e6edf7);
    }
    .admin-filtros__titulo::before {
      content: "";
      width: 3px;
      height: 16px;
      border-radius: 2px;
      background: var(--accent, #29e2b8);
    }
    .admin-filtros__contador {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 12px;
      color: var(--text-secondary, #8ea0ba);
    }
    .admin-filtros__contador b { color: var(--accent, #29e2b8); font-weight: 700; }

    .admin-filtros__grid {
      display: grid;
      grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto;
      gap: 12px;
      align-items: end;
    }
    .admin-filtros__campo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .admin-filtros__campo > span {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--text-secondary, #8ea0ba);
    }
    .admin-filtros__input,
    .admin-filtros__select {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      font: inherit;
      font-size: 14px;
      color: var(--text-primary, #e6edf7);
      background: var(--bg-app, #0b1220);
      border: 1px solid var(--border-subtle, #1e293b);
      border-radius: 8px;
      color-scheme: dark;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    .admin-filtros__input::placeholder { color: #5f7089; }
    .admin-filtros__input:focus,
    .admin-filtros__select:focus {
      outline: none;
      border-color: var(--accent, #29e2b8);
      box-shadow: 0 0 0 3px rgba(41, 226, 184, .15);
    }
    .admin-filtros__select option { background: #121824; color: #e6edf7; }
    .admin-filtros__select--activo,
    .admin-filtros__input--activo { border-color: rgba(41, 226, 184, .6); }

    .admin-filtros__limpiar {
      height: 40px;
      padding: 0 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary, #8ea0ba);
      background: transparent;
      border: 1px solid var(--border-subtle, #1e293b);
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: color .15s ease, border-color .15s ease, opacity .15s ease;
    }
    .admin-filtros__limpiar:hover:not(:disabled) {
      color: var(--accent, #29e2b8);
      border-color: var(--accent, #29e2b8);
    }
    .admin-filtros__limpiar:disabled { opacity: .4; cursor: default; }

    .admin-filtros__vacio {
      margin: 0 0 16px;
      padding: 28px 16px;
      text-align: center;
      font-size: 14px;
      color: var(--text-secondary, #8ea0ba);
      background: var(--bg-panel-alt, #121824);
      border: 1px dashed var(--border-subtle, #1e293b);
      border-radius: 12px;
    }
    .admin-filtros__vacio strong { color: var(--text-primary, #e6edf7); }

    .admin-table tbody tr[hidden] { display: none !important; }

    /* Columna de acciones: que sea una celda normal para que las líneas
       de la tabla queden alineadas con el resto de la fila. */
    .admin-table td.admin-table__acciones {
      display: table-cell;
      white-space: nowrap;
      vertical-align: middle;
    }
    .admin-table td.admin-table__acciones .admin-table__btn + .admin-table__btn { margin-left: 6px; }

    @media (max-width: 980px) {
      .admin-filtros__grid { grid-template-columns: 1fr 1fr; }
      .admin-filtros__campo--busqueda { grid-column: 1 / -1; }
      .admin-filtros__limpiar { grid-column: 1 / -1; }
    }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Barra de filtros
  // ----------------------------------------------------------------
  const barra = document.createElement('section');
  barra.className = 'admin-filtros';
  barra.setAttribute('aria-label', 'Filtros de instituciones');
  barra.innerHTML = `
    <div class="admin-filtros__cabecera">
      <h3 class="admin-filtros__titulo">Filtrar instituciones</h3>
      <span class="admin-filtros__contador" id="filtros-contador" aria-live="polite"></span>
    </div>

    <div class="admin-filtros__grid">
      <label class="admin-filtros__campo admin-filtros__campo--busqueda">
        <span>Buscar</span>
        <input type="search" id="filtro-texto" class="admin-filtros__input"
               placeholder="Nombre o dirección…" autocomplete="off" />
      </label>

      <label class="admin-filtros__campo">
        <span>Tipo</span>
        <select id="filtro-tipo" class="admin-filtros__select">
          <option value="">Todos</option>
          <option value="colegio">Colegio</option>
          <option value="universidad">Universidad</option>
        </select>
      </label>

      <label class="admin-filtros__campo">
        <span>Sector</span>
        <select id="filtro-sector" class="admin-filtros__select">
          <option value="">Todos</option>
          <option value="publico">Público</option>
          <option value="privado">Privado</option>
        </select>
      </label>

      <label class="admin-filtros__campo">
        <span>Estrato</span>
        <select id="filtro-estrato" class="admin-filtros__select">
          <option value="">Todos</option>
          <option value="1">Estrato 1</option>
          <option value="2">Estrato 2</option>
          <option value="3">Estrato 3</option>
          <option value="4">Estrato 4</option>
          <option value="5">Estrato 5</option>
          <option value="6">Estrato 6</option>
          <option value="nd">Sin estrato (N/D)</option>
        </select>
      </label>

      <button type="button" id="filtros-limpiar" class="admin-filtros__limpiar">Limpiar filtros</button>
    </div>
  `;
  contenedorTabla.parentNode.insertBefore(barra, contenedorTabla);

  // Mensaje cuando ninguna fila cumple los filtros (fuera del <tbody>,
  // para que no se borre cuando la tabla se vuelve a dibujar).
  const vacio = document.createElement('p');
  vacio.className = 'admin-filtros__vacio';
  vacio.hidden = true;
  vacio.innerHTML = '<strong>Ninguna institución coincide con los filtros.</strong><br>Prueba con otra búsqueda o pulsa «Limpiar filtros».';
  contenedorTabla.parentNode.insertBefore(vacio, contenedorTabla.nextSibling);

  const $texto = barra.querySelector('#filtro-texto');
  const $tipo = barra.querySelector('#filtro-tipo');
  const $sector = barra.querySelector('#filtro-sector');
  const $estrato = barra.querySelector('#filtro-estrato');
  const $limpiar = barra.querySelector('#filtros-limpiar');
  const $contador = barra.querySelector('#filtros-contador');

  // ----------------------------------------------------------------
  // Lógica de filtrado
  // ----------------------------------------------------------------
  function esFilaDeDatos(fila) {
    return !fila.querySelector('.admin-table__vacio');
  }

  function estratoDeFila(fila) {
    const valor = norm(celda(fila, col.estrato));
    return /^[1-6]$/.test(valor) ? valor : 'nd';
  }

  function aplicarFiltros() {
    const texto = norm($texto.value);
    const tipo = $tipo.value;
    const sector = $sector.value;
    const estrato = $estrato.value;

    const filas = Array.from(tbody.rows).filter(esFilaDeDatos);
    let visibles = 0;

    filas.forEach((fila) => {
      const coincideTexto = !texto
        || norm(celda(fila, col.nombre)).includes(texto)
        || norm(celda(fila, col.direccion)).includes(texto);
      const coincideTipo = !tipo || norm(celda(fila, col.tipo)) === tipo;
      const coincideSector = !sector || norm(celda(fila, col.sector)) === sector;
      const coincideEstrato = !estrato || estratoDeFila(fila) === estrato;

      const mostrar = coincideTexto && coincideTipo && coincideSector && coincideEstrato;
      if (fila.hidden === mostrar) fila.hidden = !mostrar;   // evita escrituras innecesarias
      if (mostrar) visibles += 1;
    });

    const hayFiltros = Boolean(texto || tipo || sector || estrato);

    $texto.classList.toggle('admin-filtros__input--activo', Boolean(texto));
    [$tipo, $sector, $estrato].forEach((sel) =>
      sel.classList.toggle('admin-filtros__select--activo', sel.value !== ''));
    $limpiar.disabled = !hayFiltros;

    if (!filas.length) {
      $contador.textContent = '';
      vacio.hidden = true;
    } else {
      $contador.innerHTML = `Mostrando <b>${visibles}</b> de ${filas.length}`;
      vacio.hidden = visibles > 0;
    }
  }

  [$texto, $tipo, $sector, $estrato].forEach((el) => {
    el.addEventListener(el === $texto ? 'input' : 'change', aplicarFiltros);
  });

  $limpiar.addEventListener('click', () => {
    $texto.value = '';
    $tipo.value = '';
    $sector.value = '';
    $estrato.value = '';
    aplicarFiltros();
    $texto.focus();
  });

  // La tabla se redibuja al cargar, guardar o borrar: se vuelven a aplicar los filtros.
  new MutationObserver(aplicarFiltros).observe(tbody, { childList: true });

  aplicarFiltros();
})();