/**
 * comparador-pagina.js
 * ------------------------------------------------------------------
 * Página «Comparador de Instituciones y Becas» (comparador.html).
 *
 *  - Lee las instituciones de Supabase (tabla instituciones_educativas).
 *  - Filtra, permite elegir de 1 a 6 y las compara en estrato, cupos,
 *    docentes y estudiantes (barras).
 *  - Muestra las becas (tabla «becas»): resumen por institución, becas
 *    propias de cada una y programas generales.
 *  - La selección se guarda en la dirección (?ids=1,2,3) para poder
 *    compartir o recargar la comparación.
 *
 * Necesita: js/supabaseClient.js (define `supabaseClient`).
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const TABLA_INSTITUCIONES = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  const TABLA_BECAS = window.TABLA_BECAS || 'becas';
  const MAX = 6;
  const COLORES = ['#69b544', '#f5c324', '#4fb3d9', '#e8833a', '#b07cd8', '#dcdcdc'];

  const TIPOS_BECA = {
    academica: 'Académica', socioeconomica: 'Socioeconómica', deportiva: 'Deportiva',
    cultural: 'Cultural', credito: 'Crédito', descuento: 'Descuento', publica: 'Pública', otra: 'Otra',
  };
  const NIVELES = { colegio: 'Colegio', pregrado: 'Pregrado', posgrado: 'Posgrado', todos: 'Todos los niveles' };
  const ESTADOS = {
    abierta: 'Convocatoria abierta', proxima: 'Próxima convocatoria',
    cerrada: 'Cerrada', consultar: 'Consultar vigencia',
  };

  // Programas generales de referencia: solo se usan si la tabla «becas» no existe o está vacía.
  const BECAS_BASE = [
    { id: 'base-1', institucion_id: null, nombre: 'Créditos educativos ICETEX', tipo: 'credito', entidad: 'ICETEX', nivel: 'pregrado',
      cobertura_texto: 'Financiación de estudios de educación superior. Consulta las líneas y condiciones vigentes en el enlace.',
      requisitos: 'Consulta requisitos y convocatoria vigente en el enlace.', estado: 'consultar', enlace: 'https://web.icetex.gov.co/' },
    { id: 'base-2', institucion_id: null, nombre: 'Generación E', tipo: 'socioeconomica', entidad: 'Ministerio de Educación Nacional / ICETEX', nivel: 'pregrado',
      cobertura_texto: 'Apoyo para acceder a la educación superior. Consulta las condiciones vigentes en el enlace.',
      requisitos: 'Consulta requisitos y convocatoria vigente en el enlace.', estado: 'consultar', enlace: 'https://www.mineducacion.gov.co/' },
    { id: 'base-3', institucion_id: null, nombre: 'Becas y apoyos de la Alcaldía de Sabaneta', tipo: 'otra', entidad: 'Alcaldía de Sabaneta', nivel: 'todos',
      cobertura_texto: 'Oferta de apoyos educativos del municipio. Consulta la oferta vigente en la Alcaldía.',
      requisitos: 'Consulta directamente en la Alcaldía de Sabaneta o en sus canales oficiales.', estado: 'consultar', enlace: 'https://sabaneta.gov.co/' },
  ];

  const $ = (id) => document.getElementById(id);
  const ui = {
    buscar: $('cp-buscar'), tipo: $('cp-tipo'), sector: $('cp-sector'), estrato: $('cp-estrato'),
    limpiarFiltros: $('cp-btn-limpiar-filtros'), lista: $('cp-lista'), contador: $('cp-counter'),
    cuenta: $('cp-cuenta'), chips: $('cp-chips'), top3: $('cp-btn-sugeridas'),
    limpiarTodo: $('cp-btn-limpiar'), resultado: $('cp-resultado'),
  };
  if (!ui.resultado || !ui.lista) return;

  // ----------------------------------------------------------------
  // Estado
  // ----------------------------------------------------------------
  let catalogo = [];                 // todas las instituciones
  let filtradas = [];                // las que pasan los filtros
  let elegidas = [];                 // ids elegidos, en orden de elección
  let becas = [];                    // becas activas (o las de referencia)
  let becasDeReferencia = false;     // true si se usan las de BECAS_BASE
  let cargado = false;
  const colorSlot = new Map();       // id -> posición de color (estable mientras esté elegida)
  const abiertas = new Set(['estrato', 'cupos', 'docentes', 'estudiantes', 'becas']);
  const filtroBecas = { tipo: '', ocultarCerradas: false };

  // ----------------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------------
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const fmtNum = (n) => new Intl.NumberFormat('es-CO').format(n);
  const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const etiquetaTipo = (i) => (i.tipo === 'universidad' ? 'Universidad' : 'Colegio');
  const etiquetaSector = (i) => (i.sector === 'publico' ? 'Público' : i.sector === 'privado' ? 'Privado' : '');
  const nombreCorto = (t) => (t.length > 30 ? t.slice(0, 29).trimEnd() + '…' : t);
  const urlSegura = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const porId = (id) => catalogo.find((i) => i.id === id);

  function fecha(txt) {
    const d = new Date(String(txt).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? null : d;
  }
  const fmtFecha = (d) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  function colorDe(id) {
    if (!colorSlot.has(id)) {
      const usados = new Set(colorSlot.values());
      let s = 0;
      while (usados.has(s)) s++;
      colorSlot.set(id, s);
    }
    return COLORES[colorSlot.get(id) % COLORES.length];
  }

  // ----------------------------------------------------------------
  // Carga de datos
  // ----------------------------------------------------------------
  function hayCliente() {
    return typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function';
  }

  async function cargarInstituciones() {
    if (!hayCliente()) throw new Error('No se encontró el cliente de Supabase (js/supabaseClient.js).');
    const pagina = 1000;   // Supabase devuelve como máximo 1000 filas por consulta
    let todo = [];
    for (let desde = 0; ; desde += pagina) {
      const { data, error } = await supabaseClient.from(TABLA_INSTITUCIONES).select('*').order('nombre').range(desde, desde + pagina - 1);
      if (error) throw error;
      todo = todo.concat(data || []);
      if (!data || data.length < pagina) break;
    }
    return todo.map((r) => ({
      id: r.id, nombre: r.nombre || 'Sin nombre', tipo: r.tipo, sector: r.sector, direccion: r.direccion || '',
      estrato: num(r.estrato), cupos_disponibles: num(r.cupos_disponibles),
      num_docentes: num(r.num_docentes), num_estudiantes: num(r.num_estudiantes),
    }));
  }

  async function cargarBecas() {
    try {
      if (!hayCliente()) throw new Error('sin cliente');
      const { data, error } = await supabaseClient.from(TABLA_BECAS).select('*').eq('activa', true);
      if (error) throw error;
      becas = data || [];
    } catch (e) {
      console.warn('[comparador] No se pudo leer la tabla «' + TABLA_BECAS + '». Se muestran los programas generales de referencia.', e && e.message ? e.message : e);
      becas = [];
    }
    becasDeReferencia = becas.length === 0;
    if (becasDeReferencia) becas = BECAS_BASE.slice();
  }

  // ----------------------------------------------------------------
  // Filtros y lista de instituciones
  // ----------------------------------------------------------------
  function aplicarFiltros() {
    const texto = sinTildes(ui.buscar.value.trim());
    const tipo = ui.tipo.value;
    const sector = ui.sector.value;
    const estrato = ui.estrato.value;
    filtradas = catalogo.filter((i) =>
      (!tipo || i.tipo === tipo) &&
      (!sector || i.sector === sector) &&
      (!estrato || i.estrato === Number(estrato)) &&
      (!texto || sinTildes(i.nombre + ' ' + i.direccion).includes(texto)));
  }

  function pintarLista() {
    ui.contador.textContent = filtradas.length + ' de ' + catalogo.length;
    ui.top3.disabled = filtradas.length === 0;
    if (!filtradas.length) {
      ui.lista.innerHTML = '<li class="cp-vacio-li">' + (catalogo.length ? 'Ninguna institución coincide con los filtros.' : 'No hay instituciones registradas.') + '</li>';
      return;
    }
    const lleno = elegidas.length >= MAX;
    ui.lista.innerHTML = filtradas.map((i) => {
      const marcada = elegidas.includes(i.id);
      const detalle = [etiquetaTipo(i), etiquetaSector(i), i.estrato ? 'Estrato ' + i.estrato : ''].filter(Boolean).join(' · ');
      return '<li><label class="' + (marcada ? 'sel' : '') + '"' + (marcada ? ' style="--c:' + colorDe(i.id) + '"' : '') + '>' +
        '<input type="checkbox" value="' + esc(i.id) + '"' + (marcada ? ' checked' : '') + (lleno && !marcada ? ' disabled' : '') + '>' +
        '<span>' + esc(i.nombre) + '<small>' + esc(detalle) + '</small></span></label></li>';
    }).join('');
  }

  // Actualiza las casillas sin reconstruir la lista (así no se pierde la posición del scroll ni el foco).
  function marcarLista() {
    const lleno = elegidas.length >= MAX;
    ui.lista.querySelectorAll('input[type="checkbox"]').forEach((caja) => {
      const id = catalogo.find((i) => String(i.id) === caja.value)?.id;
      const marcada = elegidas.includes(id);
      caja.checked = marcada;
      caja.disabled = lleno && !marcada;
      const label = caja.closest('label');
      label.classList.toggle('sel', marcada);
      if (marcada) label.style.setProperty('--c', colorDe(id)); else label.style.removeProperty('--c');
    });
  }

  function pintarChips() {
    ui.cuenta.textContent = '(' + elegidas.length + '/' + MAX + ')';
    ui.limpiarTodo.disabled = elegidas.length === 0;
    if (!elegidas.length) {
      ui.chips.innerHTML = '<span class="cp-chips-vacio">Aún no has elegido instituciones.</span>';
      return;
    }
    ui.chips.innerHTML = elegidas.map((id) => {
      const i = porId(id);
      if (!i) return '';
      return '<span class="cp-chip-item" style="--chip-color:' + colorDe(id) + '"><i></i>' + esc(nombreCorto(i.nombre)) +
        '<button type="button" data-quitar="' + esc(id) + '" aria-label="Quitar ' + esc(i.nombre) + '">&times;</button></span>';
    }).join('');
  }

  // ----------------------------------------------------------------
  // Selección
  // ----------------------------------------------------------------
  function guardarEnUrl() {
    try {
      const url = new URL(window.location.href);
      if (elegidas.length) url.searchParams.set('ids', elegidas.join(','));
      else url.searchParams.delete('ids');
      window.history.replaceState(null, '', url);
    } catch (e) { /* abierto como archivo o sin historial: no pasa nada */ }
  }

  function cambioSeleccion() {
    for (const id of Array.from(colorSlot.keys())) if (!elegidas.includes(id)) colorSlot.delete(id);
    elegidas.forEach(colorDe);
    guardarEnUrl();
    marcarLista();
    pintarChips();
    pintarResultado();
  }

  function alternar(id, marcar) {
    const esta = elegidas.includes(id);
    if (marcar && !esta && elegidas.length < MAX) elegidas.push(id);
    if (!marcar && esta) elegidas = elegidas.filter((x) => x !== id);
    cambioSeleccion();
  }

  function elegirTop3() {
    const mejores = filtradas.slice().sort((a, b) => (b.num_estudiantes ?? -1) - (a.num_estudiantes ?? -1)).slice(0, 3);
    elegidas = mejores.map((i) => i.id);
    colorSlot.clear();
    cambioSeleccion();
  }

  // ----------------------------------------------------------------
  // Comparación (barras)
  // ----------------------------------------------------------------
  const SECCIONES = [
    { key: 'estrato', titulo: 'Estrato socioeconómico', campo: 'estrato', escala: 6,
      hint: 'Estrato de la zona donde está la institución (escala de 1 a 6).', fmt: (v) => 'Estrato ' + v },
    { key: 'cupos', titulo: 'Cupos disponibles', campo: 'cupos_disponibles',
      hint: 'Cupos disponibles hoy en cada institución.', fmt: fmtNum },
    { key: 'docentes', titulo: 'Docentes', campo: 'num_docentes',
      hint: 'Número de docentes vinculados.', fmt: fmtNum },
    { key: 'estudiantes', titulo: 'Estudiantes matriculados', campo: 'num_estudiantes',
      hint: 'Número de estudiantes matriculados.', fmt: fmtNum },
  ];

  function resumenSeccion(def, filas) {
    const conDato = filas.filter((f) => f.v !== null);
    if (!conDato.length) return 'Sin datos';
    const valores = conDato.map((f) => f.v);
    const max = Math.max(...valores);
    if (def.key === 'estrato') {
      const min = Math.min(...valores);
      return min === max ? 'Estrato <b>' + max + '</b>' : 'Estrato <b>' + min + '</b> a <b>' + max + '</b>';
    }
    const ganadoras = conDato.filter((f) => f.v === max);
    if (conDato.length < 2) return 'Dato de <b>' + esc(nombreCorto(ganadoras[0].i.nombre)) + '</b>: ' + def.fmt(max);
    return ganadoras.length > 1
      ? 'Empate en <b>' + def.fmt(max) + '</b>'
      : 'Mayor: <b>' + esc(nombreCorto(ganadoras[0].i.nombre)) + '</b> · ' + def.fmt(max);
  }

  function htmlSeccion(def, sel) {
    const filas = sel.map((i) => ({ i, v: num(i[def.campo]) }));
    const conDato = filas.filter((f) => f.v !== null);
    const max = def.escala || Math.max(1, ...conDato.map((f) => f.v));
    const top = conDato.length > 1 ? Math.max(...conDato.map((f) => f.v)) : null;
    const orden = filas.slice().sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.i.nombre.localeCompare(b.i.nombre, 'es'));

    const barras = orden.map((f) => {
      const ancho = f.v === null ? 0 : Math.max(2, Math.round((f.v / max) * 100));
      const detalle = [etiquetaTipo(f.i), etiquetaSector(f.i)].filter(Boolean).join(' · ');
      return '<div class="cp-bar-row">' +
        '<div class="cp-inst-name">' + esc(f.i.nombre) + '<small>' + esc(detalle) + '</small></div>' +
        '<div class="cp-bar-track"><i data-w="' + ancho + '" style="--bar-color:' + colorDe(f.i.id) + '"></i></div>' +
        '<div class="cp-bar-value' + (top !== null && f.v === top ? ' cp-bar-value--top' : '') + (f.v === null ? ' cp-bar-value--nd' : '') + '">' +
        (f.v === null ? 'Sin dato' : esc(def.fmt(f.v))) + '</div></div>';
    }).join('');

    return '<details class="cp-card-accordion" data-sec="' + def.key + '"' + (abiertas.has(def.key) ? ' open' : '') + '>' +
      '<summary><span>' + esc(def.titulo) + '</span><span class="cp-sec-resumen">' + resumenSeccion(def, filas) + '</span></summary>' +
      '<div class="cp-bar-container"><p class="cp-metric-hint">' + esc(def.hint) + '</p>' + barras + '</div></details>';
  }

  // ----------------------------------------------------------------
  // Becas
  // ----------------------------------------------------------------
  function estadoReal(b) {
    const cierre = b.fecha_cierre ? fecha(b.fecha_cierre) : null;
    if (cierre && cierre < hoy()) return 'cerrada';
    return ESTADOS[b.estado] ? b.estado : 'consultar';
  }

  function textoEstado(b) {
    const est = estadoReal(b);
    const cierre = b.fecha_cierre ? fecha(b.fecha_cierre) : null;
    if (est === 'abierta' && cierre) {
      const dias = Math.round((cierre - hoy()) / 86400000);
      return 'Abierta · cierra ' + fmtFecha(cierre) + (dias === 0 ? ' (hoy)' : dias === 1 ? ' (mañana)' : ' (faltan ' + dias + ' días)');
    }
    if (est === 'cerrada' && cierre) return 'Cerrada el ' + fmtFecha(cierre);
    return ESTADOS[est];
  }

  function nivelesElegidos() {
    const s = new Set();
    elegidas.forEach((id) => {
      const i = porId(id);
      if (!i) return;
      if (i.tipo === 'universidad') { s.add('pregrado'); s.add('posgrado'); } else s.add('colegio');
    });
    return s;
  }

  function pasaFiltro(b) {
    if (filtroBecas.tipo && b.tipo !== filtroBecas.tipo) return false;
    if (filtroBecas.ocultarCerradas && estadoReal(b) === 'cerrada') return false;
    return true;
  }

  function ordenarBecas(lista) {
    return lista.slice().sort((a, b) => {
      const ea = estadoReal(a) === 'cerrada' ? 1 : 0;
      const eb = estadoReal(b) === 'cerrada' ? 1 : 0;
      return ea - eb || (num(b.cobertura_pct) ?? -1) - (num(a.cobertura_pct) ?? -1) || String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
  }

  function htmlBeca(b) {
    const tipo = TIPOS_BECA[b.tipo] ? b.tipo : 'otra';
    const est = estadoReal(b);
    const pct = num(b.cobertura_pct);
    const enlace = urlSegura(b.enlace);
    const meta = [b.entidad, NIVELES[b.nivel]].filter(Boolean).join(' · ');
    return '<article class="beca-item-card">' +
      '<div>' +
        '<div class="beca-item-head"><h4 class="beca-item-title">' + esc(b.nombre) + '</h4>' +
          '<span class="beca-badge-tag beca-badge-tag--' + tipo + '">' + esc(TIPOS_BECA[tipo]) + '</span></div>' +
        (meta ? '<p class="beca-item-meta">' + esc(meta) + '</p>' : '') +
        (b.cobertura_texto ? '<p class="beca-item-desc">' + esc(b.cobertura_texto) + '</p>' : '') +
        (pct !== null ? '<div class="beca-cobertura" title="Porcentaje que cubre"><span>Cubre</span><div class="cp-bar-track"><i data-w="' + Math.max(2, Math.min(100, pct)) + '" style="--bar-color:var(--accent,#69b544)"></i></div><b>' + fmtNum(pct) + '%</b></div>' : '') +
        (b.requisitos ? '<div class="beca-item-req"><b>Requisitos:</b> ' + esc(b.requisitos) + '</div>' : '') +
      '</div>' +
      '<div class="beca-item-pie"><span class="beca-estado beca-estado--' + est + '">' + esc(textoEstado(b)) + '</span>' +
        (enlace ? '<a class="beca-item-link" href="' + esc(enlace) + '" target="_blank" rel="noopener noreferrer">Más información ↗</a>' : '') +
      '</div></article>';
  }

  function resumenInstitucion(id, lista) {
    const vigentes = lista.filter((b) => estadoReal(b) !== 'cerrada');
    const pcts = lista.map((b) => num(b.cobertura_pct)).filter((v) => v !== null);
    const cierres = vigentes.map((b) => (b.fecha_cierre ? fecha(b.fecha_cierre) : null)).filter((d) => d && d >= hoy()).sort((a, b) => a - b);
    const tipos = Array.from(new Set(lista.map((b) => (TIPOS_BECA[b.tipo] ? b.tipo : 'otra'))));
    return { id, total: lista.length, vigentes: vigentes.length, mayor: pcts.length ? Math.max(...pcts) : null, cierre: cierres[0] || null, tipos };
  }

  function htmlBecas() {
    const sel = elegidas.map(porId).filter(Boolean);
    const niveles = nivelesElegidos();

    const propias = new Map(sel.map((i) => [i.id, ordenarBecas(becas.filter((b) => b.institucion_id === i.id && pasaFiltro(b)))]));
    const generales = ordenarBecas(becas.filter((b) => (b.institucion_id === null || b.institucion_id === undefined) && pasaFiltro(b) &&
      (!sel.length || b.nivel === 'todos' || !b.nivel || niveles.has(b.nivel))));

    const totalVisibles = generales.length + Array.from(propias.values()).reduce((s, l) => s + l.length, 0);
    const abiertasN = generales.concat(...propias.values()).filter((b) => estadoReal(b) === 'abierta').length;

    // Filtros
    const tiposPresentes = Array.from(new Set(becas.map((b) => (TIPOS_BECA[b.tipo] ? b.tipo : 'otra'))));
    const botones = ['<button type="button" class="cp-pill' + (!filtroBecas.tipo ? ' on' : '') + '" data-tipo-beca="" aria-pressed="' + !filtroBecas.tipo + '">Todas</button>']
      .concat(tiposPresentes.map((t) => '<button type="button" class="cp-pill' + (filtroBecas.tipo === t ? ' on' : '') + '" data-tipo-beca="' + t + '" aria-pressed="' + (filtroBecas.tipo === t) + '">' + esc(TIPOS_BECA[t]) + '</button>')).join('');
    const barra = '<div class="becas-toolbar"><div class="cp-pills" role="group" aria-label="Filtrar becas por tipo">' + botones + '</div>' +
      '<label class="cp-check"><input type="checkbox" id="cp-ocultar-cerradas"' + (filtroBecas.ocultarCerradas ? ' checked' : '') + '> Ocultar cerradas</label></div>';

    // Tabla resumen por institución
    let tabla = '';
    if (sel.length) {
      const filas = sel.map((i) => {
        const r = resumenInstitucion(i.id, propias.get(i.id));
        return '<tr><td><span class="cp-punto" style="background:' + colorDe(i.id) + '"></span>' + esc(i.nombre) + '</td>' +
          '<td>' + (r.total ? r.total + (r.vigentes !== r.total ? ' <small>(' + r.vigentes + ' vigentes)</small>' : '') : '<span class="cp-nd">Sin becas registradas</span>') + '</td>' +
          '<td>' + (r.mayor !== null ? fmtNum(r.mayor) + '%' : '<span class="cp-nd">—</span>') + '</td>' +
          '<td>' + (r.cierre ? esc(fmtFecha(r.cierre)) : '<span class="cp-nd">—</span>') + '</td>' +
          '<td>' + (r.tipos.length ? r.tipos.map((t) => '<span class="beca-badge-tag beca-badge-tag--' + t + '">' + esc(TIPOS_BECA[t]) + '</span>').join(' ') : '<span class="cp-nd">—</span>') + '</td></tr>';
      }).join('');
      tabla = '<div class="cp-tabla-wrap"><table class="cp-tabla"><thead><tr><th>Institución</th><th>Becas propias</th><th>Mayor cobertura</th><th>Próximo cierre</th><th>Tipos</th></tr></thead><tbody>' + filas + '</tbody></table></div>';
    }

    // Grupos de tarjetas
    let grupos = '';
    sel.forEach((i) => {
      const lista = propias.get(i.id);
      grupos += '<section class="beca-grupo"><h3 class="beca-grupo__titulo"><span class="cp-punto" style="background:' + colorDe(i.id) + '"></span>' + esc(i.nombre) +
        '<span class="beca-grupo__n">' + lista.length + '</span></h3>' +
        (lista.length ? '<div class="becas-grid-container">' + lista.map(htmlBeca).join('') + '</div>'
          : '<p class="cp-vacio">Esta institución no tiene becas propias registradas' + (filtroBecas.tipo || filtroBecas.ocultarCerradas ? ' con los filtros actuales' : '') + '.</p>') + '</section>';
    });
    grupos += '<section class="beca-grupo"><h3 class="beca-grupo__titulo">Programas generales<span class="beca-grupo__n">' + generales.length + '</span></h3>' +
      '<p class="beca-grupo__nota">Programas nacionales, departamentales o municipales; no dependen de una institución' + (sel.length ? ' y se muestran según el nivel de las que elegiste' : '') + '.</p>' +
      (generales.length ? '<div class="becas-grid-container">' + generales.map(htmlBeca).join('') + '</div>'
        : '<p class="cp-vacio">No hay programas generales con los filtros actuales.</p>') + '</section>';

    const nota = becasDeReferencia
      ? '<p class="cp-nota">Aún no hay becas registradas en la base de datos. Estos son programas generales de referencia; las becas propias de cada institución aparecerán aquí cuando se registren.</p>'
      : '';
    const invitacion = !sel.length ? '<p class="cp-nota">Elige instituciones en la lista de la izquierda para ver sus becas propias y compararlas.</p>' : '';

    return '<details class="cp-card-accordion" data-sec="becas"' + (abiertas.has('becas') ? ' open' : '') + '>' +
      '<summary><span>Becas y convenios</span><span class="cp-sec-resumen"><b>' + totalVisibles + '</b> ' + (totalVisibles === 1 ? 'programa' : 'programas') +
        (abiertasN ? ' · <b>' + abiertasN + '</b> ' + (abiertasN === 1 ? 'abierto' : 'abiertos') : '') + '</span></summary>' +
      '<div class="becas-panel">' + barra + nota + invitacion + tabla + grupos + '</div></details>';
  }

  // ----------------------------------------------------------------
  // Resultado completo
  // ----------------------------------------------------------------
  function pintarResultado() {
    if (!cargado) return;
    const sel = elegidas.map(porId).filter(Boolean);
    let html = '';
    if (!sel.length) {
      html += '<div class="cp-aviso-vacio"><strong>Elige instituciones para compararlas</strong><p>Marca de 2 a ' + MAX + ' instituciones en la lista. También puedes usar «Elegir Top 3» para empezar rápido.</p></div>';
    } else {
      if (sel.length === 1) html += '<p class="cp-nota">Elige al menos una institución más para compararlas entre sí.</p>';
      html += SECCIONES.map((def) => htmlSeccion(def, sel)).join('');
    }
    html += htmlBecas();
    ui.resultado.innerHTML = html;

    // Las barras crecen desde cero para que la transición se note.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ui.resultado.querySelectorAll('i[data-w]').forEach((barra) => { barra.style.width = barra.dataset.w + '%'; });
    }));
  }

  // ----------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------
  function filtrar() { aplicarFiltros(); pintarLista(); }

  ui.buscar.addEventListener('input', filtrar);
  [ui.tipo, ui.sector, ui.estrato].forEach((s) => s.addEventListener('change', filtrar));
  ui.limpiarFiltros.addEventListener('click', () => {
    ui.buscar.value = ''; ui.tipo.value = ''; ui.sector.value = ''; ui.estrato.value = '';
    filtrar();
  });

  ui.lista.addEventListener('change', (e) => {
    const caja = e.target.closest('input[type="checkbox"]');
    if (!caja) return;
    const id = catalogo.find((i) => String(i.id) === caja.value)?.id;
    if (id !== undefined) alternar(id, caja.checked);
  });

  ui.chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    const id = catalogo.find((i) => String(i.id) === b.dataset.quitar)?.id;
    if (id !== undefined) alternar(id, false);
  });

  ui.top3.addEventListener('click', elegirTop3);
  ui.limpiarTodo.addEventListener('click', () => { elegidas = []; colorSlot.clear(); cambioSeleccion(); });

  ui.resultado.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-tipo-beca]');
    if (pill) { filtroBecas.tipo = pill.dataset.tipoBeca; pintarResultado(); return; }
    if (e.target.closest('[data-reintentar]')) iniciar();
  });
  ui.resultado.addEventListener('change', (e) => {
    if (e.target.id === 'cp-ocultar-cerradas') { filtroBecas.ocultarCerradas = e.target.checked; pintarResultado(); }
  });
  // «toggle» no burbujea: se escucha en la fase de captura para recordar qué secciones están abiertas.
  ui.resultado.addEventListener('toggle', (e) => {
    const sec = e.target.dataset && e.target.dataset.sec;
    if (!sec) return;
    if (e.target.open) abiertas.add(sec); else abiertas.delete(sec);
  }, true);

  // ----------------------------------------------------------------
  // Inicio
  // ----------------------------------------------------------------
  function idsDeLaUrl() {
    try {
      const crudo = new URL(window.location.href).searchParams.get('ids');
      if (!crudo) return [];
      return crudo.split(',').map((t) => t.trim()).filter(Boolean)
        .map((t) => catalogo.find((i) => String(i.id) === t)?.id).filter((v) => v !== undefined).slice(0, MAX);
    } catch (e) { return []; }
  }

  async function iniciar() {
    ui.lista.innerHTML = '<li class="cp-vacio-li">Cargando catálogo…</li>';
    ui.resultado.innerHTML = '<div class="cp-aviso-vacio"><p>Cargando comparativa…</p></div>';
    try {
      const [instituciones] = await Promise.all([cargarInstituciones(), cargarBecas()]);
      catalogo = instituciones;
      cargado = true;
      elegidas = idsDeLaUrl().filter((id, k, a) => a.indexOf(id) === k);
      aplicarFiltros();
      elegidas.forEach(colorDe);
      pintarLista();
      pintarChips();
      pintarResultado();
    } catch (error) {
      console.error('[comparador]', error);
      ui.contador.textContent = '0 de 0';
      ui.lista.innerHTML = '<li class="cp-vacio-li">No se pudo cargar el catálogo.</li>';
      ui.resultado.innerHTML = '<div class="cp-aviso-vacio"><strong>No pudimos cargar los datos</strong>' +
        '<p>Revisa tu conexión a internet e inténtalo de nuevo.</p>' +
        '<button type="button" class="cp-btn-action" data-reintentar>Reintentar</button></div>';
    }
  }

  pintarChips();
  iniciar();

  window.ComparadorPagina = { elegir: (ids) => { elegidas = (ids || []).slice(0, MAX); colorSlot.clear(); cambioSeleccion(); } };
})();